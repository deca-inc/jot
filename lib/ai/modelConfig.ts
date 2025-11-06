// Central config for on-device LLM assets
// Llama 3.2 1B Instruct (SpinQuant quantized) via ExecuTorch .pte + tokenizer

export type ModelSource =
  | { kind: "bundled"; requireId: any }
  | { kind: "remote"; url: string };

export interface LlmModelConfig {
  modelId: string;
  displayName: string;
  // Local filenames under the app's sandbox if downloaded
  pteFileName: string;
  tokenizerFileName?: string; // optional depending on export
  tokenizerConfigFileName?: string; // e.g., tokenizer.json
  // Choose one of: bundled require() or a remote URL to download
  pteSource: ModelSource;
  tokenizerSource: ModelSource;
  tokenizerConfigSource: ModelSource;
}

// NOTE: For local development, run `pnpm download:models` to download models to assets/models/
// The config will automatically use bundled sources if files exist, otherwise fall back to remote URLs.

// For local development: check if models exist and use file paths
// Large .pte files are loaded from filesystem at runtime, not bundled by Metro
// This avoids Metro trying to read 2GB+ files into memory

// Default to remote URLs - will be overridden at runtime if local files exist
export const Llama32_1B_Instruct: LlmModelConfig = {
  modelId: "llama-3.2-1b-instruct",
  displayName: "Llama 3.2 1B Instruct",
  pteFileName: "llama3_2_spinquant.pte",
  tokenizerFileName: "tokenizer.json",
  tokenizerConfigFileName: "tokenizer_config.json",
  // Default to remote - modelManager will check for local files first
  pteSource: {
    kind: "remote",
    url: "https://huggingface.co/software-mansion/react-native-executorch-llama-3.2/resolve/v0.5.0/llama-3.2-1B/spinquant/llama3_2_spinquant.pte",
  },
  tokenizerSource: {
    kind: "remote",
    url: "https://huggingface.co/software-mansion/react-native-executorch-llama-3.2/resolve/v0.5.0/tokenizer.json",
  },
  tokenizerConfigSource: {
    kind: "remote",
    url: "https://huggingface.co/software-mansion/react-native-executorch-llama-3.2/resolve/v0.5.0/tokenizer_config.json",
  },
};
