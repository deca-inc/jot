/**
 * Web shim for react-native-executorch
 *
 * ExecuTorch is a native-only ML runtime. On web/Tauri, AI features should
 * use remote API models, WebLLM, or the Web Speech API instead.
 *
 * This shim provides the type interfaces and stub implementations so that
 * code importing these types can compile and run on web without errors.
 * Actual AI functionality on web should go through remote model providers.
 */

/**
 * Message type used by ExecuTorch LLM for chat conversations.
 */
export interface Message {
  role: string;
  content: string;
}

/**
 * Speech-to-text model configuration.
 */
export interface RNESpeechToTextModelConfig {
  modelSource: string;
  tokenizerSource?: string;
  multilingual?: boolean;
}

/**
 * Stub LLMModule for web.
 *
 * All operations throw or return safe defaults since native
 * ExecuTorch models cannot run in the browser.
 */
export class LLMModule {
  constructor(_options: Record<string, unknown>) {
    // No-op constructor
  }

  async load(_config: {
    modelSource: string;
    tokenizerSource?: string;
    tokenizerConfigSource?: string;
  }): Promise<void> {
    throw new Error(
      "LLMModule.load is not available on web. Use remote API models instead.",
    );
  }

  async generate(_messages: Message[]): Promise<string> {
    throw new Error(
      "LLMModule.generate is not available on web. Use remote API models instead.",
    );
  }

  setTokenCallback(_config: { tokenCallback: (token: string) => void }): void {
    // No-op on web
  }

  interrupt(): void {
    // No-op on web
  }

  delete(): void {
    // No-op on web
  }
}

/**
 * Stub SpeechToTextModule for web.
 *
 * On web, consider using the Web Speech API or a remote transcription
 * service instead of on-device Whisper.
 */
export class SpeechToTextModule {
  async load(_config: RNESpeechToTextModelConfig): Promise<void> {
    throw new Error(
      "SpeechToTextModule.load is not available on web. Use Web Speech API instead.",
    );
  }

  async transcribe(
    _waveform: Float32Array,
    _options?: { language: string },
  ): Promise<string> {
    throw new Error("SpeechToTextModule.transcribe is not available on web.");
  }
}
