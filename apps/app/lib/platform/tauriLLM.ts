/**
 * Platform abstraction for the Tauri Desktop LLM adapter (native stub).
 *
 * The Tauri adapter runs local LLMs via native Rust inference (mistralrs)
 * exposed through Tauri's `invoke()` IPC with streaming via Tauri Channels.
 * It is only usable inside a Tauri webview.
 *
 * On native platforms (iOS/Android/macOS via react-native-macos), on-device
 * inference goes through executorch instead — so this module throws.
 *
 * On web/Tauri, the .web.ts version is loaded via Metro/webpack resolution.
 */

/**
 * Configuration for loading a Tauri LLM model from disk.
 */
export interface TauriLLMConfig {
  /** Absolute path to the `.gguf` model file on disk. */
  modelPath: string;
  /** Human-readable model identifier. */
  modelId: string;
  /** Context window size (default 4096). */
  contextSize?: number;
  /** Progress callback during model loading. */
  onProgress?: (progress: {
    loaded: number;
    total: number;
    text: string;
  }) => void;
}

/**
 * Chat message passed to the Tauri LLM engine.
 */
export interface TauriLLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Options for a single generation request.
 */
export interface TauriLLMGenerateOptions {
  onToken?: (token: string) => void;
  signal?: AbortSignal;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Engine interface for Tauri-based LLM inference.
 */
export interface TauriLLMEngine {
  load(config: TauriLLMConfig): Promise<void>;
  generate(
    messages: TauriLLMMessage[],
    options?: TauriLLMGenerateOptions,
  ): Promise<string>;
  interrupt(): Promise<void>;
  unload(): Promise<void>;
  isLoaded(): boolean;
  getLoadedModelId(): string | null;
}

/**
 * Create a new Tauri LLM engine instance.
 *
 * On native this throws immediately — use executorch instead.
 */
export function createTauriLLMEngine(): TauriLLMEngine {
  throw new Error("Tauri LLM is not available on native platforms");
}
