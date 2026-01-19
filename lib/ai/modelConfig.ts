// Central config for on-device AI model assets
// Supports multiple model types (LLM, Speech-to-Text) via ExecuTorch .pte format

// Import STT_MODEL_IDS type (defined in sttConfig to avoid circular dependency)
import type { STT_MODEL_IDS } from "./sttConfig";

// =============================================================================
// MODEL SOURCE TYPES
// =============================================================================

// BundledAssetSource can be:
// - A number (Metro bundler module ID from require())
// - An object with uri (filesystem path for large files that aren't bundled)
export type BundledAssetSource =
  | number
  | { uri: string; width?: number; height?: number };

export type ModelSource =
  | { kind: "bundled"; requireId: BundledAssetSource }
  | { kind: "remote"; url: string }
  | { kind: "unavailable"; reason: string }; // For models without PTE files yet

// =============================================================================
// MODEL TYPE DISCRIMINATOR
// =============================================================================

export type ModelType = "llm" | "speech-to-text";

// =============================================================================
// BASE MODEL CONFIG
// =============================================================================

export interface BaseModelConfig {
  modelId: string;
  modelType: ModelType;
  displayName: string;
  description: string;
  size: string; // e.g., "1B", "135M", "75MB"
  folderName: string; // e.g., "llama-3.2-1b-instruct", "whisper-tiny-en"
  huggingFaceUrl?: string; // Link to model card
  available: boolean; // Whether model files are available for download
  isDefault?: boolean; // If true, recommended as the default model for new users
}

// =============================================================================
// LLM MODEL CONFIG
// =============================================================================

export interface LlmModelConfig extends BaseModelConfig {
  modelType: "llm";
  modelId: MODEL_IDS;
  quantization?: string; // e.g., "SpinQuant", "4-bit", "8-bit"
  // Local filenames under the app's sandbox if downloaded
  pteFileName: string;
  tokenizerFileName?: string; // optional depending on export
  tokenizerConfigFileName?: string; // e.g., tokenizer.json
  // Choose one of: bundled require() or a remote URL to download
  pteSource: ModelSource;
  tokenizerSource: ModelSource;
  tokenizerConfigSource: ModelSource;
}

// =============================================================================
// SPEECH-TO-TEXT MODEL CONFIG
// =============================================================================

export interface SpeechToTextModelConfig extends BaseModelConfig {
  modelType: "speech-to-text";
  modelId: STT_MODEL_IDS;
  isMultilingual: boolean;
  // Whisper models have encoder, decoder, and tokenizer
  encoderFileName: string;
  decoderFileName: string;
  tokenizerFileName: string;
  encoderSource: ModelSource;
  decoderSource: ModelSource;
  tokenizerSource: ModelSource;
}

// =============================================================================
// UNIFIED MODEL CONFIG TYPE
// =============================================================================

export type ModelConfig = LlmModelConfig | SpeechToTextModelConfig;

// NOTE: For local development, run `pnpm download:models` to download models to assets/models/
// The config will automatically use bundled sources if files exist, otherwise fall back to remote URLs.

// For local development: check if models exist and use file paths
// Large .pte files are loaded from filesystem at runtime, not bundled by Metro
// This avoids Metro trying to read 2GB+ files into memory

// =============================================================================
// MODEL ID ENUMS
// =============================================================================

export enum MODEL_IDS {
  "smollm2-135m" = "smollm2-135m",
  "smollm2-360m" = "smollm2-360m",
  "smollm2-1.7b" = "smollm2-1.7b",
  "llama-3.2-1b-instruct" = "llama-3.2-1b-instruct",
  "llama-3.2-3b-instruct" = "llama-3.2-3b-instruct",
  "qwen-3-0.6b" = "qwen-3-0.6b",
  "qwen-3-1.7b" = "qwen-3-1.7b",
  "qwen-3-4b" = "qwen-3-4b",
}

// STT_MODEL_IDS is defined in sttConfig.ts to avoid circular dependency
// Re-export it here for convenience
export { STT_MODEL_IDS } from "./sttConfig";

// =============================================================================
// MODEL REGISTRY
// =============================================================================
// All models are from Software Mansion's React Native ExecuTorch repositories
// https://huggingface.co/software-mansion
//
// IMPORTANT: URLs use commit hashes instead of 'main' for stability
// - SmolLM2 models: 639e46227780d93aadc18feff6d63125eec18144
// - Llama models:   76ab87fe4ceb2e00c19a24b18326e9c1506f3f20
// - Qwen models:    ae11f6fb40b8168952970e4dd84285697b5ac069
// This ensures model URLs never break if files are moved/renamed on main branch

// -----------------------------------------------------------------------------
// SMOLLM2 MODELS
// -----------------------------------------------------------------------------
// SmolLM2 models from HuggingFace - excellent for resource-constrained devices
// https://huggingface.co/software-mansion/react-native-executorch-smolLm-2
// Commit hash: 639e46227780d93aadc18feff6d63125eec18144

// SmolLM2 135M - Ultra lightweight for older devices
export const SmolLM2_135M: LlmModelConfig = {
  modelType: "llm",
  modelId: MODEL_IDS["smollm2-135m"],
  displayName: "SmolLM2 135M",
  description: "8K context, ~1GB RAM. Ultra-lightweight for older devices.",
  size: "135M",
  quantization: "8-bit (8da4w)",
  folderName: "smollm2-135m",
  pteFileName: "smolLm2_135M_8da4w.pte",
  tokenizerFileName: "tokenizer.json",
  tokenizerConfigFileName: "tokenizer_config.json",
  huggingFaceUrl:
    "https://huggingface.co/software-mansion/react-native-executorch-smolLm-2",
  available: true,
  pteSource: {
    kind: "remote",
    url: "https://huggingface.co/software-mansion/react-native-executorch-smolLm-2/resolve/639e46227780d93aadc18feff6d63125eec18144/smolLm-2-135M/quantized/smolLm2_135M_8da4w.pte",
  },
  tokenizerSource: {
    kind: "remote",
    url: "https://huggingface.co/software-mansion/react-native-executorch-smolLm-2/resolve/639e46227780d93aadc18feff6d63125eec18144/tokenizer.json",
  },
  tokenizerConfigSource: {
    kind: "remote",
    url: "https://huggingface.co/software-mansion/react-native-executorch-smolLm-2/resolve/639e46227780d93aadc18feff6d63125eec18144/tokenizer_config.json",
  },
};

// SmolLM2 360M - Good balance for older devices
export const SmolLM2_360M: LlmModelConfig = {
  modelType: "llm",
  modelId: MODEL_IDS["smollm2-360m"],
  displayName: "SmolLM2 360M",
  description: "8K context, ~2GB RAM. Good balance for older devices.",
  size: "360M",
  quantization: "8-bit (8da4w)",
  folderName: "smollm2-360m",
  pteFileName: "smolLm2_360M_8da4w.pte",
  tokenizerFileName: "tokenizer.json",
  tokenizerConfigFileName: "tokenizer_config.json",
  huggingFaceUrl:
    "https://huggingface.co/software-mansion/react-native-executorch-smolLm-2",
  available: true,
  pteSource: {
    kind: "remote",
    url: "https://huggingface.co/software-mansion/react-native-executorch-smolLm-2/resolve/639e46227780d93aadc18feff6d63125eec18144/smolLm-2-360M/quantized/smolLm2_360M_8da4w.pte",
  },
  tokenizerSource: {
    kind: "remote",
    url: "https://huggingface.co/software-mansion/react-native-executorch-smolLm-2/resolve/639e46227780d93aadc18feff6d63125eec18144/tokenizer.json",
  },
  tokenizerConfigSource: {
    kind: "remote",
    url: "https://huggingface.co/software-mansion/react-native-executorch-smolLm-2/resolve/639e46227780d93aadc18feff6d63125eec18144/tokenizer_config.json",
  },
};

// SmolLM2 1.7B - Best SmolLM2 quality
export const SmolLM2_1_7B: LlmModelConfig = {
  modelType: "llm",
  modelId: MODEL_IDS["smollm2-1.7b"],
  displayName: "SmolLM2 1.7B",
  description: "8K context, ~4GB RAM. Best SmolLM2 quality.",
  size: "1.7B",
  quantization: "8-bit (8da4w)",
  folderName: "smollm2-1.7b",
  pteFileName: "smolLm2_1_7B_8da4w.pte",
  tokenizerFileName: "tokenizer.json",
  tokenizerConfigFileName: "tokenizer_config.json",
  huggingFaceUrl:
    "https://huggingface.co/software-mansion/react-native-executorch-smolLm-2",
  available: true,
  pteSource: {
    kind: "remote",
    url: "https://huggingface.co/software-mansion/react-native-executorch-smolLm-2/resolve/639e46227780d93aadc18feff6d63125eec18144/smolLm-2-1.7B/quantized/smolLm2_1_7B_8da4w.pte",
  },
  tokenizerSource: {
    kind: "remote",
    url: "https://huggingface.co/software-mansion/react-native-executorch-smolLm-2/resolve/639e46227780d93aadc18feff6d63125eec18144/tokenizer.json",
  },
  tokenizerConfigSource: {
    kind: "remote",
    url: "https://huggingface.co/software-mansion/react-native-executorch-smolLm-2/resolve/639e46227780d93aadc18feff6d63125eec18144/tokenizer_config.json",
  },
};

// -----------------------------------------------------------------------------
// LLAMA 3.2 MODELS
// -----------------------------------------------------------------------------

// Llama 3.2 1B Instruct (SpinQuant)
export const Llama32_1B_Instruct: LlmModelConfig = {
  modelType: "llm",
  modelId: MODEL_IDS["llama-3.2-1b-instruct"],
  displayName: "Llama 3.2 1B Instruct",
  description: "128K context, ~2GB RAM. Fast and multilingual (8 languages).",
  size: "1B",
  quantization: "SpinQuant",
  folderName: "llama-3.2-1b-instruct",
  pteFileName: "llama3_2_spinquant.pte",
  tokenizerFileName: "tokenizer.json",
  tokenizerConfigFileName: "tokenizer_config.json",
  huggingFaceUrl:
    "https://huggingface.co/software-mansion/react-native-executorch-llama-3.2",
  available: true,
  pteSource: {
    kind: "remote",
    url: "https://huggingface.co/software-mansion/react-native-executorch-llama-3.2/resolve/76ab87fe4ceb2e00c19a24b18326e9c1506f3f20/llama-3.2-1B/spinquant/llama3_2_spinquant.pte",
  },
  tokenizerSource: {
    kind: "remote",
    url: "https://huggingface.co/software-mansion/react-native-executorch-llama-3.2/resolve/76ab87fe4ceb2e00c19a24b18326e9c1506f3f20/tokenizer.json",
  },
  tokenizerConfigSource: {
    kind: "remote",
    url: "https://huggingface.co/software-mansion/react-native-executorch-llama-3.2/resolve/76ab87fe4ceb2e00c19a24b18326e9c1506f3f20/tokenizer_config.json",
  },
};

// Llama 3.2 3B Instruct (SpinQuant)
export const Llama32_3B_Instruct: LlmModelConfig = {
  modelType: "llm",
  modelId: MODEL_IDS["llama-3.2-3b-instruct"],
  displayName: "Llama 3.2 3B Instruct",
  description:
    "128K context, ~4GB RAM. Higher quality, multilingual (8 languages).",
  size: "3B",
  quantization: "SpinQuant",
  folderName: "llama-3.2-3b-instruct",
  pteFileName: "llama3_2_3B_spinquant.pte",
  tokenizerFileName: "tokenizer.json",
  tokenizerConfigFileName: "tokenizer_config.json",
  huggingFaceUrl:
    "https://huggingface.co/software-mansion/react-native-executorch-llama-3.2",
  available: true,
  pteSource: {
    kind: "remote",
    url: "https://huggingface.co/software-mansion/react-native-executorch-llama-3.2/resolve/76ab87fe4ceb2e00c19a24b18326e9c1506f3f20/llama-3.2-3B/spinquant/llama3_2_3B_spinquant.pte",
  },
  tokenizerSource: {
    kind: "remote",
    url: "https://huggingface.co/software-mansion/react-native-executorch-llama-3.2/resolve/76ab87fe4ceb2e00c19a24b18326e9c1506f3f20/tokenizer.json",
  },
  tokenizerConfigSource: {
    kind: "remote",
    url: "https://huggingface.co/software-mansion/react-native-executorch-llama-3.2/resolve/76ab87fe4ceb2e00c19a24b18326e9c1506f3f20/tokenizer_config.json",
  },
};

// -----------------------------------------------------------------------------
// QWEN 3 MODELS
// -----------------------------------------------------------------------------

// Qwen 3 0.6B (Quantized) - Lightweight option
// Smallest and fastest option
export const Qwen3_0_6B: LlmModelConfig = {
  modelType: "llm",
  modelId: MODEL_IDS["qwen-3-0.6b"],
  displayName: "Qwen 3 0.6B",
  description: "32K context, ~2GB RAM. Smallest Qwen with fast inference.",
  size: "0.6B",
  quantization: "8-bit (8da4w)",
  folderName: "qwen-3-0.6b",
  pteFileName: "qwen3_0_6b_8da4w.pte",
  tokenizerFileName: "tokenizer.json",
  tokenizerConfigFileName: "tokenizer_config.json",
  huggingFaceUrl:
    "https://huggingface.co/software-mansion/react-native-executorch-qwen-3",
  available: true,
  isDefault: false,
  pteSource: {
    kind: "remote",
    url: "https://huggingface.co/software-mansion/react-native-executorch-qwen-3/resolve/ae11f6fb40b8168952970e4dd84285697b5ac069/qwen-3-0.6B/quantized/qwen3_0_6b_8da4w.pte",
  },
  tokenizerSource: {
    kind: "remote",
    url: "https://huggingface.co/software-mansion/react-native-executorch-qwen-3/resolve/ae11f6fb40b8168952970e4dd84285697b5ac069/tokenizer.json",
  },
  tokenizerConfigSource: {
    kind: "remote",
    url: "https://huggingface.co/software-mansion/react-native-executorch-qwen-3/resolve/ae11f6fb40b8168952970e4dd84285697b5ac069/tokenizer_config.json",
  },
};

// Qwen 3 1.7B (Quantized) - DEFAULT MODEL
// Best balance of quality and performance - recommended for most users
export const Qwen3_1_7B: LlmModelConfig = {
  modelType: "llm",
  modelId: MODEL_IDS["qwen-3-1.7b"],
  displayName: "Qwen 3 1.7B",
  description: "32K context, ~4GB RAM. Best balance of quality and speed.",
  size: "1.7B",
  quantization: "8-bit (8da4w)",
  folderName: "qwen-3-1.7b",
  pteFileName: "qwen3_1_7b_8da4w.pte",
  tokenizerFileName: "tokenizer.json",
  tokenizerConfigFileName: "tokenizer_config.json",
  huggingFaceUrl:
    "https://huggingface.co/software-mansion/react-native-executorch-qwen-3",
  available: true,
  isDefault: true, // Default recommended model for most users
  pteSource: {
    kind: "remote",
    url: "https://huggingface.co/software-mansion/react-native-executorch-qwen-3/resolve/ae11f6fb40b8168952970e4dd84285697b5ac069/qwen-3-1.7B/quantized/qwen3_1_7b_8da4w.pte",
  },
  tokenizerSource: {
    kind: "remote",
    url: "https://huggingface.co/software-mansion/react-native-executorch-qwen-3/resolve/ae11f6fb40b8168952970e4dd84285697b5ac069/tokenizer.json",
  },
  tokenizerConfigSource: {
    kind: "remote",
    url: "https://huggingface.co/software-mansion/react-native-executorch-qwen-3/resolve/ae11f6fb40b8168952970e4dd84285697b5ac069/tokenizer_config.json",
  },
};

// Qwen 3 4B (Quantized)
export const Qwen3_4B: LlmModelConfig = {
  modelType: "llm",
  modelId: MODEL_IDS["qwen-3-4b"],
  displayName: "Qwen 3 4B",
  description: "32K context, ~8GB RAM. Highest quality Qwen for on-device.",
  size: "4B",
  quantization: "8-bit (8da4w)",
  folderName: "qwen-3-4b",
  pteFileName: "qwen3_4b_8da4w.pte",
  tokenizerFileName: "tokenizer.json",
  tokenizerConfigFileName: "tokenizer_config.json",
  huggingFaceUrl:
    "https://huggingface.co/software-mansion/react-native-executorch-qwen-3",
  available: true,
  pteSource: {
    kind: "remote",
    url: "https://huggingface.co/software-mansion/react-native-executorch-qwen-3/resolve/ae11f6fb40b8168952970e4dd84285697b5ac069/qwen-3-4B/quantized/qwen3_4b_8da4w.pte",
  },
  tokenizerSource: {
    kind: "remote",
    url: "https://huggingface.co/software-mansion/react-native-executorch-qwen-3/resolve/ae11f6fb40b8168952970e4dd84285697b5ac069/tokenizer.json",
  },
  tokenizerConfigSource: {
    kind: "remote",
    url: "https://huggingface.co/software-mansion/react-native-executorch-qwen-3/resolve/ae11f6fb40b8168952970e4dd84285697b5ac069/tokenizer_config.json",
  },
};

// =============================================================================
// MODEL REGISTRY ARRAYS
// =============================================================================

// LLM Models (text generation)
export const ALL_LLM_MODELS: LlmModelConfig[] = [
  // Qwen models (8-bit quantized) - Recommended model line for on-device inference
  Qwen3_1_7B, // Default - best balance
  Qwen3_0_6B, // Lightweight option
  Qwen3_4B, // Highest quality
  // Llama models (SpinQuant) - Good multilingual support
  Llama32_1B_Instruct,
  Llama32_3B_Instruct,
  // SmolLM2 models - For resource-constrained/older devices
  SmolLM2_135M, // Ultra-lightweight
  SmolLM2_360M, // Good balance for older devices
  SmolLM2_1_7B, // Best SmolLM2 quality
];

// Speech-to-Text Models (transcription) - configured in sttConfig.ts
// Re-exported here for unified access
export {
  ALL_STT_MODELS,
  DEFAULT_STT_MODEL,
  getSTTModelById,
} from "./sttConfig";

// Legacy alias for backward compatibility
export const ALL_MODELS = ALL_LLM_MODELS;

// =============================================================================
// MODEL LOOKUP HELPERS
// =============================================================================

/**
 * Get an LLM model config by its ID
 */
export function getModelById(modelId: string): LlmModelConfig | undefined {
  return ALL_LLM_MODELS.find((m) => m.modelId === modelId);
}

/**
 * Alias for getModelById - more explicit naming
 */
export function getLLMModelById(modelId: string): LlmModelConfig | undefined {
  return getModelById(modelId);
}

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 * Check if a model config is an LLM model
 */
export function isLLMModel(model: ModelConfig): model is LlmModelConfig {
  return model.modelType === "llm";
}

/**
 * Check if a model config is a Speech-to-Text model
 */
export function isSTTModel(
  model: ModelConfig,
): model is SpeechToTextModelConfig {
  return model.modelType === "speech-to-text";
}

// =============================================================================
// DEFAULTS
// =============================================================================

// Default LLM model - best balance of quality and performance for most devices
export const DEFAULT_MODEL = Qwen3_1_7B;
export const DEFAULT_LLM_MODEL = Qwen3_1_7B;

// =============================================================================
// SYSTEM PROMPTS
// =============================================================================

/**
 * Default system prompt for AI conversations
 * Note: /no_think suffix disables reasoning mode for Qwen models
 */
export const DEFAULT_SYSTEM_PROMPT =
  "/no_think You're a thoughtful, AI assistant is both concise and thorough. When unsure about the user's intentions you should clarify. When unsure about a fact, you should indicate so. You should not present bias in your answers politically. Your answers should be well balanced, truthful, and informative.";
