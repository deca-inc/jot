/**
 * Tests for remoteSTTSender
 *
 * Tests the orchestration of remote speech-to-text:
 * - Fetching model config from database
 * - Getting API key from secure storage
 * - Privacy acknowledgment verification
 * - Calling RemoteApiClient.transcribeAudio
 */

import { createRemoteApiClient } from "./remoteApiClient";
import {
  sendRemoteTranscription,
  RemoteSTTNotFoundError,
  RemoteSTTPrivacyNotAcknowledgedError,
  type RemoteSTTDependencies,
} from "./remoteSTTSender";
import type { RemoteModelConfig } from "./customModels";

// Mock the remote API client
const mockTranscribeAudio = jest.fn();
jest.mock("./remoteApiClient", () => {
  return {
    createRemoteApiClient: jest.fn(() => ({
      transcribeAudio: mockTranscribeAudio,
      sendMessage: jest.fn(),
      sendMessageStreaming: jest.fn(),
    })),
    RemoteApiError: class MockRemoteApiError extends Error {
      statusCode: number;
      details?: unknown;
      constructor(message: string, code: number, details?: unknown) {
        super(message);
        this.name = "RemoteApiError";
        this.statusCode = code;
        this.details = details;
      }
    },
  };
});

const mockCreateRemoteApiClient = createRemoteApiClient as jest.MockedFunction<
  typeof createRemoteApiClient
>;

describe("sendRemoteTranscription", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTranscribeAudio.mockReset();
    mockCreateRemoteApiClient.mockReturnValue({
      transcribeAudio: mockTranscribeAudio,
      sendMessage: jest.fn(),
      sendMessageStreaming: jest.fn(),
    } as unknown as ReturnType<typeof createRemoteApiClient>);
  });

  describe("successful transcription", () => {
    it("transcribes audio using remote API", async () => {
      const mockConfig: RemoteModelConfig = {
        modelId: "remote-openai-whisper",
        modelType: "remote-api",
        modelCategory: "stt",
        displayName: "OpenAI Whisper",
        providerId: "openai-compatible",
        baseUrl: "https://api.openai.com/v1",
        modelName: "whisper-1",
        apiKeyRef: "openai-key",
        isEnabled: true,
        privacyAcknowledged: true,
      };

      const dependencies: RemoteSTTDependencies = {
        getModelConfig: jest.fn().mockResolvedValue(mockConfig),
        getApiKey: jest.fn().mockResolvedValue("sk-test-key"),
      };

      mockTranscribeAudio.mockResolvedValue({
        text: "Hello world",
      });

      const audioData = new Uint8Array(100);

      const result = await sendRemoteTranscription(
        "remote-openai-whisper",
        audioData,
        {},
        dependencies,
      );

      expect(result.text).toBe("Hello world");
      expect(mockCreateRemoteApiClient).toHaveBeenCalledWith(
        "openai-compatible",
        "https://api.openai.com/v1",
        "whisper-1",
        "sk-test-key",
        undefined,
      );
    });

    it("passes language option to API client", async () => {
      const mockConfig: RemoteModelConfig = {
        modelId: "remote-groq-whisper",
        modelType: "remote-api",
        modelCategory: "stt",
        displayName: "Groq Whisper",
        providerId: "openai-compatible",
        baseUrl: "https://api.groq.com/openai/v1",
        modelName: "whisper-large-v3",
        apiKeyRef: "groq-key",
        isEnabled: true,
        privacyAcknowledged: true,
      };

      const dependencies: RemoteSTTDependencies = {
        getModelConfig: jest.fn().mockResolvedValue(mockConfig),
        getApiKey: jest.fn().mockResolvedValue("gsk-test"),
      };

      mockTranscribeAudio.mockResolvedValue({ text: "Bonjour" });

      const audioData = new Uint8Array(100);

      await sendRemoteTranscription(
        "remote-groq-whisper",
        audioData,
        { language: "fr" },
        dependencies,
      );

      expect(mockTranscribeAudio).toHaveBeenCalledWith(
        audioData,
        expect.objectContaining({ language: "fr" }),
      );
    });

    it("works without API key for self-hosted models", async () => {
      const mockConfig: RemoteModelConfig = {
        modelId: "remote-local-whisper",
        modelType: "remote-api",
        modelCategory: "stt",
        displayName: "Local Whisper",
        providerId: "openai-compatible",
        baseUrl: "http://localhost:8000/v1",
        modelName: "whisper-large",
        apiKeyRef: "",
        isEnabled: true,
        privacyAcknowledged: true,
      };

      const dependencies: RemoteSTTDependencies = {
        getModelConfig: jest.fn().mockResolvedValue(mockConfig),
        getApiKey: jest.fn().mockResolvedValue(null),
      };

      mockTranscribeAudio.mockResolvedValue({ text: "Local transcription" });

      const audioData = new Uint8Array(100);

      const result = await sendRemoteTranscription(
        "remote-local-whisper",
        audioData,
        {},
        dependencies,
      );

      expect(result.text).toBe("Local transcription");
      expect(mockCreateRemoteApiClient).toHaveBeenCalledWith(
        "openai-compatible",
        "http://localhost:8000/v1",
        "whisper-large",
        "", // Empty string for self-hosted
        undefined,
      );
    });
  });

  describe("error handling", () => {
    it("throws RemoteSTTNotFoundError when model not found", async () => {
      const dependencies: RemoteSTTDependencies = {
        getModelConfig: jest.fn().mockResolvedValue(null),
        getApiKey: jest.fn(),
      };

      const audioData = new Uint8Array(100);

      await expect(
        sendRemoteTranscription(
          "nonexistent-model",
          audioData,
          {},
          dependencies,
        ),
      ).rejects.toThrow(RemoteSTTNotFoundError);
    });

    it("throws RemoteSTTPrivacyNotAcknowledgedError when privacy not acknowledged", async () => {
      const mockConfig: RemoteModelConfig = {
        modelId: "remote-openai-whisper",
        modelType: "remote-api",
        modelCategory: "stt",
        displayName: "OpenAI Whisper",
        providerId: "openai-compatible",
        baseUrl: "https://api.openai.com/v1",
        modelName: "whisper-1",
        apiKeyRef: "openai-key",
        isEnabled: true,
        privacyAcknowledged: false, // Not acknowledged
      };

      const dependencies: RemoteSTTDependencies = {
        getModelConfig: jest.fn().mockResolvedValue(mockConfig),
        getApiKey: jest.fn(),
      };

      const audioData = new Uint8Array(100);

      await expect(
        sendRemoteTranscription(
          "remote-openai-whisper",
          audioData,
          {},
          dependencies,
        ),
      ).rejects.toThrow(RemoteSTTPrivacyNotAcknowledgedError);
    });

    it("throws RemoteSTTNotFoundError when model category is not stt", async () => {
      const mockConfig: RemoteModelConfig = {
        modelId: "remote-gpt-4",
        modelType: "remote-api",
        modelCategory: "llm", // Wrong category
        displayName: "GPT-4",
        providerId: "openai-compatible",
        baseUrl: "https://api.openai.com/v1",
        modelName: "gpt-4",
        apiKeyRef: "openai-key",
        isEnabled: true,
        privacyAcknowledged: true,
      };

      const dependencies: RemoteSTTDependencies = {
        getModelConfig: jest.fn().mockResolvedValue(mockConfig),
        getApiKey: jest.fn(),
      };

      const audioData = new Uint8Array(100);

      await expect(
        sendRemoteTranscription("remote-gpt-4", audioData, {}, dependencies),
      ).rejects.toThrow(RemoteSTTNotFoundError);
    });
  });

  describe("abort support", () => {
    it("passes abort signal to API client", async () => {
      const mockConfig: RemoteModelConfig = {
        modelId: "remote-openai-whisper",
        modelType: "remote-api",
        modelCategory: "stt",
        displayName: "OpenAI Whisper",
        providerId: "openai-compatible",
        baseUrl: "https://api.openai.com/v1",
        modelName: "whisper-1",
        apiKeyRef: "openai-key",
        isEnabled: true,
        privacyAcknowledged: true,
      };

      const dependencies: RemoteSTTDependencies = {
        getModelConfig: jest.fn().mockResolvedValue(mockConfig),
        getApiKey: jest.fn().mockResolvedValue("sk-test"),
      };

      mockTranscribeAudio.mockResolvedValue({ text: "Test" });

      const audioData = new Uint8Array(100);
      const abortController = new AbortController();

      await sendRemoteTranscription(
        "remote-openai-whisper",
        audioData,
        { abortSignal: abortController.signal },
        dependencies,
      );

      expect(mockTranscribeAudio).toHaveBeenCalledWith(
        audioData,
        expect.objectContaining({ abortSignal: abortController.signal }),
      );
    });
  });
});
