import { Platform } from "react-native";
import PlatformAIModule, { type TranscriptionStatus } from "./PlatformAIModule";

function getModule() {
  return PlatformAIModule;
}

// Re-export types
export type { TranscriptionStatus };

/**
 * Check if Apple Foundation Models are available (iOS 26+)
 */
export async function isAppleFoundationModelsAvailable(): Promise<boolean> {
  if (Platform.OS !== "ios") return false;
  const module = getModule();
  if (!module) return false;
  try {
    return await module.isAppleFoundationModelsAvailable();
  } catch {
    return false;
  }
}

/**
 * Check if Gemini Nano (AICore) is available (Android)
 */
export async function isGeminiNanoAvailable(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  const module = getModule();
  if (!module) return false;
  try {
    return await module.isGeminiNanoAvailable();
  } catch {
    return false;
  }
}

/**
 * Gemini Nano status type
 */
export type GeminiNanoStatus =
  | "available"
  | "downloadable"
  | "downloading"
  | "unavailable"
  | "unknown";

/**
 * Get Gemini Nano status (Android)
 * Returns detailed status including whether it can be downloaded
 */
export async function getGeminiNanoStatus(): Promise<GeminiNanoStatus> {
  if (Platform.OS !== "android") return "unavailable";
  const module = getModule();
  if (!module) return "unavailable";
  try {
    const status = await module.getGeminiNanoStatus();
    return status as GeminiNanoStatus;
  } catch {
    return "unavailable";
  }
}

/**
 * Check if Gemini Nano is supported on this device (available or downloadable)
 */
export async function isGeminiNanoSupported(): Promise<boolean> {
  const status = await getGeminiNanoStatus();
  return status === "available" || status === "downloadable";
}

/**
 * Download Gemini Nano model (Android)
 * Call this when user selects Gemini Nano but it's in "downloadable" state
 */
export async function downloadGeminiNano(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  const module = getModule();
  if (!module) return false;
  try {
    return await module.downloadGeminiNano();
  } catch {
    return false;
  }
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Generate a response using the platform's built-in AI model.
 * Uses Apple Foundation Models on iOS 26+ or Gemini Nano on Android.
 *
 * @param systemPrompt - System prompt for the model
 * @param messages - Array of chat messages
 * @returns Generated response text
 * @throws Error if platform AI is not available
 */
export async function generateWithPlatformAI(
  systemPrompt: string,
  messages: ChatMessage[],
): Promise<string> {
  const module = getModule();
  if (!module) {
    throw new Error("Platform AI native module not available");
  }

  // Filter to only user and assistant messages for the API
  const chatMessages = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: m.content }));

  if (Platform.OS === "ios") {
    return module.generateWithAppleFoundation(systemPrompt, chatMessages);
  } else if (Platform.OS === "android") {
    return module.generateWithGeminiNano(systemPrompt, chatMessages);
  }

  throw new Error(`Platform AI not supported on ${Platform.OS}`);
}

/**
 * Check if any platform AI is available on the current device.
 */
export async function isPlatformAIAvailable(): Promise<boolean> {
  if (Platform.OS === "ios") {
    return isAppleFoundationModelsAvailable();
  } else if (Platform.OS === "android") {
    return isGeminiNanoAvailable();
  }
  return false;
}

// MARK: - Speech-to-Text Functions

/**
 * Check if Apple Speech Recognition is available (iOS)
 */
export async function isAppleSpeechAvailable(): Promise<boolean> {
  if (Platform.OS !== "ios") return false;
  const module = getModule();
  if (!module) return false;
  try {
    return await module.isAppleSpeechAvailable();
  } catch {
    return false;
  }
}

/**
 * Check if Android Speech Recognition is available (Android)
 */
export async function isAndroidSpeechAvailable(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  const module = getModule();
  if (!module) return false;
  try {
    return await module.isAndroidSpeechAvailable();
  } catch {
    return false;
  }
}

/**
 * Check if platform STT is available on the current device.
 */
export async function isPlatformSTTAvailable(): Promise<boolean> {
  if (Platform.OS === "ios") {
    return isAppleSpeechAvailable();
  } else if (Platform.OS === "android") {
    return isAndroidSpeechAvailable();
  }
  return false;
}

/**
 * Request speech recognition permission
 */
export async function requestSpeechPermission(): Promise<boolean> {
  const module = getModule();
  if (!module) return false;
  try {
    return await module.requestSpeechPermission();
  } catch {
    return false;
  }
}

/**
 * Start platform speech recognition.
 * Uses Apple Speech Recognition on iOS or Android SpeechRecognizer on Android.
 *
 * @param locale - Optional locale identifier (e.g., "en-US")
 * @returns Session ID
 * @throws Error if platform STT is not available
 */
export async function startPlatformSpeechRecognition(
  locale?: string,
): Promise<string> {
  const module = getModule();
  if (!module) {
    throw new Error("Platform AI native module not available");
  }

  if (Platform.OS === "ios") {
    return module.startSpeechRecognition(locale ?? null);
  } else if (Platform.OS === "android") {
    return module.startAndroidSpeechRecognition(locale ?? null);
  }

  throw new Error(`Platform STT not supported on ${Platform.OS}`);
}

/**
 * Get current transcription status (partial results).
 */
export async function getPlatformTranscription(): Promise<TranscriptionStatus> {
  const module = getModule();
  if (!module) {
    return { text: "", isFinal: true };
  }

  try {
    if (Platform.OS === "ios") {
      return await module.getCurrentTranscription();
    } else if (Platform.OS === "android") {
      return await module.getAndroidTranscription();
    }
  } catch {
    // Return empty result on error
  }

  return { text: "", isFinal: true };
}

/**
 * Stop platform speech recognition and get final result.
 * @returns Final transcription text
 */
export async function stopPlatformSpeechRecognition(): Promise<string> {
  const module = getModule();
  if (!module) {
    throw new Error("Platform AI native module not available");
  }

  if (Platform.OS === "ios") {
    return module.stopSpeechRecognition();
  } else if (Platform.OS === "android") {
    return module.stopAndroidSpeechRecognition();
  }

  throw new Error(`Platform STT not supported on ${Platform.OS}`);
}

/**
 * Cancel platform speech recognition without getting result.
 */
export async function cancelPlatformSpeechRecognition(): Promise<void> {
  const module = getModule();
  if (!module) return;

  try {
    if (Platform.OS === "ios") {
      await module.cancelSpeechRecognition();
    } else if (Platform.OS === "android") {
      await module.cancelAndroidSpeechRecognition();
    }
  } catch {
    // Ignore errors on cancel
  }
}

// MARK: - PCM Audio Recording Functions (Android only, for Whisper)

export interface PCMRecordingResult {
  path: string;
  duration: number;
  size: number;
}

/**
 * Check if PCM recording is available (Android only).
 * iOS uses expo-audio which supports WAV natively.
 */
export function isPCMRecordingAvailable(): boolean {
  return Platform.OS === "android";
}

/**
 * Start PCM audio recording to a WAV file.
 * Records 16kHz mono 16-bit PCM audio suitable for Whisper.
 * Only available on Android (iOS uses expo-audio instead).
 *
 * @param outputPath - Path to save the WAV file
 * @returns The output path
 * @throws Error if recording cannot start
 */
export async function startPCMRecording(outputPath: string): Promise<string> {
  if (Platform.OS !== "android") {
    throw new Error("PCM recording is only available on Android");
  }

  const module = getModule();
  if (!module) {
    throw new Error("Platform AI native module not available");
  }

  return module.startPCMRecording(outputPath);
}

/**
 * Stop PCM recording and get the result.
 *
 * @returns Recording result with path, duration, and size
 * @throws Error if no recording is in progress
 */
export async function stopPCMRecording(): Promise<PCMRecordingResult> {
  if (Platform.OS !== "android") {
    throw new Error("PCM recording is only available on Android");
  }

  const module = getModule();
  if (!module) {
    throw new Error("Platform AI native module not available");
  }

  return module.stopPCMRecording();
}

/**
 * Cancel PCM recording and delete the file.
 */
export async function cancelPCMRecording(): Promise<void> {
  if (Platform.OS !== "android") {
    return;
  }

  const module = getModule();
  if (!module) return;

  try {
    await module.cancelPCMRecording();
  } catch {
    // Ignore errors on cancel
  }
}

/**
 * Check if PCM recording is currently active.
 */
export async function isPCMRecording(): Promise<boolean> {
  if (Platform.OS !== "android") {
    return false;
  }

  const module = getModule();
  if (!module) return false;

  try {
    return await module.isPCMRecording();
  } catch {
    return false;
  }
}

/**
 * Get current audio metering level (Android only).
 * @returns Normalized level 0-1, or 0 if not recording
 */
export async function getPCMMeteringLevel(): Promise<number> {
  if (Platform.OS !== "android") {
    return 0;
  }

  const module = getModule();
  if (!module) return 0;

  try {
    return await module.getPCMMeteringLevel();
  } catch {
    return 0;
  }
}
