// Platform-native AI models (built into iOS/Android)
// These models don't require downloading - they're provided by the OS
//
// iOS 26+: Apple Foundation Models (LLM), SpeechAnalyzer (STT)
// Android: Gemini Nano (LLM via AICore), SpeechRecognizer (STT)

import { Platform } from "react-native";
import {
  isAppleFoundationModelsAvailable,
  isAppleSpeechAvailable,
  isAndroidSpeechAvailable,
  isGeminiNanoAvailable,
} from "../../modules/platform-ai/src";

// =============================================================================
// PLATFORM MODEL IDS
// =============================================================================

export enum PLATFORM_LLM_IDS {
  "gemini-nano" = "gemini-nano",
  "apple-foundation" = "apple-foundation",
}

export enum PLATFORM_STT_IDS {
  "android-speech" = "android-speech",
  "apple-speech" = "apple-speech",
}

// =============================================================================
// PLATFORM MODEL TYPES
// =============================================================================

export interface PlatformLlmConfig {
  modelId: PLATFORM_LLM_IDS;
  modelType: "llm";
  displayName: string;
  description: string;
  platform: "android" | "ios";
  isPlatformModel: true;
  supportsSystemPrompt: boolean; // Agents require system prompts
  available: boolean; // Set dynamically based on device capability
}

export interface PlatformSttConfig {
  modelId: PLATFORM_STT_IDS;
  modelType: "speech-to-text";
  displayName: string;
  description: string;
  platform: "android" | "ios";
  isPlatformModel: true;
  available: boolean;
}

// =============================================================================
// PLATFORM MODEL DEFINITIONS
// =============================================================================

// Android Gemini Nano - Available on Pixel 8+ and select Samsung devices
export const GeminiNano: PlatformLlmConfig = {
  modelId: PLATFORM_LLM_IDS["gemini-nano"],
  modelType: "llm",
  displayName: "Gemini Nano",
  description: "Built-in Android AI. No download required.",
  platform: "android",
  isPlatformModel: true,
  supportsSystemPrompt: false, // Uses prompt engineering, not dedicated system role
  available: false, // Set dynamically
};

// Apple Foundation Models - iOS 26+ only (not released yet)
export const AppleFoundation: PlatformLlmConfig = {
  modelId: PLATFORM_LLM_IDS["apple-foundation"],
  modelType: "llm",
  displayName: "Apple Intelligence",
  description: "Built-in Apple AI. No download required.",
  platform: "ios",
  isPlatformModel: true,
  supportsSystemPrompt: true, // Supports instructions parameter
  available: false, // iOS 26 not released yet - always false for now
};

// Android SpeechRecognizer - Built into Android
export const AndroidSpeech: PlatformSttConfig = {
  modelId: PLATFORM_STT_IDS["android-speech"],
  modelType: "speech-to-text",
  displayName: "Android Speech",
  description: "Built-in speech recognition. No download required.",
  platform: "android",
  isPlatformModel: true,
  available: false, // Set dynamically
};

// Apple SFSpeechRecognizer - iOS 10+ (works on all modern iOS devices)
export const AppleSpeech: PlatformSttConfig = {
  modelId: PLATFORM_STT_IDS["apple-speech"],
  modelType: "speech-to-text",
  displayName: "Apple Speech",
  description: "Built-in speech recognition. No download required.",
  platform: "ios",
  isPlatformModel: true,
  available: false, // Set dynamically
};

// =============================================================================
// AVAILABILITY DETECTION
// =============================================================================

/**
 * Check if Gemini Nano (Android AICore) is available on this device
 * Requires: Android 14+, Pixel 8+ or compatible Samsung device
 */
export async function checkGeminiNanoAvailable(): Promise<boolean> {
  if (Platform.OS !== "android") {
    return false;
  }

  try {
    // Use the platform-ai native module to check availability
    return await isGeminiNanoAvailable();
  } catch {
    return false;
  }
}

/**
 * Check if Android SpeechRecognizer is available
 * Generally available on all Android devices with Google Play Services
 */
export async function checkAndroidSpeechAvailable(): Promise<boolean> {
  if (Platform.OS !== "android") {
    return false;
  }

  try {
    return await isAndroidSpeechAvailable();
  } catch {
    return false;
  }
}

/**
 * Check if Apple Foundation Models are available
 * Requires iOS 26+ / macOS 26+
 */
export async function checkAppleFoundationAvailable(): Promise<boolean> {
  if (Platform.OS !== "ios" && Platform.OS !== "macos") {
    return false;
  }

  try {
    // Use the platform-ai native module to check availability
    return await isAppleFoundationModelsAvailable();
  } catch {
    return false;
  }
}

/**
 * Check if Apple Speech Recognition (SFSpeechRecognizer) is available
 * Available on iOS 10+ - works on all modern iOS devices
 */
export async function checkAppleSpeechAvailable(): Promise<boolean> {
  if (Platform.OS !== "ios" && Platform.OS !== "macos") {
    return false;
  }

  try {
    return await isAppleSpeechAvailable();
  } catch {
    return false;
  }
}

// =============================================================================
// PLATFORM AVAILABILITY STATE
// =============================================================================

export interface PlatformModelAvailability {
  llm: {
    geminiNano: boolean;
    appleFoundation: boolean;
  };
  stt: {
    androidSpeech: boolean;
    appleSpeech: boolean;
  };
}

/**
 * Check availability of all platform models
 * Call this once at app startup and cache the results
 */
export async function checkPlatformModelsAvailability(): Promise<PlatformModelAvailability> {
  const [geminiNano, appleFoundation, androidSpeech, appleSpeech] =
    await Promise.all([
      checkGeminiNanoAvailable(),
      checkAppleFoundationAvailable(),
      checkAndroidSpeechAvailable(),
      checkAppleSpeechAvailable(),
    ]);

  return {
    llm: {
      geminiNano,
      appleFoundation,
    },
    stt: {
      androidSpeech,
      appleSpeech,
    },
  };
}

/**
 * Get all available platform LLM configs for the current device
 */
export function getAvailablePlatformLLMs(
  availability: PlatformModelAvailability,
): PlatformLlmConfig[] {
  const models: PlatformLlmConfig[] = [];

  if (Platform.OS === "android" && availability.llm.geminiNano) {
    models.push({ ...GeminiNano, available: true });
  }

  if (
    (Platform.OS === "ios" || Platform.OS === "macos") &&
    availability.llm.appleFoundation
  ) {
    models.push({ ...AppleFoundation, available: true });
  }

  return models;
}

/**
 * Get all available platform STT configs for the current device
 */
export function getAvailablePlatformSTTs(
  availability: PlatformModelAvailability,
): PlatformSttConfig[] {
  const models: PlatformSttConfig[] = [];

  if (Platform.OS === "android" && availability.stt.androidSpeech) {
    models.push({ ...AndroidSpeech, available: true });
  }

  if (
    (Platform.OS === "ios" || Platform.OS === "macos") &&
    availability.stt.appleSpeech
  ) {
    models.push({ ...AppleSpeech, available: true });
  }

  return models;
}

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 * Check if a model ID is a platform model (not downloadable)
 */
export function isPlatformModelId(modelId: string): boolean {
  return (
    Object.values(PLATFORM_LLM_IDS).includes(modelId as PLATFORM_LLM_IDS) ||
    Object.values(PLATFORM_STT_IDS).includes(modelId as PLATFORM_STT_IDS)
  );
}

/**
 * Check if a model config is a platform model
 */
export function isPlatformModel(
  model: { isPlatformModel?: boolean } | null | undefined,
): boolean {
  return model?.isPlatformModel === true;
}

/**
 * Check if a platform LLM supports system prompts (required for agents)
 */
export function platformModelSupportsSystemPrompt(modelId: string): boolean {
  if (modelId === PLATFORM_LLM_IDS["apple-foundation"]) {
    return true; // Apple supports instructions
  }
  if (modelId === PLATFORM_LLM_IDS["gemini-nano"]) {
    return false; // Gemini Nano uses prompt engineering only
  }
  return true; // Non-platform models support system prompts
}

// =============================================================================
// HELPERS FOR UI
// =============================================================================

/**
 * Get display info for why platform models can't be used with agents
 */
export function getPlatformModelAgentWarning(modelId: string): string | null {
  if (modelId === PLATFORM_LLM_IDS["gemini-nano"]) {
    return "Gemini Nano doesn't support custom system prompts required by personas. Please select a downloadable model.";
  }
  return null;
}
