/**
 * Web shim for platform-ai module
 *
 * Platform AI uses native iOS/Android APIs (Apple Foundation Models, Gemini Nano,
 * Apple Speech Recognition, Android SpeechRecognizer).
 * None of these are available on web.
 *
 * All methods return safe no-op/default values.
 * On web/Tauri, AI features should use remote API models or WebLLM.
 * Speech-to-text on web could use the Web Speech API in the future.
 */

export interface TranscriptionStatus {
  text: string;
  isFinal: boolean;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface PCMRecordingResult {
  path: string;
  duration: number;
  size: number;
}

export type GeminiNanoStatus =
  | "available"
  | "downloadable"
  | "downloading"
  | "unavailable"
  | "unknown";

// -- LLM availability --

export async function isAppleFoundationModelsAvailable(): Promise<boolean> {
  return false;
}

export async function isGeminiNanoAvailable(): Promise<boolean> {
  return false;
}

export async function getGeminiNanoStatus(): Promise<GeminiNanoStatus> {
  return "unavailable";
}

export async function isGeminiNanoSupported(): Promise<boolean> {
  return false;
}

export async function downloadGeminiNano(): Promise<boolean> {
  return false;
}

export async function generateWithPlatformAI(
  _systemPrompt: string,
  _messages: ChatMessage[],
): Promise<string> {
  throw new Error("Platform AI is not available on web");
}

export async function isPlatformAIAvailable(): Promise<boolean> {
  return false;
}

// -- Speech-to-Text --

export async function isAppleSpeechAvailable(): Promise<boolean> {
  return false;
}

export async function isAndroidSpeechAvailable(): Promise<boolean> {
  return false;
}

export async function isPlatformSTTAvailable(): Promise<boolean> {
  return false;
}

export async function requestSpeechPermission(): Promise<boolean> {
  return false;
}

export async function startPlatformSpeechRecognition(
  _locale?: string,
): Promise<string> {
  throw new Error("Platform speech recognition is not available on web");
}

export async function getPlatformTranscription(): Promise<TranscriptionStatus> {
  return { text: "", isFinal: true };
}

export async function stopPlatformSpeechRecognition(): Promise<string> {
  throw new Error("Platform speech recognition is not available on web");
}

export async function cancelPlatformSpeechRecognition(): Promise<void> {
  // No-op on web
}

// -- PCM Audio Recording --

export function isPCMRecordingAvailable(): boolean {
  return false;
}

export async function startPCMRecording(_outputPath: string): Promise<string> {
  throw new Error("PCM recording is not available on web");
}

export async function stopPCMRecording(): Promise<PCMRecordingResult> {
  throw new Error("PCM recording is not available on web");
}

export async function cancelPCMRecording(): Promise<void> {
  // No-op on web
}

export async function isPCMRecording(): Promise<boolean> {
  return false;
}

export async function getPCMMeteringLevel(): Promise<number> {
  return 0;
}
