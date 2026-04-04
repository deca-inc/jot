/**
 * Web shim for PlatformAIModule
 *
 * Platform AI uses native iOS/Android APIs (Apple Foundation Models, Gemini Nano).
 * These are not available on web. All methods return safe no-op/default values.
 *
 * On web/Tauri, AI features should use remote API models or WebLLM instead.
 */

export interface TranscriptionStatus {
  text: string;
  isFinal: boolean;
}

export interface PlatformAIModuleType {
  isAppleFoundationModelsAvailable(): Promise<boolean>;
  isGeminiNanoAvailable(): Promise<boolean>;
  getGeminiNanoStatus(): Promise<string>;
  downloadGeminiNano(): Promise<boolean>;
  generateWithAppleFoundation(
    systemPrompt: string,
    messages: Array<{ role: string; content: string }>,
  ): Promise<string>;
  generateWithGeminiNano(
    systemPrompt: string,
    messages: Array<{ role: string; content: string }>,
  ): Promise<string>;
  isAppleSpeechAvailable(): Promise<boolean>;
  isAndroidSpeechAvailable(): Promise<boolean>;
  requestSpeechPermission(): Promise<boolean>;
  startSpeechRecognition(locale: string | null): Promise<string>;
  getCurrentTranscription(): Promise<TranscriptionStatus>;
  stopSpeechRecognition(): Promise<string>;
  cancelSpeechRecognition(): Promise<void>;
  startAndroidSpeechRecognition(locale: string | null): Promise<string>;
  getAndroidTranscription(): Promise<TranscriptionStatus>;
  stopAndroidSpeechRecognition(): Promise<string>;
  cancelAndroidSpeechRecognition(): Promise<void>;
  startPCMRecording(outputPath: string): Promise<string>;
  stopPCMRecording(): Promise<{ path: string; duration: number; size: number }>;
  cancelPCMRecording(): Promise<void>;
  isPCMRecording(): Promise<boolean>;
  getPCMMeteringLevel(): Promise<number>;
}

/** Native module is not available on web */
const nativeModule: PlatformAIModuleType | null = null;

export default nativeModule;
