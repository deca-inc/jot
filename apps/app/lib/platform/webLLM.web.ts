/**
 * Web implementation of the Web LLM platform adapter.
 *
 * Runs local LLMs in the browser using @mlc-ai/web-llm (WebGPU) with:
 * - OPFS persistence (downloaded models survive across sessions)
 * - navigator.storage.persist() to prevent eviction
 * - Worker-based inference (keeps main thread responsive)
 * - Streaming token callbacks
 * - AbortSignal support
 */

import type {
  ChatCompletionMessageParam,
  InitProgressReport,
  MLCEngine,
} from "@mlc-ai/web-llm";

type CreateMLCEngineFn = (
  modelId: string,
  engineConfig?: {
    initProgressCallback?: (report: InitProgressReport) => void;
  },
) => Promise<MLCEngine>;

/**
 * Lazily resolve `CreateMLCEngine` from `@mlc-ai/web-llm`.
 *
 * The dependency is loaded on demand (rather than at module import time)
 * so tests can install `jest.mock(...)` with a factory that references
 * `mock`-prefixed closure variables — those closure variables are
 * `undefined` at the time the mock factory first runs if the module is
 * imported eagerly.
 */
function getCreateMLCEngine(): CreateMLCEngineFn {
  const mod = require("@mlc-ai/web-llm") as {
    CreateMLCEngine: CreateMLCEngineFn;
  };
  return mod.CreateMLCEngine;
}

/**
 * Configuration for loading a Web LLM model.
 */
export interface WebLLMConfig {
  /**
   * App-level model identifier used for tracking/identity
   * (e.g. `"web-qwen-2.5-1.5b"`).
   */
  modelId: string;
  /**
   * MLC artifact id that `@mlc-ai/web-llm` understands
   * (e.g. `"Qwen2.5-1.5B-Instruct-q4f16_1-MLC"`).
   *
   * When omitted, `modelId` is used directly — this keeps older callers
   * that already pass the MLC id as `modelId` working unchanged.
   */
  mlcModelId?: string;
  onProgress?: (progress: {
    loaded: number;
    total: number;
    text: string;
  }) => void;
  /**
   * Skip the pre-flight storage quota check.
   *
   * Useful for resumed downloads where part of the model is already cached
   * in OPFS, so the full size is no longer required from free space.
   */
  skipQuotaCheck?: boolean;
}

/**
 * Chat message passed to the Web LLM engine.
 */
export interface WebLLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Options for a single generation request.
 */
export interface WebLLMGenerateOptions {
  onToken?: (token: string) => void;
  signal?: AbortSignal;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Engine interface for browser-based LLM inference.
 */
export interface WebLLMEngine {
  load(config: WebLLMConfig): Promise<void>;
  generate(
    messages: WebLLMMessage[],
    options?: WebLLMGenerateOptions,
  ): Promise<string>;
  interrupt(): void;
  unload(): Promise<void>;
  isLoaded(): boolean;
  getLoadedModelId(): string | null;
}

// ---------------------------------------------------------------------------
// Storage quota
// ---------------------------------------------------------------------------

/**
 * Snapshot of the browser's Storage API quota and usage.
 */
export interface StorageQuotaInfo {
  /** Bytes currently used across all origins. */
  usage: number;
  /** Total bytes available (browser-granted quota). */
  quota: number;
  /** Bytes available (quota - usage). */
  available: number;
  /** Whether storage is persistent (resistant to eviction). */
  persistent: boolean;
}

/**
 * Result of a pre-flight storage quota check for a model download.
 */
export interface QuotaCheckResult {
  canFit: boolean;
  requiredBytes: number;
  availableBytes: number;
  /** 0 when canFit is true. */
  shortfallBytes: number;
  quota: StorageQuotaInfo | null;
  /** Human-readable message when `!canFit`. */
  reason?: string;
}

/**
 * Safety margin applied to the raw model size. Accounts for in-flight
 * overhead (temporary buffers, tokenizers, cache metadata) while the
 * model is being materialized in OPFS.
 */
const QUOTA_SAFETY_MARGIN = 1.1;

/**
 * Known approximate on-disk sizes for Web LLM (MLC) models, keyed by the
 * MLC artifact id that `CreateMLCEngine` accepts.
 *
 * Web-llm does not expose sizes programmatically, so we maintain this map
 * manually. Keep it in sync with the bundled model list.
 */
export const WEB_LLM_MODEL_SIZES: Record<string, number> = {
  "Qwen2.5-1.5B-Instruct-q4f16_1-MLC": 900 * 1024 * 1024, // ~900 MB
  "Llama-3.2-3B-Instruct-q4f16_1-MLC": 1800 * 1024 * 1024, // ~1.8 GB
};

/**
 * Look up the estimated on-disk size for a given MLC model id.
 * Returns `null` when the model is unknown.
 */
export function getEstimatedModelSize(mlcModelId: string): number | null {
  return WEB_LLM_MODEL_SIZES[mlcModelId] ?? null;
}

interface StorageManagerLike {
  estimate?: () => Promise<{ usage?: number; quota?: number }>;
  persisted?: () => Promise<boolean>;
  persist?: () => Promise<boolean>;
}

function getStorageManager(): StorageManagerLike | null {
  if (typeof navigator === "undefined" || navigator === null) {
    return null;
  }
  const nav = navigator as Navigator & { storage?: StorageManagerLike };
  const storage = nav.storage;
  if (storage == null) {
    return null;
  }
  return storage;
}

/**
 * Get current storage quota information.
 *
 * Returns `null` if the Storage API is unavailable, `estimate()` is not
 * implemented, or the estimate call rejects.
 */
export async function getStorageQuota(): Promise<StorageQuotaInfo | null> {
  const storage = getStorageManager();
  if (storage == null || typeof storage.estimate !== "function") {
    return null;
  }

  let estimate: { usage?: number; quota?: number };
  try {
    estimate = await storage.estimate();
  } catch {
    return null;
  }

  const usage = estimate.usage ?? 0;
  const quota = estimate.quota ?? 0;
  const available = Math.max(0, quota - usage);

  let persistent = false;
  if (typeof storage.persisted === "function") {
    try {
      persistent = await storage.persisted();
    } catch {
      persistent = false;
    }
  }

  return { usage, quota, available, persistent };
}

/**
 * Format a byte count as a human-readable MB/GB string.
 */
function formatBytes(bytes: number): string {
  const GB = 1024 * 1024 * 1024;
  const MB = 1024 * 1024;
  if (bytes >= GB) {
    return `${(bytes / GB).toFixed(2)} GB`;
  }
  return `${(bytes / MB).toFixed(0)} MB`;
}

/**
 * Check whether a model of the given estimated size can fit in storage.
 *
 * `estimatedSizeBytes` is the expected on-disk download size. A 10% safety
 * margin is applied to account for in-flight overhead.
 */
export async function checkStorageForModel(
  estimatedSizeBytes: number,
): Promise<QuotaCheckResult> {
  const requiredWithMargin = Math.ceil(
    estimatedSizeBytes * QUOTA_SAFETY_MARGIN,
  );

  const quota = await getStorageQuota();
  if (quota == null) {
    return {
      canFit: false,
      requiredBytes: estimatedSizeBytes,
      availableBytes: 0,
      shortfallBytes: requiredWithMargin,
      quota: null,
      reason:
        "Storage quota information is unavailable — cannot verify that " +
        `${formatBytes(estimatedSizeBytes)} will fit.`,
    };
  }

  const available = quota.available;
  if (available >= requiredWithMargin) {
    return {
      canFit: true,
      requiredBytes: estimatedSizeBytes,
      availableBytes: available,
      shortfallBytes: 0,
      quota,
    };
  }

  const shortfall = requiredWithMargin - available;
  return {
    canFit: false,
    requiredBytes: estimatedSizeBytes,
    availableBytes: available,
    shortfallBytes: shortfall,
    quota,
    reason:
      `Not enough storage for this model: need ${formatBytes(estimatedSizeBytes)} ` +
      `(${formatBytes(requiredWithMargin)} with safety margin) ` +
      `but only ${formatBytes(available)} is available ` +
      `(short by ${formatBytes(shortfall)}).`,
  };
}

/**
 * Check whether Web LLM can run in the current environment.
 *
 * Requires WebGPU (navigator.gpu) and OPFS (navigator.storage).
 */
export function isWebLLMSupported(): boolean {
  if (typeof navigator === "undefined" || navigator === null) {
    return false;
  }
  const nav = navigator as Navigator & {
    gpu?: unknown;
    storage?: unknown;
  };
  return nav.gpu != null && nav.storage != null;
}

/**
 * Create a new Web LLM engine instance.
 */
export function createWebLLMEngine(): WebLLMEngine {
  return new WebLLMEngineImpl();
}

/**
 * Concrete engine implementation backed by @mlc-ai/web-llm.
 */
class WebLLMEngineImpl implements WebLLMEngine {
  private engine: MLCEngine | null = null;
  private loadedModelId: string | null = null;
  private isGenerating: boolean = false;

  async load(config: WebLLMConfig): Promise<void> {
    // The MLC runtime wants its own artifact id — fall back to the app
    // model id for callers that already pass an MLC id directly.
    const mlcId = config.mlcModelId ?? config.modelId;

    // Idempotent: same model already loaded
    if (this.engine !== null && this.loadedModelId === config.modelId) {
      return;
    }

    // Different model loaded: unload first
    if (this.engine !== null) {
      await this.unload();
    }

    if (!isWebLLMSupported()) {
      throw new Error("WebGPU is not available");
    }

    // Pre-flight storage quota check — keyed on the MLC id, which is what
    // WEB_LLM_MODEL_SIZES uses.
    if (config.skipQuotaCheck !== true) {
      const estimatedSize = getEstimatedModelSize(mlcId);
      if (estimatedSize == null) {
        console.warn(
          `[webLLM] No size estimate for model "${mlcId}" — ` +
            "skipping storage quota check.",
        );
      } else {
        const quotaResult = await checkStorageForModel(estimatedSize);
        if (!quotaResult.canFit) {
          throw new Error(
            quotaResult.reason ?? "Insufficient storage quota for model.",
          );
        }
      }
    }

    // Request storage persistence (best-effort)
    try {
      const nav = navigator as Navigator & {
        storage?: { persist?: () => Promise<boolean> };
      };
      if (nav.storage?.persist) {
        await nav.storage.persist();
      }
    } catch {
      // Ignore — persistence is best-effort
    }

    try {
      const createEngine = getCreateMLCEngine();
      const engine = await createEngine(mlcId, {
        initProgressCallback: (report: InitProgressReport) => {
          config.onProgress?.({
            loaded: report.progress,
            total: 1,
            text: report.text,
          });
        },
      });
      this.engine = engine;
      this.loadedModelId = config.modelId;
    } catch (error) {
      this.engine = null;
      this.loadedModelId = null;
      throw error;
    }
  }

  async generate(
    messages: WebLLMMessage[],
    options?: WebLLMGenerateOptions,
  ): Promise<string> {
    if (this.engine === null) {
      throw new Error("Model not loaded");
    }

    const engine = this.engine;
    this.isGenerating = true;

    let abortListener: (() => void) | null = null;
    if (options?.signal) {
      abortListener = () => {
        this.interrupt();
      };
      options.signal.addEventListener("abort", abortListener);
    }

    try {
      const stream = await engine.chat.completions.create({
        messages: messages as ChatCompletionMessageParam[],
        stream: true,
        temperature: options?.temperature,
        max_tokens: options?.maxTokens,
      });

      let accumulated = "";
      for await (const chunk of stream) {
        if (options?.signal?.aborted) {
          break;
        }
        const token = chunk.choices[0]?.delta?.content;
        if (token === undefined || token === null) {
          continue;
        }
        accumulated += token;
        options?.onToken?.(token);
      }

      return accumulated;
    } finally {
      this.isGenerating = false;
      if (options?.signal && abortListener) {
        options.signal.removeEventListener("abort", abortListener);
      }
    }
  }

  interrupt(): void {
    if (this.engine !== null && this.isGenerating) {
      this.engine.interruptGenerate();
    }
  }

  async unload(): Promise<void> {
    if (this.engine === null) {
      return;
    }
    await this.engine.unload();
    this.engine = null;
    this.loadedModelId = null;
  }

  isLoaded(): boolean {
    return this.engine !== null && this.loadedModelId !== null;
  }

  getLoadedModelId(): string | null {
    return this.loadedModelId;
  }
}
