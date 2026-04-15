// Speech-to-Text model configuration for Whisper models
// Uses react-native-executorch SpeechToTextModule with ExecuTorch .pte format

// =============================================================================
// STT MODEL IDS - Defined here to avoid circular dependency
// =============================================================================

export enum STT_MODEL_IDS {
  "moonshine-base-en" = "moonshine-base-en",
  "moonshine-tiny-en" = "moonshine-tiny-en",
  "whisper-tiny-en" = "whisper-tiny-en",
  "whisper-tiny-multi" = "whisper-tiny-multi",
  "whisper-base-en" = "whisper-base-en",
  "whisper-small-en" = "whisper-small-en",
  "desktop-whisper-tiny-en" = "desktop-whisper-tiny-en",
  "desktop-whisper-base-en" = "desktop-whisper-base-en",
  "desktop-whisper-small-en" = "desktop-whisper-small-en",
}

// Import types only (not values) from modelConfig to avoid cycle
import type {
  ModelFile,
  ModelSource,
  SpeechToTextModelConfig,
} from "./modelConfig";

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
//
// IMPORTANT: All URLs are pinned to a specific version tag or commit SHA.
// Never use `resolve/main` — HuggingFace repos can change at any time.

// Version tag used for Software Mansion ExecuTorch models
const SM_VERSION = "v0.6.0";
const SM_PREFIX =
  "https://huggingface.co/software-mansion/react-native-executorch";
// Version tag for ggerganov whisper.cpp models
const GGML_COMMIT = "bbb3298"; // 2025-02-28 commit
// Commit SHAs for sherpa-onnx Moonshine models (csukuangfj)
const MOONSHINE_TINY_COMMIT = "bf2b762c076d8ea61e2af0b3851c9564fb77552e";
const MOONSHINE_BASE_COMMIT = "052b0798ad1bf046a140fdd4efcd9426530fa3f5";
const MOONSHINE_PREFIX = "https://huggingface.co/csukuangfj";

// -----------------------------------------------------------------------------
// MOONSHINE MODELS (sherpa-onnx runtime, ONNX format)
// -----------------------------------------------------------------------------
// Moonshine is purpose-built for edge/mobile STT. Dramatically better
// quality-per-MB than Whisper. Uses sherpa-onnx runtime.
// https://github.com/moonshine-ai/moonshine

/** Helper to build Moonshine file list */
function moonshineFiles(
  repoName: string,
  commit: string,
): { encoder: ModelFile; extras: ModelFile[] } {
  const base = `${MOONSHINE_PREFIX}/${repoName}/resolve/${commit}`;
  return {
    encoder: {
      fileName: "preprocess.onnx",
      source: { kind: "remote", url: `${base}/preprocess.onnx` } as ModelSource,
    },
    extras: [
      {
        fileName: "encode.int8.onnx",
        source: {
          kind: "remote",
          url: `${base}/encode.int8.onnx`,
        } as ModelSource,
      },
      {
        fileName: "cached_decode.int8.onnx",
        source: {
          kind: "remote",
          url: `${base}/cached_decode.int8.onnx`,
        } as ModelSource,
      },
      {
        fileName: "uncached_decode.int8.onnx",
        source: {
          kind: "remote",
          url: `${base}/uncached_decode.int8.onnx`,
        } as ModelSource,
      },
      {
        fileName: "tokens.txt",
        source: { kind: "remote", url: `${base}/tokens.txt` } as ModelSource,
      },
    ],
  };
}

const moonshineBase = moonshineFiles(
  "sherpa-onnx-moonshine-base-en-int8",
  MOONSHINE_BASE_COMMIT,
);

/**
 * Moonshine Base English (int8) — Recommended.
 * Matches Whisper Small quality at ~274MB (vs 900MB). Much faster.
 * https://huggingface.co/csukuangfj/sherpa-onnx-moonshine-base-en-int8
 */
export const MoonshineBaseEn: SpeechToTextModelConfig = {
  modelType: "speech-to-text",
  modelId: STT_MODEL_IDS["moonshine-base-en"],
  displayName: "Moonshine Base (English)",
  description: "Recommended. High quality, fast, small. ~274MB total.",
  size: "274MB",
  folderName: "sherpa-onnx-moonshine-base-en-int8",
  isMultilingual: false,
  available: true,
  isDefault: true,
  runtime: "sherpa-onnx",
  sttModelType: "moonshine",
  huggingFaceUrl: `${MOONSHINE_PREFIX}/sherpa-onnx-moonshine-base-en-int8`,
  // Primary file (preprocess.onnx) goes in encoderFileName for download compatibility
  encoderFileName: moonshineBase.encoder.fileName,
  decoderFileName: "",
  tokenizerFileName: "",
  encoderSource: moonshineBase.encoder.source,
  decoderSource: {
    kind: "unavailable",
    reason: "Uses extraFiles",
  } as ModelSource,
  tokenizerSource: {
    kind: "unavailable",
    reason: "Uses extraFiles",
  } as ModelSource,
  extraFiles: moonshineBase.extras,
};

const moonshineTiny = moonshineFiles(
  "sherpa-onnx-moonshine-tiny-en-int8",
  MOONSHINE_TINY_COMMIT,
);

/**
 * Moonshine Tiny English (int8) — Smallest, fastest.
 * Better than Whisper Tiny at 1/2 the size. ~118MB total.
 * https://huggingface.co/csukuangfj/sherpa-onnx-moonshine-tiny-en-int8
 */
export const MoonshineTinyEn: SpeechToTextModelConfig = {
  modelType: "speech-to-text",
  modelId: STT_MODEL_IDS["moonshine-tiny-en"],
  displayName: "Moonshine Tiny (English)",
  description: "Fast and lightweight. Better than Whisper Tiny. ~118MB total.",
  size: "118MB",
  folderName: "sherpa-onnx-moonshine-tiny-en-int8",
  isMultilingual: false,
  available: true,
  runtime: "sherpa-onnx",
  sttModelType: "moonshine",
  huggingFaceUrl: `${MOONSHINE_PREFIX}/sherpa-onnx-moonshine-tiny-en-int8`,
  encoderFileName: moonshineTiny.encoder.fileName,
  decoderFileName: "",
  tokenizerFileName: "",
  encoderSource: moonshineTiny.encoder.source,
  decoderSource: {
    kind: "unavailable",
    reason: "Uses extraFiles",
  } as ModelSource,
  tokenizerSource: {
    kind: "unavailable",
    reason: "Uses extraFiles",
  } as ModelSource,
  extraFiles: moonshineTiny.extras,
};

// -----------------------------------------------------------------------------
// WHISPER MODELS (ExecuTorch runtime, PTE format)
// -----------------------------------------------------------------------------

/**
 * Whisper Small English - Recommended. High quality English transcription.
 * ~5.5% WER — major step up from Tiny's ~13% WER.
 * https://huggingface.co/software-mansion/react-native-executorch-whisper-small.en
 */
export const WhisperSmallEn: SpeechToTextModelConfig = {
  modelType: "speech-to-text",
  modelId: STT_MODEL_IDS["whisper-small-en"],
  displayName: "Whisper Small (English)",
  description: "Recommended. High quality English. ~900MB total.",
  size: "900MB",
  folderName: "whisper-small-en",
  isMultilingual: false,
  available: true,
  isDefault: true,
  huggingFaceUrl: `${SM_PREFIX}-whisper-small.en`,
  encoderFileName: "whisper_small_en_encoder_xnnpack.pte",
  decoderFileName: "whisper_small_en_decoder_xnnpack.pte",
  tokenizerFileName: "tokenizer.json",
  encoderSource: {
    kind: "remote",
    url: `${SM_PREFIX}-whisper-small.en/resolve/${SM_VERSION}/xnnpack/whisper_small_en_encoder_xnnpack.pte`,
  } as ModelSource,
  decoderSource: {
    kind: "remote",
    url: `${SM_PREFIX}-whisper-small.en/resolve/${SM_VERSION}/xnnpack/whisper_small_en_decoder_xnnpack.pte`,
  } as ModelSource,
  tokenizerSource: {
    kind: "remote",
    url: `${SM_PREFIX}-whisper-small.en/resolve/${SM_VERSION}/tokenizer.json`,
  } as ModelSource,
};

/**
 * Whisper Base English - Good balance of quality and size.
 * ~7.5% WER — solid middle ground between Tiny and Small.
 * https://huggingface.co/software-mansion/react-native-executorch-whisper-base.en
 */
export const WhisperBaseEn: SpeechToTextModelConfig = {
  modelType: "speech-to-text",
  modelId: STT_MODEL_IDS["whisper-base-en"],
  displayName: "Whisper Base (English)",
  description: "Good quality English. Smaller download. ~400MB total.",
  size: "400MB",
  folderName: "whisper-base-en",
  isMultilingual: false,
  available: true,
  huggingFaceUrl: `${SM_PREFIX}-whisper-base.en`,
  encoderFileName: "whisper_base_en_encoder_xnnpack.pte",
  decoderFileName: "whisper_base_en_decoder_xnnpack.pte",
  tokenizerFileName: "tokenizer.json",
  encoderSource: {
    kind: "remote",
    url: `${SM_PREFIX}-whisper-base.en/resolve/${SM_VERSION}/xnnpack/whisper_base_en_encoder_xnnpack.pte`,
  } as ModelSource,
  decoderSource: {
    kind: "remote",
    url: `${SM_PREFIX}-whisper-base.en/resolve/${SM_VERSION}/xnnpack/whisper_base_en_decoder_xnnpack.pte`,
  } as ModelSource,
  tokenizerSource: {
    kind: "remote",
    url: `${SM_PREFIX}-whisper-base.en/resolve/${SM_VERSION}/tokenizer.json`,
  } as ModelSource,
};

/**
 * Whisper Tiny English - Fast but lower accuracy transcription.
 * https://huggingface.co/software-mansion/react-native-executorch-whisper-tiny.en
 */
export const WhisperTinyEn: SpeechToTextModelConfig = {
  modelType: "speech-to-text",
  modelId: STT_MODEL_IDS["whisper-tiny-en"],
  displayName: "Whisper Tiny (English)",
  description: "Fastest, lower accuracy. ~230MB total.",
  size: "230MB",
  folderName: "whisper-tiny-en",
  isMultilingual: false,
  available: true,
  deprecated: true,
  huggingFaceUrl: `${SM_PREFIX}-whisper-tiny.en`,
  encoderFileName: "whisper_tiny_en_encoder_xnnpack.pte",
  decoderFileName: "whisper_tiny_en_decoder_xnnpack.pte",
  tokenizerFileName: "tokenizer.json",
  encoderSource: {
    kind: "remote",
    url: `${SM_PREFIX}-whisper-tiny.en/resolve/${SM_VERSION}/xnnpack/whisper_tiny_en_encoder_xnnpack.pte`,
  } as ModelSource,
  decoderSource: {
    kind: "remote",
    url: `${SM_PREFIX}-whisper-tiny.en/resolve/${SM_VERSION}/xnnpack/whisper_tiny_en_decoder_xnnpack.pte`,
  } as ModelSource,
  tokenizerSource: {
    kind: "remote",
    url: `${SM_PREFIX}-whisper-tiny.en/resolve/${SM_VERSION}/tokenizer.json`,
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
  description: "99+ languages, lower accuracy. ~230MB total.",
  size: "230MB",
  folderName: "whisper-tiny-multi",
  isMultilingual: true,
  available: true,
  deprecated: true,
  huggingFaceUrl: `${SM_PREFIX}-whisper-tiny`,
  encoderFileName: "whisper_tiny_encoder_xnnpack.pte",
  decoderFileName: "whisper_tiny_decoder_xnnpack.pte",
  tokenizerFileName: "tokenizer.json",
  encoderSource: {
    kind: "remote",
    url: `${SM_PREFIX}-whisper-tiny/resolve/${SM_VERSION}/xnnpack/whisper_tiny_encoder_xnnpack.pte`,
  } as ModelSource,
  decoderSource: {
    kind: "remote",
    url: `${SM_PREFIX}-whisper-tiny/resolve/${SM_VERSION}/xnnpack/whisper_tiny_decoder_xnnpack.pte`,
  } as ModelSource,
  tokenizerSource: {
    kind: "remote",
    url: `${SM_PREFIX}-whisper-tiny/resolve/${SM_VERSION}/tokenizer.json`,
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
    url: `https://huggingface.co/ggerganov/whisper.cpp/resolve/${GGML_COMMIT}/ggml-tiny.en.bin`,
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
    url: `https://huggingface.co/ggerganov/whisper.cpp/resolve/${GGML_COMMIT}/ggml-base.en.bin`,
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
    url: `https://huggingface.co/ggerganov/whisper.cpp/resolve/${GGML_COMMIT}/ggml-small.en.bin`,
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
  MoonshineBaseEn, // Recommended - high quality, fast, small (sherpa-onnx)
  MoonshineTinyEn, // Fast and lightweight (sherpa-onnx)
  WhisperSmallEn, // High quality English (ExecuTorch, larger download)
  WhisperBaseEn, // Good quality, smaller download (ExecuTorch)
  WhisperTinyEn, // Fast, lower accuracy (ExecuTorch)
  WhisperTinyMulti, // Multilingual, lower accuracy (ExecuTorch)
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

// Default STT model - Moonshine Base offers the best quality/size ratio
export const DEFAULT_STT_MODEL = MoonshineBaseEn;

// =============================================================================
// ESTIMATED FILE SIZES (in MB)
// =============================================================================
// Used for download progress estimation

export const STT_MODEL_SIZES: Record<string, number> = {
  "moonshine-base-en": 274, // 5 ONNX files (preprocess + encode + cached/uncached decode + tokens)
  "moonshine-tiny-en": 118, // 5 ONNX files, smaller
  "whisper-small-en": 900, // ~450MB encoder + ~450MB decoder + 2MB tokenizer
  "whisper-base-en": 400, // ~200MB encoder + ~200MB decoder + 2MB tokenizer
  "whisper-tiny-en": 233, // 33MB encoder + 198MB decoder + 2MB tokenizer
  "whisper-tiny-multi": 233, // Similar size to English-only
  "desktop-whisper-tiny-en": 75, // Single whisper.cpp model file
  "desktop-whisper-base-en": 140, // Single whisper.cpp model file
  "desktop-whisper-small-en": 460, // Single whisper.cpp model file
};
