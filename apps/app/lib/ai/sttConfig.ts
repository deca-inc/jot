// Speech-to-Text model configuration for Whisper models
// Uses react-native-executorch SpeechToTextModule with ExecuTorch .pte format

// =============================================================================
// STT MODEL IDS - Defined here to avoid circular dependency
// =============================================================================

export enum STT_MODEL_IDS {
  "whisper-tiny-en" = "whisper-tiny-en",
  "whisper-tiny-multi" = "whisper-tiny-multi",
  "desktop-whisper-tiny-en" = "desktop-whisper-tiny-en",
  "desktop-whisper-base-en" = "desktop-whisper-base-en",
  "desktop-whisper-small-en" = "desktop-whisper-small-en",
}

// Import types only (not values) from modelConfig to avoid cycle
import type { ModelSource, SpeechToTextModelConfig } from "./modelConfig";

// =============================================================================
// WHISPER MODEL REGISTRY
// =============================================================================
// All models are from Software Mansion's React Native ExecuTorch repositories
// https://huggingface.co/software-mansion
//
// Whisper models require three files:
// - Encoder (.pte) - processes audio input
// - Decoder (.pte) - generates text output
// - Tokenizer (.json) - converts tokens to text
//
// Models are exported for xnnpack backend using ExecuTorch v0.6.0

// -----------------------------------------------------------------------------
// WHISPER TINY MODELS
// -----------------------------------------------------------------------------

/**
 * Whisper Tiny English - Fast English-only transcription
 * https://huggingface.co/software-mansion/react-native-executorch-whisper-tiny.en
 */
export const WhisperTinyEn: SpeechToTextModelConfig = {
  modelType: "speech-to-text",
  modelId: STT_MODEL_IDS["whisper-tiny-en"],
  displayName: "Whisper Tiny (English)",
  description: "Fast English transcription. ~230MB total.",
  size: "230MB",
  folderName: "whisper-tiny-en",
  isMultilingual: false,
  available: true,
  isDefault: true,
  huggingFaceUrl:
    "https://huggingface.co/software-mansion/react-native-executorch-whisper-tiny.en",
  // Model files
  encoderFileName: "whisper_tiny_en_encoder_xnnpack.pte",
  decoderFileName: "whisper_tiny_en_decoder_xnnpack.pte",
  tokenizerFileName: "tokenizer.json",
  // Sources - using main branch (models updated to v0.6.0)
  encoderSource: {
    kind: "remote",
    url: "https://huggingface.co/software-mansion/react-native-executorch-whisper-tiny.en/resolve/main/xnnpack/whisper_tiny_en_encoder_xnnpack.pte",
  } as ModelSource,
  decoderSource: {
    kind: "remote",
    url: "https://huggingface.co/software-mansion/react-native-executorch-whisper-tiny.en/resolve/main/xnnpack/whisper_tiny_en_decoder_xnnpack.pte",
  } as ModelSource,
  tokenizerSource: {
    kind: "remote",
    url: "https://huggingface.co/software-mansion/react-native-executorch-whisper-tiny.en/resolve/main/tokenizer.json",
  } as ModelSource,
};

/**
 * Whisper Tiny Multilingual - 99+ language transcription
 * https://huggingface.co/software-mansion/react-native-executorch-whisper-tiny
 */
export const WhisperTinyMulti: SpeechToTextModelConfig = {
  modelType: "speech-to-text",
  modelId: STT_MODEL_IDS["whisper-tiny-multi"],
  displayName: "Whisper Tiny (Multilingual)",
  description: "99+ languages transcription. ~230MB total.",
  size: "230MB",
  folderName: "whisper-tiny-multi",
  isMultilingual: true,
  available: true,
  huggingFaceUrl:
    "https://huggingface.co/software-mansion/react-native-executorch-whisper-tiny",
  // Model files
  encoderFileName: "whisper_tiny_encoder_xnnpack.pte",
  decoderFileName: "whisper_tiny_decoder_xnnpack.pte",
  tokenizerFileName: "tokenizer.json",
  // Sources
  encoderSource: {
    kind: "remote",
    url: "https://huggingface.co/software-mansion/react-native-executorch-whisper-tiny/resolve/main/xnnpack/whisper_tiny_encoder_xnnpack.pte",
  } as ModelSource,
  decoderSource: {
    kind: "remote",
    url: "https://huggingface.co/software-mansion/react-native-executorch-whisper-tiny/resolve/main/xnnpack/whisper_tiny_decoder_xnnpack.pte",
  } as ModelSource,
  tokenizerSource: {
    kind: "remote",
    url: "https://huggingface.co/software-mansion/react-native-executorch-whisper-tiny/resolve/main/tokenizer.json",
  } as ModelSource,
};

// -----------------------------------------------------------------------------
// DESKTOP WHISPER MODELS (whisper.cpp format via whisper-rs)
// -----------------------------------------------------------------------------
// These models use the whisper.cpp binary format (.bin) and run via whisper-rs
// on the desktop (Tauri) build. Only a single model file is needed — the
// decoder and tokenizer are built into whisper.cpp.
//
// Models from: https://huggingface.co/ggerganov/whisper.cpp/tree/main

/**
 * Desktop Whisper Tiny English - Fast English-only transcription (~75MB)
 */
export const DesktopWhisperTinyEn: SpeechToTextModelConfig = {
  modelType: "speech-to-text",
  modelId: STT_MODEL_IDS["desktop-whisper-tiny-en"],
  displayName: "Whisper Tiny EN (Desktop)",
  description: "Fast English-only transcription. ~75MB model file.",
  size: "75MB",
  folderName: "desktop-whisper-tiny-en",
  isMultilingual: false,
  available: true,
  isDefault: false,
  supportedPlatforms: ["tauri", "macos"],
  modelFamily: "whisper-tiny-en",
  // whisper.cpp uses a single model file
  encoderFileName: "ggml-tiny.en.bin",
  decoderFileName: "",
  tokenizerFileName: "",
  encoderSource: {
    kind: "remote",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin",
  } as ModelSource,
  decoderSource: {
    kind: "unavailable",
    reason: "Built into whisper.cpp",
  } as ModelSource,
  tokenizerSource: {
    kind: "unavailable",
    reason: "Built into whisper.cpp",
  } as ModelSource,
};

/**
 * Desktop Whisper Base English - Better quality English transcription (~140MB)
 */
export const DesktopWhisperBaseEn: SpeechToTextModelConfig = {
  modelType: "speech-to-text",
  modelId: STT_MODEL_IDS["desktop-whisper-base-en"],
  displayName: "Whisper Base EN (Desktop)",
  description: "Good quality English transcription. ~140MB model file.",
  size: "140MB",
  folderName: "desktop-whisper-base-en",
  isMultilingual: false,
  available: true,
  supportedPlatforms: ["tauri", "macos"],
  modelFamily: "whisper-base-en",
  encoderFileName: "ggml-base.en.bin",
  decoderFileName: "",
  tokenizerFileName: "",
  encoderSource: {
    kind: "remote",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin",
  } as ModelSource,
  decoderSource: {
    kind: "unavailable",
    reason: "Built into whisper.cpp",
  } as ModelSource,
  tokenizerSource: {
    kind: "unavailable",
    reason: "Built into whisper.cpp",
  } as ModelSource,
};

/**
 * Desktop Whisper Small English - High quality English transcription (~460MB)
 */
export const DesktopWhisperSmallEn: SpeechToTextModelConfig = {
  modelType: "speech-to-text",
  modelId: STT_MODEL_IDS["desktop-whisper-small-en"],
  displayName: "Whisper Small EN (Desktop)",
  description: "High quality English transcription. ~460MB model file.",
  size: "460MB",
  folderName: "desktop-whisper-small-en",
  isMultilingual: false,
  available: true,
  supportedPlatforms: ["tauri", "macos"],
  modelFamily: "whisper-small-en",
  encoderFileName: "ggml-small.en.bin",
  decoderFileName: "",
  tokenizerFileName: "",
  encoderSource: {
    kind: "remote",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin",
  } as ModelSource,
  decoderSource: {
    kind: "unavailable",
    reason: "Built into whisper.cpp",
  } as ModelSource,
  tokenizerSource: {
    kind: "unavailable",
    reason: "Built into whisper.cpp",
  } as ModelSource,
};

// =============================================================================
// STT MODEL REGISTRY ARRAY
// =============================================================================

export const ALL_STT_MODELS: SpeechToTextModelConfig[] = [
  WhisperTinyEn, // Default - fast English-only (mobile/ExecuTorch)
  WhisperTinyMulti, // Multilingual option (mobile/ExecuTorch)
  DesktopWhisperTinyEn, // Desktop - fast English-only (whisper.cpp)
  DesktopWhisperBaseEn, // Desktop - good quality English (whisper.cpp)
  DesktopWhisperSmallEn, // Desktop - high quality English (whisper.cpp)
];

// =============================================================================
// STT MODEL LOOKUP HELPERS
// =============================================================================

/**
 * Get an STT model config by its ID
 */
export function getSTTModelById(
  modelId: string,
): SpeechToTextModelConfig | undefined {
  return ALL_STT_MODELS.find((m) => m.modelId === modelId);
}

// =============================================================================
// DEFAULTS
// =============================================================================

// Default STT model - fast English-only transcription
export const DEFAULT_STT_MODEL = WhisperTinyEn;

// =============================================================================
// ESTIMATED FILE SIZES (in MB)
// =============================================================================
// Used for download progress estimation

export const STT_MODEL_SIZES: Record<string, number> = {
  "whisper-tiny-en": 233, // 33MB encoder + 198MB decoder + 2MB tokenizer
  "whisper-tiny-multi": 233, // Similar size to English-only
  "desktop-whisper-tiny-en": 75, // Single whisper.cpp model file
  "desktop-whisper-base-en": 140, // Single whisper.cpp model file
  "desktop-whisper-small-en": 460, // Single whisper.cpp model file
};
