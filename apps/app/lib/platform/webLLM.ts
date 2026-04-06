/**
 * Platform abstraction for web-llm (native stub)
 *
 * Web LLM runs local LLMs in the browser via WebGPU (@mlc-ai/web-llm).
 * On native platforms (iOS/Android/macOS), on-device inference is
 * handled by executorch instead — so this module throws.
 *
 * On web, the .web.ts version is loaded instead via Metro/webpack resolution.
 */

/**
 * Configuration for loading a Web LLM model.
 */
export interface WebLLMConfig {
  modelId: string;
  onProgress?: (progress: {
    loaded: number;
    total: number;
    text: string;
  }) => void;
  /**
   * Skip the pre-flight storage quota check. No-op on native.
   */
  skipQuotaCheck?: boolean;
}

/**
 * Snapshot of the browser's Storage API quota and usage.
 * Not available on native platforms.
 */
export interface StorageQuotaInfo {
  usage: number;
  quota: number;
  available: number;
  persistent: boolean;
}

/**
 * Result of a pre-flight storage quota check for a model download.
 */
export interface QuotaCheckResult {
  canFit: boolean;
  requiredBytes: number;
  availableBytes: number;
  shortfallBytes: number;
  quota: StorageQuotaInfo | null;
  reason?: string;
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

/**
 * Create a new Web LLM engine instance.
 *
 * On native this throws immediately — use executorch instead.
 */
export function createWebLLMEngine(): WebLLMEngine {
  throw new Error("Web LLM is not available on native platforms");
}

/**
 * Check whether Web LLM can run in the current environment.
 *
 * On native this always returns false.
 */
export function isWebLLMSupported(): boolean {
  return false;
}

/**
 * Known model sizes map. Empty on native — Web LLM does not run here.
 */
export const WEB_LLM_MODEL_SIZES: Record<string, number> = {};

/**
 * Look up the estimated on-disk size for a given MLC model id.
 * Always returns `null` on native.
 */
export function getEstimatedModelSize(_mlcModelId: string): number | null {
  return null;
}

/**
 * Get current storage quota information.
 * Always returns `null` on native.
 */
export async function getStorageQuota(): Promise<StorageQuotaInfo | null> {
  return null;
}

/**
 * Check whether a model of the given estimated size can fit in storage.
 * On native this always reports canFit=false with a descriptive reason.
 */
export async function checkStorageForModel(
  estimatedSizeBytes: number,
): Promise<QuotaCheckResult> {
  return {
    canFit: false,
    requiredBytes: estimatedSizeBytes,
    availableBytes: 0,
    shortfallBytes: estimatedSizeBytes,
    quota: null,
    reason: "Web LLM is not available on native platforms.",
  };
}
