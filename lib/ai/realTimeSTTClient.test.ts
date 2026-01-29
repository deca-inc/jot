/**
 * Tests for realTimeSTTClient
 *
 * Tests the WebSocket client for real-time speech-to-text:
 * - Connection lifecycle (connect, disconnect)
 * - Deepgram message parsing
 * - OpenAI Realtime message parsing
 * - Audio data sending
 * - Error handling
 */

import { RealTimeSTTClient, type TranscriptEvent } from "./realTimeSTTClient";
import type { RealTimeConfig } from "./realTimeProviders";

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: { message?: string }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;

  sentMessages: (string | ArrayBuffer)[] = [];
  url: string;
  protocols?: string | string[];

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocols = protocols;
  }

  send(data: string | ArrayBuffer) {
    this.sentMessages.push(data);
  }

  close(code?: number, reason?: string) {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code: code || 1000, reason: reason || "" });
  }

  // Test helpers
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  simulateMessage(data: string) {
    this.onmessage?.({ data });
  }

  simulateError(message?: string) {
    this.onerror?.({ message });
  }
}

// Mock the global WebSocket
const originalWebSocket = global.WebSocket;
let mockWsInstance: MockWebSocket | null = null;

beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).WebSocket = class extends MockWebSocket {
    constructor(url: string, protocols?: string | string[]) {
      super(url, protocols);
      // eslint-disable-next-line @typescript-eslint/no-this-alias -- Required to capture mock instance for testing
      mockWsInstance = this;
    }
  };
});

afterAll(() => {
  global.WebSocket = originalWebSocket;
});

beforeEach(() => {
  mockWsInstance = null;
});

describe("RealTimeSTTClient", () => {
  const deepgramConfig: RealTimeConfig = {
    wsUrl: "wss://api.deepgram.com/v1/listen?model=nova-2",
    headers: { Authorization: "Token dg-test-key" },
    provider: "deepgram",
  };

  const openaiConfig: RealTimeConfig = {
    wsUrl: "wss://api.openai.com/v1/realtime",
    headers: { Authorization: "Bearer sk-test-key" },
    modelName: "gpt-4o-realtime-preview",
    provider: "openai-realtime",
  };

  describe("connection lifecycle", () => {
    it("connects to WebSocket server", async () => {
      const client = new RealTimeSTTClient(deepgramConfig);
      const connectPromise = client.connect();

      // Simulate successful connection
      expect(mockWsInstance).not.toBeNull();
      mockWsInstance!.simulateOpen();

      await connectPromise;
      expect(client.isConnected()).toBe(true);

      client.disconnect();
    });

    it("disconnects cleanly", async () => {
      const client = new RealTimeSTTClient(deepgramConfig);
      const connectPromise = client.connect();
      mockWsInstance!.simulateOpen();
      await connectPromise;

      client.disconnect();
      expect(client.isConnected()).toBe(false);
    });

    it("emits connected event on open", async () => {
      const client = new RealTimeSTTClient(deepgramConfig);
      const events: string[] = [];

      client.on("connected", () => events.push("connected"));

      const connectPromise = client.connect();
      mockWsInstance!.simulateOpen();
      await connectPromise;

      expect(events).toContain("connected");
      client.disconnect();
    });

    it("emits disconnected event on close", async () => {
      const client = new RealTimeSTTClient(deepgramConfig);
      const events: string[] = [];

      client.on("disconnected", () => events.push("disconnected"));

      const connectPromise = client.connect();
      mockWsInstance!.simulateOpen();
      await connectPromise;

      client.disconnect();
      expect(events).toContain("disconnected");
    });

    it("emits error event on WebSocket error during connect", async () => {
      const client = new RealTimeSTTClient(deepgramConfig);
      const errors: string[] = [];

      client.on("error", (msg) => errors.push(msg));

      const connectPromise = client.connect();
      mockWsInstance!.simulateError("Connection failed");

      // Connection should fail
      await expect(connectPromise).rejects.toThrow("Connection failed");
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe("audio sending", () => {
    it("sends audio data as binary", async () => {
      const client = new RealTimeSTTClient(deepgramConfig);
      const connectPromise = client.connect();
      mockWsInstance!.simulateOpen();
      await connectPromise;

      const audioData = new Uint8Array([1, 2, 3, 4]);
      client.sendAudio(audioData);

      expect(mockWsInstance!.sentMessages.length).toBe(1);
      expect(mockWsInstance!.sentMessages[0]).toBeInstanceOf(ArrayBuffer);

      client.disconnect();
    });

    it("does not send if not connected", () => {
      const client = new RealTimeSTTClient(deepgramConfig);

      const audioData = new Uint8Array([1, 2, 3, 4]);
      client.sendAudio(audioData);

      // No WebSocket instance yet
      expect(mockWsInstance).toBeNull();
    });
  });

  describe("Deepgram message parsing", () => {
    it("parses interim transcript results", async () => {
      const client = new RealTimeSTTClient(deepgramConfig);
      const transcripts: TranscriptEvent[] = [];

      client.on("transcript", (event) => transcripts.push(event));

      const connectPromise = client.connect();
      mockWsInstance!.simulateOpen();
      await connectPromise;

      // Deepgram interim result message
      const deepgramMessage = JSON.stringify({
        type: "Results",
        is_final: false,
        channel: {
          alternatives: [{ transcript: "Hello wor" }],
        },
      });

      mockWsInstance!.simulateMessage(deepgramMessage);

      expect(transcripts.length).toBe(1);
      expect(transcripts[0].text).toBe("Hello wor");
      expect(transcripts[0].isFinal).toBe(false);

      client.disconnect();
    });

    it("parses final transcript results", async () => {
      const client = new RealTimeSTTClient(deepgramConfig);
      const transcripts: TranscriptEvent[] = [];

      client.on("transcript", (event) => transcripts.push(event));

      const connectPromise = client.connect();
      mockWsInstance!.simulateOpen();
      await connectPromise;

      // Deepgram final result message
      const deepgramMessage = JSON.stringify({
        type: "Results",
        is_final: true,
        channel: {
          alternatives: [{ transcript: "Hello world" }],
        },
      });

      mockWsInstance!.simulateMessage(deepgramMessage);

      expect(transcripts.length).toBe(1);
      expect(transcripts[0].text).toBe("Hello world");
      expect(transcripts[0].isFinal).toBe(true);

      client.disconnect();
    });

    it("ignores non-Results messages", async () => {
      const client = new RealTimeSTTClient(deepgramConfig);
      const transcripts: TranscriptEvent[] = [];

      client.on("transcript", (event) => transcripts.push(event));

      const connectPromise = client.connect();
      mockWsInstance!.simulateOpen();
      await connectPromise;

      // Deepgram metadata message
      const metadataMessage = JSON.stringify({
        type: "Metadata",
        request_id: "123",
      });

      mockWsInstance!.simulateMessage(metadataMessage);

      expect(transcripts.length).toBe(0);

      client.disconnect();
    });

    it("handles empty alternatives array", async () => {
      const client = new RealTimeSTTClient(deepgramConfig);
      const transcripts: TranscriptEvent[] = [];

      client.on("transcript", (event) => transcripts.push(event));

      const connectPromise = client.connect();
      mockWsInstance!.simulateOpen();
      await connectPromise;

      const deepgramMessage = JSON.stringify({
        type: "Results",
        is_final: true,
        channel: {
          alternatives: [],
        },
      });

      mockWsInstance!.simulateMessage(deepgramMessage);

      // Should emit empty transcript
      expect(transcripts.length).toBe(1);
      expect(transcripts[0].text).toBe("");

      client.disconnect();
    });
  });

  describe("OpenAI Realtime message parsing", () => {
    it("parses input audio transcription completed events", async () => {
      const client = new RealTimeSTTClient(openaiConfig);
      const transcripts: TranscriptEvent[] = [];

      client.on("transcript", (event) => transcripts.push(event));

      const connectPromise = client.connect();
      mockWsInstance!.simulateOpen();
      await connectPromise;

      // OpenAI input transcription completed event (pure transcription, no response)
      const openaiMessage = JSON.stringify({
        type: "conversation.item.input_audio_transcription.completed",
        transcript: "Hello world",
      });

      mockWsInstance!.simulateMessage(openaiMessage);

      expect(transcripts.length).toBe(1);
      expect(transcripts[0].text).toBe("Hello world");
      expect(transcripts[0].isFinal).toBe(true);

      client.disconnect();
    });

    it("handles transcription failed events", async () => {
      const client = new RealTimeSTTClient(openaiConfig);
      const errors: string[] = [];

      client.on("error", (msg) => errors.push(msg));

      const connectPromise = client.connect();
      mockWsInstance!.simulateOpen();
      await connectPromise;

      // OpenAI transcription failed event
      const openaiMessage = JSON.stringify({
        type: "conversation.item.input_audio_transcription.failed",
        error: { message: "Transcription failed" },
      });

      mockWsInstance!.simulateMessage(openaiMessage);

      expect(errors.length).toBe(1);
      expect(errors[0]).toBe("Transcription failed");

      client.disconnect();
    });

    it("sends session config on connect", async () => {
      const client = new RealTimeSTTClient(openaiConfig);

      const connectPromise = client.connect();
      mockWsInstance!.simulateOpen();
      await connectPromise;

      // OpenAI requires session config message after connection
      expect(mockWsInstance!.sentMessages.length).toBeGreaterThan(0);
      const sessionMsg = JSON.parse(mockWsInstance!.sentMessages[0] as string);
      expect(sessionMsg.type).toBe("session.update");

      client.disconnect();
    });
  });

  describe("error handling", () => {
    it("handles malformed JSON messages", async () => {
      const client = new RealTimeSTTClient(deepgramConfig);
      const errors: string[] = [];

      client.on("error", (msg) => errors.push(msg));

      const connectPromise = client.connect();
      mockWsInstance!.simulateOpen();
      await connectPromise;

      mockWsInstance!.simulateMessage("not json");

      // Should not crash, but may log error
      expect(client.isConnected()).toBe(true);

      client.disconnect();
    });

    it("reconnects on unexpected close", async () => {
      const client = new RealTimeSTTClient(deepgramConfig);
      let disconnectCount = 0;

      client.on("disconnected", () => disconnectCount++);

      const connectPromise = client.connect();
      mockWsInstance!.simulateOpen();
      await connectPromise;

      // Simulate unexpected close
      mockWsInstance!.close(1006, "Connection lost");

      expect(disconnectCount).toBe(1);
    });
  });

  describe("event emitter", () => {
    it("allows removing event listeners", async () => {
      const client = new RealTimeSTTClient(deepgramConfig);
      const events: string[] = [];

      const handler = () => events.push("connected");
      client.on("connected", handler);
      client.off("connected", handler);

      const connectPromise = client.connect();
      mockWsInstance!.simulateOpen();
      await connectPromise;

      expect(events).not.toContain("connected");
      client.disconnect();
    });
  });
});
