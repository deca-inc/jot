/**
 * Platform abstraction for the Tauri Desktop STT adapter (native stub).
 *
 * The Tauri adapter runs local speech-to-text via native Rust inference
 * (whisper-rs / whisper.cpp) exposed through Tauri's `invoke()` IPC.
 * It is only usable inside a Tauri webview.
 *
 * On native platforms (iOS/Android/macOS via react-native-macos), on-device
 * STT goes through executorch instead — so this module throws.
 *
 * On web/Tauri, the .web.ts version is loaded via Metro/webpack resolution.
 */

/**
 * Configuration for loading a Tauri STT model from disk.
 */
export interface TauriSTTConfig {
  /** Absolute path to the whisper model file on disk. */
  modelPath: string;
  /** Human-readable model identifier. */
  modelId: string;
  /** Progress callback during model loading. */
  onProgress?: (progress: {
    loaded: number;
    total: number;
    text: string;
  }) => void;
}

/**
 * Result of a transcription operation.
 */
export interface TauriTranscriptionResult {
  /** The transcribed text. */
  text: string;
  /** Duration of the transcription in milliseconds. */
  durationMs: number;
}

/**
 * Engine interface for Tauri-based speech-to-text.
 */
export interface TauriSTTEngine {
  load(config: TauriSTTConfig): Promise<void>;
  transcribe(
    audioData: Float32Array,
    language?: string,
  ): Promise<TauriTranscriptionResult>;
  unload(): Promise<void>;
  isLoaded(): boolean;
  getLoadedModelId(): string | null;
}

/**
 * Create a new Tauri STT engine instance.
 *
 * On native this throws immediately — use executorch instead.
 */
export function createTauriSTTEngine(): TauriSTTEngine {
  throw new Error("Tauri STT is not available on native platforms");
}
