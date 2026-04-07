/**
 * Web Speech Recognition - Native platform stub
 *
 * This file is loaded on non-web platforms (iOS, Android, macOS).
 * The Web Speech API is only available in browsers, so everything returns
 * false / throws here.
 *
 * The real implementation lives in webSpeechRecognition.web.ts.
 */

export interface WebSpeechResult {
  transcript: string;
  isFinal: boolean;
}

export interface WebSpeechRecognitionHandle {
  start(): void;
  stop(): void;
  abort(): void;
  onResult: ((result: WebSpeechResult) => void) | null;
  onError: ((error: string) => void) | null;
  onEnd: (() => void) | null;
}

export function isWebSpeechAvailable(): boolean {
  return false;
}

export function createWebSpeechRecognition(_options?: {
  lang?: string;
  continuous?: boolean;
  interimResults?: boolean;
}): WebSpeechRecognitionHandle {
  throw new Error("Web Speech API is not available on this platform");
}
