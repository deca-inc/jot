/**
 * Tauri implementation of the Tauri LLM platform adapter.
 *
 * Runs local LLMs via native Rust inference (mistralrs) exposed through
 * Tauri's `invoke()` IPC with streaming via Tauri Channels.
 *
 * Flow:
 * - `load`   -> invoke `llm_load`   with a Channel<ProgressEvent>
 * - `generate` -> invoke `llm_generate` with a Channel<TokenEvent>
 * - `interrupt` -> invoke `llm_interrupt`
 * - `unload` -> invoke `llm_unload`
 *
 * The webview loads the same web bundle as the browser, so this file is
 * resolved by Metro/webpack in both environments. Callers must gate usage
 * behind `isTauri()` at runtime.
 */

// `Channel` lives in `@tauri-apps/api/core` at the type level, but Tauri's
// runtime also exposes the `core` module's members on the root package.
// We import it from the root to keep the mock surface minimal at test time.
// @ts-expect-error -- `@tauri-apps/api` root does not publish Channel in its
// type surface, but it is reachable at runtime via the re-exported `core`
// module. Tests mock it at this path via a virtual jest.mock.
import { Channel } from "@tauri-apps/api";
import { invoke } from "@tauri-apps/api/core";

/**
 * Configuration for loading a Tauri LLM model from disk.
 */
export interface TauriLLMConfig {
  /** Absolute path to the `.gguf` model file on disk. */
  modelPath: string;
  /** Human-readable model identifier. */
  modelId: string;
  /** Context window size (default 4096). */
  contextSize?: number;
  /** Progress callback during model loading. */
  onProgress?: (progress: {
    loaded: number;
    total: number;
    text: string;
  }) => void;
}

/**
 * Chat message passed to the Tauri LLM engine.
 */
export interface TauriLLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Options for a single generation request.
 */
export interface TauriLLMGenerateOptions {
  onToken?: (token: string) => void;
  signal?: AbortSignal;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Engine interface for Tauri-based LLM inference.
 */
export interface TauriLLMEngine {
  load(config: TauriLLMConfig): Promise<void>;
  generate(
    messages: TauriLLMMessage[],
    options?: TauriLLMGenerateOptions,
  ): Promise<string>;
  interrupt(): Promise<void>;
  unload(): Promise<void>;
  isLoaded(): boolean;
  getLoadedModelId(): string | null;
}

/**
 * Streaming progress event emitted by the Rust side while a model is loading.
 */
interface ProgressEvent {
  loaded: number;
  total: number;
  text: string;
}

/**
 * Streaming token event emitted by the Rust side during generation.
 */
interface TokenEvent {
  token: string;
}

const DEFAULT_CONTEXT_SIZE = 4096;

/**
 * Create a new Tauri LLM engine instance.
 */
export function createTauriLLMEngine(): TauriLLMEngine {
  return new TauriLLMEngineImpl();
}

/**
 * Concrete engine implementation backed by Tauri's `invoke()` IPC and
 * streaming Channels to native Rust mistralrs inference.
 */
class TauriLLMEngineImpl implements TauriLLMEngine {
  private loadedModelId: string | null = null;
  private isGenerating = false;

  async load(config: TauriLLMConfig): Promise<void> {
    // No-op if the same model is already loaded.
    if (this.loadedModelId === config.modelId) {
      return;
    }

    // Switch models: unload the previous one first.
    if (this.loadedModelId !== null) {
      await this.unload();
    }

    const channel = new Channel<ProgressEvent>();
    if (config.onProgress) {
      const onProgress = config.onProgress;
      channel.onmessage = (event: ProgressEvent) => {
        onProgress({
          loaded: event.loaded,
          total: event.total,
          text: event.text,
        });
      };
    }

    await invoke("llm_load", {
      modelPath: config.modelPath,
      modelId: config.modelId,
      contextSize: config.contextSize ?? DEFAULT_CONTEXT_SIZE,
      onProgress: channel,
    });

    this.loadedModelId = config.modelId;
  }

  async generate(
    messages: TauriLLMMessage[],
    options?: TauriLLMGenerateOptions,
  ): Promise<string> {
    if (this.loadedModelId === null) {
      throw new Error("Model not loaded");
    }

    this.isGenerating = true;
    try {
      let accumulated = "";
      const channel = new Channel<TokenEvent>();
      const onToken = options?.onToken;
      channel.onmessage = (event: TokenEvent) => {
        accumulated += event.token;
        onToken?.(event.token);
      };

      // Wire AbortSignal -> interrupt (fire and forget).
      const signal = options?.signal;
      const onAbort = () => {
        void this.interrupt();
      };
      if (signal) {
        if (signal.aborted) {
          onAbort();
        } else {
          signal.addEventListener("abort", onAbort, { once: true });
        }
      }

      try {
        const response = await invoke<string>("llm_generate", {
          messages,
          maxTokens: options?.maxTokens,
          temperature: options?.temperature,
          onToken: channel,
        });
        return typeof response === "string" && response.length > 0
          ? response
          : accumulated;
      } finally {
        if (signal) {
          signal.removeEventListener("abort", onAbort);
        }
      }
    } finally {
      this.isGenerating = false;
    }
  }

  async interrupt(): Promise<void> {
    try {
      await invoke("llm_interrupt", {});
    } catch {
      // Best-effort: interrupt is advisory. Swallow errors.
    }
  }

  async unload(): Promise<void> {
    if (this.loadedModelId === null) {
      return;
    }
    await invoke("llm_unload", {});
    this.loadedModelId = null;
  }

  isLoaded(): boolean {
    return this.loadedModelId !== null;
  }

  getLoadedModelId(): string | null {
    return this.loadedModelId;
  }
}
