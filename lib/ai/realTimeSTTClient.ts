/**
 * Real-Time Speech-to-Text WebSocket Client
 *
 * Manages WebSocket connections to real-time STT providers (Deepgram, OpenAI Realtime).
 * Handles provider-specific message parsing and emits transcript events.
 */

import type { RealTimeConfig } from "./realTimeProviders";

// =============================================================================
// TYPES
// =============================================================================

export interface TranscriptEvent {
  /** The transcribed text */
  text: string;
  /** Whether this is a final (committed) result */
  isFinal: boolean;
  /** Timestamp of the event */
  timestamp: number;
}

export interface RealTimeSTTEvents {
  connected: () => void;
  disconnected: () => void;
  transcript: (event: TranscriptEvent) => void;
  error: (message: string) => void;
}

type EventName = keyof RealTimeSTTEvents;

// =============================================================================
// CLIENT
// =============================================================================

export class RealTimeSTTClient {
  private config: RealTimeConfig;
  private ws: WebSocket | null = null;
  private connected = false;
  private listeners: Map<EventName, Set<RealTimeSTTEvents[EventName]>> =
    new Map();

  constructor(config: RealTimeConfig) {
    this.config = config;
  }

  /**
   * Connect to the WebSocket server.
   * Returns a promise that resolves when connected.
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      let resolved = false;

      try {
        // Create WebSocket connection
        // React Native WebSocket supports headers via third parameter
        // Browser WebSocket does not support custom headers
        let wsUrl = this.config.wsUrl;

        // For Deepgram, add token to URL (more reliable than headers in RN)
        if (this.config.provider === "deepgram" && this.config.authToken) {
          const separator = wsUrl.includes("?") ? "&" : "?";
          wsUrl = `${wsUrl}${separator}token=${encodeURIComponent(this.config.authToken)}`;
        }

        // Try to create WebSocket with headers (React Native supports this)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ws = new (WebSocket as any)(
          wsUrl,
          undefined, // protocols
          { headers: this.config.headers }, // React Native specific option
        ) as WebSocket;

        this.ws = ws;

        ws.onopen = () => {
          resolved = true;
          this.connected = true;
          this.emit("connected");

          // For OpenAI Realtime, send session config
          if (this.config.provider === "openai-realtime") {
            this.sendOpenAISessionConfig();
          }

          resolve();
        };

        ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        ws.onerror = (event) => {
          const message =
            (event as ErrorEvent).message || "WebSocket error occurred";
          this.emit("error", message);
          // Only reject if we haven't resolved yet
          if (!resolved) {
            reject(new Error(message));
          }
        };

        ws.onclose = () => {
          this.connected = false;
          this.emit("disconnected");
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to connect";
        this.emit("error", message);
        reject(new Error(message));
      }
    });
  }

  /**
   * Disconnect from the WebSocket server.
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close(1000, "Client disconnected");
      this.ws = null;
    }
    this.connected = false;
  }

  /**
   * Check if connected to the server.
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Send audio data to the server.
   * @param audioData - PCM audio data as Uint8Array
   * @param commit - Whether to commit the audio buffer (for OpenAI, signals end of audio)
   */
  sendAudio(audioData: Uint8Array, commit: boolean = true): void {
    if (!this.ws || !this.connected) {
      return;
    }

    if (this.config.provider === "openai-realtime") {
      // OpenAI Realtime expects base64-encoded audio in JSON messages
      // Convert Uint8Array to base64
      let binary = "";
      for (let i = 0; i < audioData.length; i++) {
        binary += String.fromCharCode(audioData[i]);
      }
      const base64Audio = btoa(binary);

      // Send audio buffer append
      this.ws.send(
        JSON.stringify({
          type: "input_audio_buffer.append",
          audio: base64Audio,
        }),
      );

      if (commit) {
        // Commit the audio buffer to signal end of input
        // This triggers input_audio_transcription.completed event
        // We do NOT call response.create - we only want transcription, not AI response
        this.ws.send(
          JSON.stringify({
            type: "input_audio_buffer.commit",
          }),
        );
      }
    } else {
      // Deepgram: Send as binary
      this.ws.send(audioData.buffer);
    }
  }

  /**
   * Add an event listener.
   */
  on<K extends EventName>(event: K, listener: RealTimeSTTEvents[K]): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }

  /**
   * Remove an event listener.
   */
  off<K extends EventName>(event: K, listener: RealTimeSTTEvents[K]): void {
    this.listeners.get(event)?.delete(listener);
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  private emit<K extends EventName>(
    event: K,
    ...args: Parameters<RealTimeSTTEvents[K]>
  ): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (listener as (...args: any[]) => void)(...args);
        } catch (err) {
          console.error(`[RealTimeSTTClient] Error in ${event} listener:`, err);
        }
      }
    }
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      switch (this.config.provider) {
        case "deepgram":
          this.handleDeepgramMessage(message);
          break;
        case "openai-realtime":
          this.handleOpenAIMessage(message);
          break;
      }
    } catch (err) {
      // Log but don't crash on malformed messages
      console.warn("[RealTimeSTTClient] Failed to parse message:", err);
    }
  }

  // ===========================================================================
  // DEEPGRAM
  // ===========================================================================

  private handleDeepgramMessage(message: DeepgramMessage): void {
    // Log all message types for debugging
    console.log("[RealTimeSTTClient] Deepgram message type:", message.type);

    // Only process Results messages
    if (message.type !== "Results") {
      // Log other message types that might indicate issues
      if (message.type === "Metadata") {
        console.log(
          "[RealTimeSTTClient] Deepgram metadata:",
          JSON.stringify(message),
        );
      } else if (message.type === "Error") {
        console.error(
          "[RealTimeSTTClient] Deepgram error:",
          JSON.stringify(message),
        );
      }
      return;
    }

    const transcript = message.channel?.alternatives?.[0]?.transcript ?? "";
    const isFinal = message.is_final ?? false;

    console.log(
      `[RealTimeSTTClient] Deepgram transcript (final=${isFinal}):`,
      transcript || "(empty)",
    );

    this.emit("transcript", {
      text: transcript,
      isFinal,
      timestamp: Date.now(),
    });
  }

  // ===========================================================================
  // OPENAI REALTIME
  // ===========================================================================

  private sendOpenAISessionConfig(): void {
    if (!this.ws) return;

    // Send session update to configure for transcription
    // Use text-only modality since we just want transcription
    const sessionConfig = {
      type: "session.update",
      session: {
        modalities: ["text"],
        input_audio_format: "pcm16", // 16-bit PCM
        input_audio_transcription: {
          model: "whisper-1",
        },
        turn_detection: null, // Disable automatic turn detection, we'll commit manually
      },
    };

    this.ws.send(JSON.stringify(sessionConfig));
  }

  private handleOpenAIMessage(message: OpenAIRealtimeMessage): void {
    // Log message type for debugging
    console.log("[RealTimeSTTClient] OpenAI message:", message.type);

    switch (message.type) {
      case "session.created":
      case "session.updated":
        // Session is ready
        console.log("[RealTimeSTTClient] OpenAI session ready");
        break;

      case "conversation.item.input_audio_transcription.completed":
        // Final transcription of user input audio - this is what we want!
        console.log(
          "[RealTimeSTTClient] Got transcription:",
          message.transcript,
        );
        this.emit("transcript", {
          text: message.transcript || "",
          isFinal: true,
          timestamp: Date.now(),
        });
        break;

      case "conversation.item.input_audio_transcription.failed":
        // Transcription failed
        console.error(
          "[RealTimeSTTClient] Transcription failed:",
          message.error,
        );
        this.emit("error", message.error?.message || "Transcription failed");
        break;

      case "input_audio_buffer.committed":
        // Audio buffer was committed, transcription should be processing
        console.log(
          "[RealTimeSTTClient] Audio buffer committed, waiting for transcription...",
        );
        break;

      case "input_audio_buffer.speech_started":
        // Voice activity detected
        console.log("[RealTimeSTTClient] Speech started");
        break;

      case "input_audio_buffer.speech_stopped":
        // Voice activity ended
        console.log("[RealTimeSTTClient] Speech stopped");
        break;

      case "error":
        this.emit("error", message.error?.message || "OpenAI Realtime error");
        break;
    }
  }
}

// =============================================================================
// PROVIDER MESSAGE TYPES
// =============================================================================

interface DeepgramMessage {
  type: string;
  is_final?: boolean;
  channel?: {
    alternatives?: Array<{
      transcript?: string;
      confidence?: number;
    }>;
  };
}

interface OpenAIRealtimeMessage {
  type: string;
  delta?: string;
  text?: string;
  transcript?: string;
  response?: {
    output?: Array<{
      type: string;
      content?: Array<{
        type: string;
        text?: string;
        transcript?: string;
      }>;
    }>;
  };
  error?: {
    message?: string;
    code?: string;
  };
}
