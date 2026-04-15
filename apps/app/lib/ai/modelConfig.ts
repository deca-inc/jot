// Central config for on-device AI model assets
// Supports multiple model types (LLM, Speech-to-Text) via ExecuTorch .pte format

// Inline AppPlatform type to avoid circular import with platformFilter
// (platformFilter imports LlmModelConfig from this module)
export type AppPlatform = "ios" | "android" | "macos" | "web" | "tauri";

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
  deprecated?: boolean; // If true, hidden from UI unless already downloaded
}

// =============================================================================
// LLM MODEL CONFIG
// =============================================================================

export interface LlmModelConfig extends BaseModelConfig {
  modelType: "llm";
  // Widened to `string` (was `MODEL_IDS`) so web-* and desktop-* prefixed IDs
  // can coexist with the built-in mobile enum without bloating it.
  modelId: string;
  quantization?: string; // e.g., "SpinQuant", "4-bit", "8-bit"
  // Local filenames under the app's sandbox if downloaded
  pteFileName: string;
  tokenizerFileName?: string; // optional depending on export
  tokenizerConfigFileName?: string; // e.g., tokenizer.json
  // Choose one of: bundled require() or a remote URL to download
  pteSource: ModelSource;
  tokenizerSource: ModelSource;
  tokenizerConfigSource: ModelSource;
  // Which platforms this model runs on. Legacy models without this field
  // are treated as mobile-only (ios/android) — see platformFilter.ts.
  supportedPlatforms?: AppPlatform[];
  /**
   * Logical model family identifier, groups platform variants of the same base model.
   * E.g. "llama-3.2-3b" applies to mobile .pte, web MLC, and desktop GGUF variants.
   * Used for cross-platform persona resolution.
   */
  modelFamily?: string;
}

// =============================================================================
// SPEECH-TO-TEXT MODEL CONFIG
// =============================================================================

export type SttRuntime = "executorch" | "sherpa-onnx" | "whisper-cpp";

/**
 * A file to download for a model. Used by sherpa-onnx models that need
 * multiple files in a single directory (preprocess, encode, decode, tokens).
 */
export interface ModelFile {
  fileName: string;
  source: ModelSource;
}

export interface SpeechToTextModelConfig extends BaseModelConfig {
  modelType: "speech-to-text";
  // Widened to `string` (was `STT_MODEL_IDS`) so desktop whisper-rs model
  // IDs can coexist with the built-in mobile enum without bloating it.
  modelId: string;
  isMultilingual: boolean;
  /** Which STT runtime this model uses. Defaults to "executorch" for backward compat. */
  runtime?: SttRuntime;
  /** sherpa-onnx model type hint (e.g. "moonshine", "whisper", "auto") */
  sttModelType?: string;
  // Whisper/ExecuTorch models have encoder, decoder, and tokenizer.
  // For whisper.cpp (desktop), only encoderFileName is used as the single
  // model file; decoder and tokenizer are built into whisper.cpp.
  encoderFileName: string;
  decoderFileName: string;
  tokenizerFileName: string;
  encoderSource: ModelSource;
  decoderSource: ModelSource;
  tokenizerSource: ModelSource;
  /** Additional files to download (used by sherpa-onnx models). */
  extraFiles?: ModelFile[];
  // Which platforms this model runs on. Legacy models without this field
  // are treated as mobile-only (ios/android) — see platformFilter.ts.
  supportedPlatforms?: AppPlatform[];
  /**
   * Logical model family identifier, groups platform variants of the same
   * base model. Used for cross-platform resolution.
   */
  modelFamily?: string;
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
  modelFamily: "smollm2-135m",
  huggingFaceUrl:
    "https://huggingface.co/software-mansion/react-native-executorch-smolLm-2",
  available: true,
  supportedPlatforms: ["ios", "android"],
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
  modelFamily: "smollm2-360m",
  huggingFaceUrl:
    "https://huggingface.co/software-mansion/react-native-executorch-smolLm-2",
  available: true,
  supportedPlatforms: ["ios", "android"],
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
  modelFamily: "smollm2-1.7b",
  huggingFaceUrl:
    "https://huggingface.co/software-mansion/react-native-executorch-smolLm-2",
  available: true,
  supportedPlatforms: ["ios", "android"],
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
  modelFamily: "llama-3.2-1b",
  huggingFaceUrl:
    "https://huggingface.co/software-mansion/react-native-executorch-llama-3.2",
  available: true,
  supportedPlatforms: ["ios", "android"],
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
  modelFamily: "llama-3.2-3b",
  huggingFaceUrl:
    "https://huggingface.co/software-mansion/react-native-executorch-llama-3.2",
  available: true,
  supportedPlatforms: ["ios", "android"],
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
  modelFamily: "qwen-3-0.6b",
  huggingFaceUrl:
    "https://huggingface.co/software-mansion/react-native-executorch-qwen-3",
  available: true,
  isDefault: false,
  supportedPlatforms: ["ios", "android"],
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
  modelFamily: "qwen-3-1.7b",
  huggingFaceUrl:
    "https://huggingface.co/software-mansion/react-native-executorch-qwen-3",
  available: true,
  isDefault: true, // Default recommended model for most users
  supportedPlatforms: ["ios", "android"],
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
  modelFamily: "qwen-3-4b",
  huggingFaceUrl:
    "https://huggingface.co/software-mansion/react-native-executorch-qwen-3",
  available: true,
  supportedPlatforms: ["ios", "android"],
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

// -----------------------------------------------------------------------------
// WEB LLM MODELS (MLC-compiled, WebGPU via @mlc-ai/web-llm)
// -----------------------------------------------------------------------------
// These are not .pte files — the `pteSource.url` holds the MLC artifact ID
// that the web-llm runtime resolves internally.

export const WebQwen25_1_5B: LlmModelConfig = {
  modelType: "llm",
  modelId: "web-qwen-2.5-1.5b",
  displayName: "Qwen 2.5 1.5B (Web)",
  description: "1.5B params, ~900MB. Fast WebGPU inference in-browser.",
  size: "1.5B",
  quantization: "q4f16_1",
  folderName: "web-qwen-2.5-1.5b",
  pteFileName: "", // unused for web
  tokenizerFileName: undefined,
  tokenizerConfigFileName: undefined,
  modelFamily: "qwen-2.5-1.5b",
  huggingFaceUrl:
    "https://huggingface.co/mlc-ai/Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
  available: true,
  supportedPlatforms: ["web"],
  pteSource: {
    kind: "remote",
    url: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
  },
  tokenizerSource: { kind: "unavailable", reason: "Handled by web-llm" },
  tokenizerConfigSource: { kind: "unavailable", reason: "Handled by web-llm" },
};

export const WebLlama32_3B: LlmModelConfig = {
  modelType: "llm",
  modelId: "web-llama-3.2-3b",
  displayName: "Llama 3.2 3B (Web)",
  description: "3B params, ~1.8GB. Higher-quality WebGPU inference.",
  size: "3B",
  quantization: "q4f16_1",
  folderName: "web-llama-3.2-3b",
  pteFileName: "",
  tokenizerFileName: undefined,
  tokenizerConfigFileName: undefined,
  modelFamily: "llama-3.2-3b",
  huggingFaceUrl:
    "https://huggingface.co/mlc-ai/Llama-3.2-3B-Instruct-q4f16_1-MLC",
  available: true,
  supportedPlatforms: ["web"],
  pteSource: {
    kind: "remote",
    url: "Llama-3.2-3B-Instruct-q4f16_1-MLC",
  },
  tokenizerSource: { kind: "unavailable", reason: "Handled by web-llm" },
  tokenizerConfigSource: { kind: "unavailable", reason: "Handled by web-llm" },
};

// -----------------------------------------------------------------------------
// DESKTOP GGUF MODELS (mistralrs via Tauri, Metal/CUDA/CPU)
// -----------------------------------------------------------------------------
// Tokenizer is embedded in the GGUF file, so tokenizer sources are unavailable.

export const DesktopQwen25_1_5B: LlmModelConfig = {
  modelType: "llm",
  modelId: "desktop-qwen-2.5-1.5b",
  displayName: "Qwen 2.5 1.5B (Desktop)",
  description: "1.5B params, ~900MB GGUF. Metal/CUDA accelerated.",
  size: "1.5B",
  quantization: "Q4_K_M",
  folderName: "desktop-qwen-2.5-1.5b",
  pteFileName: "qwen2.5-1.5b-instruct-q4_k_m.gguf",
  tokenizerFileName: undefined,
  tokenizerConfigFileName: undefined,
  modelFamily: "qwen-2.5-1.5b",
  huggingFaceUrl: "https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF",
  available: true,
  supportedPlatforms: ["tauri", "macos"],
  pteSource: {
    kind: "remote",
    url: "https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf",
  },
  tokenizerSource: { kind: "unavailable", reason: "Embedded in GGUF" },
  tokenizerConfigSource: { kind: "unavailable", reason: "Embedded in GGUF" },
};

export const DesktopLlama32_3B: LlmModelConfig = {
  modelType: "llm",
  modelId: "desktop-llama-3.2-3b",
  displayName: "Llama 3.2 3B (Desktop)",
  description: "3B params, ~2GB GGUF. Metal/CUDA accelerated, higher quality.",
  size: "3B",
  quantization: "Q4_K_M",
  folderName: "desktop-llama-3.2-3b",
  pteFileName: "llama-3.2-3b-instruct-q4_k_m.gguf",
  tokenizerFileName: undefined,
  tokenizerConfigFileName: undefined,
  modelFamily: "llama-3.2-3b",
  huggingFaceUrl: "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF",
  available: true,
  supportedPlatforms: ["tauri", "macos"],
  pteSource: {
    kind: "remote",
    url: "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf",
  },
  tokenizerSource: { kind: "unavailable", reason: "Embedded in GGUF" },
  tokenizerConfigSource: { kind: "unavailable", reason: "Embedded in GGUF" },
};

// desktop-llama-3.2-1b (cross-platform sibling of mobile llama-3.2-1b-instruct)
export const DesktopLlama32_1B: LlmModelConfig = {
  modelType: "llm",
  modelId: "desktop-llama-3.2-1b",
  displayName: "Llama 3.2 1B (Desktop)",
  description: "1B params, ~700MB GGUF. Fast Metal/CUDA inference.",
  size: "1B",
  quantization: "Q4_K_M",
  folderName: "desktop-llama-3.2-1b",
  pteFileName: "llama-3.2-1b-instruct-q4_k_m.gguf",
  tokenizerFileName: undefined,
  tokenizerConfigFileName: undefined,
  modelFamily: "llama-3.2-1b",
  huggingFaceUrl: "https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF",
  available: true,
  supportedPlatforms: ["tauri", "macos"],
  pteSource: {
    kind: "remote",
    url: "https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf",
  },
  tokenizerSource: { kind: "unavailable", reason: "Embedded in GGUF" },
  tokenizerConfigSource: { kind: "unavailable", reason: "Embedded in GGUF" },
};

// desktop-qwen-3-1.7b (cross-platform sibling of mobile qwen-3-1.7b)
export const DesktopQwen3_1_7B: LlmModelConfig = {
  modelType: "llm",
  modelId: "desktop-qwen-3-1.7b",
  displayName: "Qwen 3 1.7B (Desktop)",
  description: "1.7B params, ~1GB GGUF. Fast, balanced quality.",
  size: "1.7B",
  quantization: "Q4_K_M",
  folderName: "desktop-qwen-3-1.7b",
  pteFileName: "qwen3-1.7b-q4_k_m.gguf",
  tokenizerFileName: undefined,
  tokenizerConfigFileName: undefined,
  modelFamily: "qwen-3-1.7b",
  huggingFaceUrl: "https://huggingface.co/Qwen/Qwen3-1.7B-GGUF",
  available: true,
  supportedPlatforms: ["tauri", "macos"],
  pteSource: {
    kind: "remote",
    url: "https://huggingface.co/Qwen/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q4_K_M.gguf",
  },
  tokenizerSource: { kind: "unavailable", reason: "Embedded in GGUF" },
  tokenizerConfigSource: { kind: "unavailable", reason: "Embedded in GGUF" },
};

// desktop-llama-3.1-8b (desktop-only, larger model)
export const DesktopLlama31_8B: LlmModelConfig = {
  modelType: "llm",
  modelId: "desktop-llama-3.1-8b-instruct",
  displayName: "Llama 3.1 8B Instruct (Desktop)",
  description: "8B params, ~4.9GB GGUF. Higher quality, needs 8GB+ RAM.",
  size: "8B",
  quantization: "Q4_K_M",
  folderName: "desktop-llama-3.1-8b-instruct",
  pteFileName: "llama-3.1-8b-instruct-q4_k_m.gguf",
  tokenizerFileName: undefined,
  tokenizerConfigFileName: undefined,
  modelFamily: "llama-3.1-8b",
  huggingFaceUrl:
    "https://huggingface.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF",
  available: true,
  supportedPlatforms: ["tauri", "macos"],
  pteSource: {
    kind: "remote",
    url: "https://huggingface.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF/resolve/main/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf",
  },
  tokenizerSource: { kind: "unavailable", reason: "Embedded in GGUF" },
  tokenizerConfigSource: { kind: "unavailable", reason: "Embedded in GGUF" },
};

// desktop-qwen-2.5-7b (desktop-only, larger model)
export const DesktopQwen25_7B: LlmModelConfig = {
  modelType: "llm",
  modelId: "desktop-qwen-2.5-7b-instruct",
  displayName: "Qwen 2.5 7B Instruct (Desktop)",
  description: "7B params, ~4.7GB GGUF. Strong reasoning, needs 8GB+ RAM.",
  size: "7B",
  quantization: "Q4_K_M",
  folderName: "desktop-qwen-2.5-7b-instruct",
  pteFileName: "qwen2.5-7b-instruct-q4_k_m.gguf",
  tokenizerFileName: undefined,
  tokenizerConfigFileName: undefined,
  modelFamily: "qwen-2.5-7b",
  huggingFaceUrl: "https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF",
  available: true,
  supportedPlatforms: ["tauri", "macos"],
  pteSource: {
    kind: "remote",
    url: "https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q4_K_M.gguf",
  },
  tokenizerSource: { kind: "unavailable", reason: "Embedded in GGUF" },
  tokenizerConfigSource: { kind: "unavailable", reason: "Embedded in GGUF" },
};

// desktop-qwen-2.5-14b (MacBook Pro sweet spot, fits 16GB unified memory)
export const DesktopQwen25_14B: LlmModelConfig = {
  modelType: "llm",
  modelId: "desktop-qwen-2.5-14b-instruct",
  displayName: "Qwen 2.5 14B Instruct (Desktop)",
  description:
    "14B params, ~8.8GB GGUF. Big quality jump from 7B. Needs 16GB+ RAM.",
  size: "14B",
  quantization: "Q4_K_M",
  folderName: "desktop-qwen-2.5-14b-instruct",
  pteFileName: "qwen2.5-14b-instruct-q4_k_m.gguf",
  tokenizerFileName: undefined,
  tokenizerConfigFileName: undefined,
  modelFamily: "qwen-2.5-14b",
  huggingFaceUrl: "https://huggingface.co/bartowski/Qwen2.5-14B-Instruct-GGUF",
  available: true,
  supportedPlatforms: ["tauri", "macos"],
  pteSource: {
    kind: "remote",
    url: "https://huggingface.co/bartowski/Qwen2.5-14B-Instruct-GGUF/resolve/main/Qwen2.5-14B-Instruct-Q4_K_M.gguf",
  },
  tokenizerSource: { kind: "unavailable", reason: "Embedded in GGUF" },
  tokenizerConfigSource: { kind: "unavailable", reason: "Embedded in GGUF" },
};

// desktop-qwen-2.5-32b (Pro tier, fills 7B→70B gap)
export const DesktopQwen25_32B: LlmModelConfig = {
  modelType: "llm",
  modelId: "desktop-qwen-2.5-32b-instruct",
  displayName: "Qwen 2.5 32B Instruct (Desktop)",
  description:
    "32B params, ~19GB GGUF. Near-70B quality, needs 32GB+ RAM (M*Pro/Max).",
  size: "32B",
  quantization: "Q4_K_M",
  folderName: "desktop-qwen-2.5-32b-instruct",
  pteFileName: "qwen2.5-32b-instruct-q4_k_m.gguf",
  tokenizerFileName: undefined,
  tokenizerConfigFileName: undefined,
  modelFamily: "qwen-2.5-32b",
  huggingFaceUrl: "https://huggingface.co/bartowski/Qwen2.5-32B-Instruct-GGUF",
  available: true,
  supportedPlatforms: ["tauri", "macos"],
  pteSource: {
    kind: "remote",
    url: "https://huggingface.co/bartowski/Qwen2.5-32B-Instruct-GGUF/resolve/main/Qwen2.5-32B-Instruct-Q4_K_M.gguf",
  },
  tokenizerSource: { kind: "unavailable", reason: "Embedded in GGUF" },
  tokenizerConfigSource: { kind: "unavailable", reason: "Embedded in GGUF" },
};

// desktop-llama-3.3-70b (flagship for M*Max users, ~42GB)
export const DesktopLlama33_70B: LlmModelConfig = {
  modelType: "llm",
  modelId: "desktop-llama-3.3-70b-instruct",
  displayName: "Llama 3.3 70B Instruct (Desktop)",
  description:
    "70B params, ~42GB GGUF. Frontier quality, needs 64GB+ RAM (M*Max).",
  size: "70B",
  quantization: "Q4_K_M",
  folderName: "desktop-llama-3.3-70b-instruct",
  pteFileName: "llama-3.3-70b-instruct-q4_k_m.gguf",
  tokenizerFileName: undefined,
  tokenizerConfigFileName: undefined,
  modelFamily: "llama-3.3-70b",
  huggingFaceUrl:
    "https://huggingface.co/bartowski/Llama-3.3-70B-Instruct-GGUF",
  available: true,
  supportedPlatforms: ["tauri", "macos"],
  pteSource: {
    kind: "remote",
    url: "https://huggingface.co/bartowski/Llama-3.3-70B-Instruct-GGUF/resolve/main/Llama-3.3-70B-Instruct-Q4_K_M.gguf",
  },
  tokenizerSource: { kind: "unavailable", reason: "Embedded in GGUF" },
  tokenizerConfigSource: { kind: "unavailable", reason: "Embedded in GGUF" },
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
  // Web MLC models
  WebQwen25_1_5B,
  WebLlama32_3B,
  // Desktop GGUF models
  DesktopQwen25_1_5B,
  DesktopLlama32_3B,
  DesktopLlama32_1B,
  DesktopQwen3_1_7B,
  DesktopLlama31_8B,
  DesktopQwen25_7B,
  DesktopQwen25_14B,
  DesktopQwen25_32B,
  DesktopLlama33_70B,
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

/**
 * Get all models in a given family.
 * Used for cross-platform persona resolution.
 */
export function getModelsByFamily(family: string): LlmModelConfig[] {
  return ALL_LLM_MODELS.filter((m) => m.modelFamily === family);
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
