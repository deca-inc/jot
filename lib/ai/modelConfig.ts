// Central config for on-device LLM assets
// Supports multiple models with quantized weights via ExecuTorch .pte format

export type ModelSource =
  | { kind: "bundled"; requireId: any }
  | { kind: "remote"; url: string }
  | { kind: "unavailable"; reason: string }; // For models without PTE files yet

export interface LlmModelConfig {
  modelId: string;
  displayName: string;
  description: string;
  // Model metadata
  size: string; // e.g., "1B", "8B", "14B"
  quantization?: string; // e.g., "SpinQuant", "4-bit", "8-bit"
  // Local folder and filenames under the app's sandbox if downloaded
  folderName: string; // e.g., "llama-3.2-1b-instruct"
  pteFileName: string;
  tokenizerFileName?: string; // optional depending on export
  tokenizerConfigFileName?: string; // e.g., tokenizer.json
  // Choose one of: bundled require() or a remote URL to download
  pteSource: ModelSource;
  tokenizerSource: ModelSource;
  tokenizerConfigSource: ModelSource;
  // Additional metadata
  huggingFaceUrl?: string; // Link to model card
  available: boolean; // Whether PTE files are available for download
  isDefault?: boolean; // If true, recommended as the default model for new users
}

// NOTE: For local development, run `pnpm download:models` to download models to assets/models/
// The config will automatically use bundled sources if files exist, otherwise fall back to remote URLs.

// For local development: check if models exist and use file paths
// Large .pte files are loaded from filesystem at runtime, not bundled by Metro
// This avoids Metro trying to read 2GB+ files into memory

// =============================================================================
// MODEL REGISTRY
// =============================================================================
// All models are from Software Mansion's React Native ExecuTorch repositories
// https://huggingface.co/software-mansion
//
// IMPORTANT: URLs use commit hashes instead of 'main' for stability
// - Llama models: 76ab87fe4ceb2e00c19a24b18326e9c1506f3f20
// - Qwen models:  ae11f6fb40b8168952970e4dd84285697b5ac069
// This ensures model URLs never break if files are moved/renamed on main branch

// -----------------------------------------------------------------------------
// LLAMA 3.2 MODELS
// -----------------------------------------------------------------------------

// Llama 3.2 1B Instruct (SpinQuant)
export const Llama32_1B_Instruct: LlmModelConfig = {
  modelId: "llama-3.2-1b-instruct",
  displayName: "Llama 3.2 1B Instruct",
  description:
    "Fast and efficient 1B parameter model optimized for on-device inference. Great for quick responses and everyday tasks.",
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
  modelId: "llama-3.2-3b-instruct",
  displayName: "Llama 3.2 3B Instruct",
  description:
    "Higher quality 3B parameter model with improved reasoning and understanding. Better for complex tasks.",
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
  modelId: "qwen-3-0.6b",
  displayName: "Qwen 3 0.6B",
  description:
    "Compact and ultra-efficient 0.6B parameter model. Smallest option with fastest inference speed.",
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
  modelId: "qwen-3-1.7b",
  displayName: "Qwen 3 1.7B",
  description:
    "Balanced 1.7B parameter model offering excellent quality with reasonable speed. Best all-around choice.",
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
  modelId: "qwen-3-4b",
  displayName: "Qwen 3 4B",
  description:
    "Powerful 4B parameter model with excellent reasoning and understanding. Best quality for on-device inference.",
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
// MODEL REGISTRY ARRAY
// =============================================================================

export const ALL_MODELS: LlmModelConfig[] = [
  // Qwen models (8-bit quantized) - Recommended model line for on-device inference
  Qwen3_1_7B, // Default - best balance
  Qwen3_0_6B, // Lightweight option
  Qwen3_4B, // Highest quality
  // Llama models (SpinQuant) - Alternative options
  Llama32_1B_Instruct,
  Llama32_3B_Instruct,
];

export function getModelById(modelId: string): LlmModelConfig | undefined {
  return ALL_MODELS.find((m) => m.modelId === modelId);
}

// Default model - best balance of quality and performance for most devices
export const DEFAULT_MODEL = Qwen3_1_7B;
