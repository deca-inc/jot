import { requireNativeModule } from "expo-modules-core";

export interface TranscriptionStatus {
  text: string;
  isFinal: boolean;
}

export interface PlatformAIModuleType {
  /**
   * Check if Apple Foundation Models are available on this device (iOS 26+)
   */
  isAppleFoundationModelsAvailable(): Promise<boolean>;

  /**
   * Check if Gemini Nano (AICore) is available on this device (Android)
   */
  isGeminiNanoAvailable(): Promise<boolean>;

  /**
   * Get Gemini Nano status (Android)
   * @returns "available" | "downloadable" | "downloading" | "unavailable" | "unknown"
   */
  getGeminiNanoStatus(): Promise<string>;

  /**
   * Download Gemini Nano model (Android)
   * @returns true if download started/completed, false if failed
   */
  downloadGeminiNano(): Promise<boolean>;

  /**
   * Generate a response using Apple Foundation Models
   * @param systemPrompt - System prompt for the model
   * @param messages - Array of {role: 'user'|'assistant', content: string}
   * @returns Generated response text
   */
  generateWithAppleFoundation(
    systemPrompt: string,
    messages: Array<{ role: string; content: string }>,
  ): Promise<string>;

  /**
   * Generate a response using Gemini Nano (Android AICore)
   * @param systemPrompt - System prompt for the model
   * @param messages - Array of {role: 'user'|'assistant', content: string}
   * @returns Generated response text
   */
  generateWithGeminiNano(
    systemPrompt: string,
    messages: Array<{ role: string; content: string }>,
  ): Promise<string>;

  // MARK: - Speech-to-Text Functions

  /**
   * Check if Apple Speech Recognition is available (iOS)
   */
  isAppleSpeechAvailable(): Promise<boolean>;

  /**
   * Check if Android Speech Recognition is available (Android)
   */
  isAndroidSpeechAvailable(): Promise<boolean>;

  /**
   * Request speech recognition permission
   */
  requestSpeechPermission(): Promise<boolean>;

  /**
   * Start Apple speech recognition (iOS)
   * @param locale - Optional locale identifier (e.g., "en-US")
   * @returns Session ID
   */
  startSpeechRecognition(locale: string | null): Promise<string>;

  /**
   * Get current transcription status (iOS)
   */
  getCurrentTranscription(): Promise<TranscriptionStatus>;

  /**
   * Stop Apple speech recognition and get final result (iOS)
   * @returns Final transcription text
   */
  stopSpeechRecognition(): Promise<string>;

  /**
   * Cancel Apple speech recognition (iOS)
   */
  cancelSpeechRecognition(): Promise<void>;

  /**
   * Start Android speech recognition
   * @param locale - Optional locale identifier (e.g., "en-US")
   * @returns Session ID
   */
  startAndroidSpeechRecognition(locale: string | null): Promise<string>;

  /**
   * Get current Android transcription status
   */
  getAndroidTranscription(): Promise<TranscriptionStatus>;

  /**
   * Stop Android speech recognition and get final result
   * @returns Final transcription text
   */
  stopAndroidSpeechRecognition(): Promise<string>;

  /**
   * Cancel Android speech recognition
   */
  cancelAndroidSpeechRecognition(): Promise<void>;

  // MARK: - PCM Audio Recording Functions (Android only)

  /**
   * Start PCM audio recording to a WAV file (Android only)
   * Records 16kHz mono 16-bit PCM audio suitable for Whisper
   * @param outputPath - Path to save the WAV file
   * @returns The output path
   */
  startPCMRecording(outputPath: string): Promise<string>;

  /**
   * Stop PCM recording and get the result (Android only)
   * @returns Recording result with path, duration, and size
   */
  stopPCMRecording(): Promise<{
    path: string;
    duration: number;
    size: number;
  }>;

  /**
   * Cancel PCM recording and delete the file (Android only)
   */
  cancelPCMRecording(): Promise<void>;

  /**
   * Check if PCM recording is currently active (Android only)
   */
  isPCMRecording(): Promise<boolean>;

  /**
   * Get current audio metering level (Android only)
   * @returns Normalized level 0-1
   */
  getPCMMeteringLevel(): Promise<number>;
}

// Try to load the native module
let nativeModule: PlatformAIModuleType | null = null;
try {
  nativeModule = requireNativeModule<PlatformAIModuleType>("PlatformAI");
} catch {
  console.warn("[PlatformAI] Native module not available");
}

export default nativeModule;
