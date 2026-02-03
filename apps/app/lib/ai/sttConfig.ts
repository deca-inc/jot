// Speech-to-Text model configuration for Whisper models
// Uses react-native-executorch SpeechToTextModule with ExecuTorch .pte format

// =============================================================================
// STT MODEL IDS - Defined here to avoid circular dependency
// =============================================================================

export enum STT_MODEL_IDS {
  "whisper-tiny-en" = "whisper-tiny-en",
  "whisper-tiny-multi" = "whisper-tiny-multi",
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

// =============================================================================
// STT MODEL REGISTRY ARRAY
// =============================================================================

export const ALL_STT_MODELS: SpeechToTextModelConfig[] = [
  WhisperTinyEn, // Default - fast English-only
  WhisperTinyMulti, // Multilingual option
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
};
