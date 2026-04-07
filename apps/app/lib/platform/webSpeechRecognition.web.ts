/**
 * Web Speech Recognition - Browser implementation
 *
 * Uses the browser's built-in SpeechRecognition API (or the webkit-prefixed
 * variant) to provide zero-download speech-to-text on web.
 *
 * Supported in Chrome, Edge, Safari (partial), and most Chromium browsers.
 * Firefox does not support the Web Speech API.
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

/**
 * Type declarations for the Web Speech API.
 *
 * The standard SpeechRecognition interface is not yet in all TypeScript
 * lib definitions, and Chrome still ships the webkit-prefixed version.
 */
interface SpeechRecognitionEvent {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  readonly length: number;
  readonly isFinal: boolean;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionErrorEvent {
  readonly error: string;
  readonly message: string;
}

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

interface WebSpeechWindow {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

/**
 * Check whether the Web Speech API is available in the current browser.
 */
export function isWebSpeechAvailable(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const w = window as unknown as WebSpeechWindow;
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

/**
 * Create a Web Speech Recognition handle that wraps the browser API
 * with a simpler callback interface.
 *
 * @param options.lang       BCP-47 language tag (default: browser default)
 * @param options.continuous Whether recognition continues after pauses (default: true)
 * @param options.interimResults Whether to deliver partial results (default: true)
 */
export function createWebSpeechRecognition(options?: {
  lang?: string;
  continuous?: boolean;
  interimResults?: boolean;
}): WebSpeechRecognitionHandle {
  if (!isWebSpeechAvailable()) {
    throw new Error("Web Speech API is not available in this browser");
  }

  const w = window as unknown as WebSpeechWindow;
  const SpeechRecognitionCtor =
    w.SpeechRecognition ?? w.webkitSpeechRecognition;

  if (!SpeechRecognitionCtor) {
    throw new Error("Web Speech API is not available in this browser");
  }

  const recognition = new SpeechRecognitionCtor();

  if (options?.lang) {
    recognition.lang = options.lang;
  }
  recognition.continuous = options?.continuous ?? true;
  recognition.interimResults = options?.interimResults ?? true;
  recognition.maxAlternatives = 1;

  const handle: WebSpeechRecognitionHandle = {
    onResult: null,
    onError: null,
    onEnd: null,

    start() {
      recognition.start();
    },

    stop() {
      recognition.stop();
    },

    abort() {
      recognition.abort();
    },
  };

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    if (!handle.onResult) return;

    // Build the full transcript from all results
    let fullTranscript = "";
    let allFinal = true;

    for (let i = 0; i < event.results.length; i++) {
      const result = event.results[i];
      fullTranscript += result[0].transcript;
      if (!result.isFinal) {
        allFinal = false;
      }
    }

    handle.onResult({
      transcript: fullTranscript,
      isFinal: allFinal,
    });
  };

  recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
    handle.onError?.(
      event.error || event.message || "Speech recognition error",
    );
  };

  recognition.onend = () => {
    handle.onEnd?.();
  };

  return handle;
}
