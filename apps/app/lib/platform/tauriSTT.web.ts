/**
 * Tauri implementation of the Tauri STT platform adapter.
 *
 * Runs local speech-to-text via native Rust inference (whisper-rs / whisper.cpp)
 * exposed through Tauri's `invoke()` IPC with progress streaming via Tauri
 * Channels.
 *
 * Flow:
 * - `load`       -> invoke `stt_load`       with a Channel<ProgressEvent>
 * - `transcribe` -> invoke `stt_transcribe`
 * - `unload`     -> invoke `stt_unload`
 *
 * The webview loads the same web bundle as the browser, so this file is
 * resolved by Metro/webpack in both environments. Callers must gate usage
 * behind `isTauri()` at runtime.
 */

import { Channel, invoke } from "@tauri-apps/api/core";

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
 * Streaming progress event emitted by the Rust side while a model is loading.
 */
interface ProgressEvent {
  loaded: number;
  total: number;
  text: string;
}

/**
 * Create a new Tauri STT engine instance.
 */
export function createTauriSTTEngine(): TauriSTTEngine {
  return new TauriSTTEngineImpl();
}

/**
 * Concrete engine implementation backed by Tauri's `invoke()` IPC to
 * native Rust whisper-rs inference.
 */
class TauriSTTEngineImpl implements TauriSTTEngine {
  private loadedModelId: string | null = null;

  async load(config: TauriSTTConfig): Promise<void> {
    // No-op if the same model is already loaded.
    if (this.loadedModelId === config.modelId) {
      return;
    }

    // Switch models: unload the previous one first.
    if (this.loadedModelId !== null) {
      await this.unload();
    }

    const channel = new Channel<ProgressEvent>();
    if (config.onProgress) {
      const onProgress = config.onProgress;
      channel.onmessage = (event: ProgressEvent) => {
        onProgress({
          loaded: event.loaded,
          total: event.total,
          text: event.text,
        });
      };
    }

    await invoke("stt_load", {
      modelPath: config.modelPath,
      modelId: config.modelId,
      onProgress: channel,
    });

    this.loadedModelId = config.modelId;
  }

  async transcribe(
    audioData: Float32Array,
    language?: string,
  ): Promise<TauriTranscriptionResult> {
    if (this.loadedModelId === null) {
      throw new Error("Model not loaded");
    }

    // Float32Array doesn't serialize as JSON over Tauri IPC — convert
    // to a plain number array.
    const audioArray: number[] = Array.from(audioData);

    const result = await invoke<TauriTranscriptionResult>("stt_transcribe", {
      audioData: audioArray,
      language: language ?? null,
    });

    return result;
  }

  async unload(): Promise<void> {
    if (this.loadedModelId === null) {
      return;
    }
    await invoke("stt_unload", {});
    this.loadedModelId = null;
  }

  isLoaded(): boolean {
    return this.loadedModelId !== null;
  }

  getLoadedModelId(): string | null {
    return this.loadedModelId;
  }
}
