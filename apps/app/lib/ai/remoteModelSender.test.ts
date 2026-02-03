import { createRemoteApiClient } from "./remoteApiClient";
import {
  sendRemoteMessage,
  RemoteModelNotFoundError,
  RemoteModelPrivacyNotAcknowledgedError,
  type RemoteModelDependencies,
} from "./remoteModelSender";
import type { RemoteModelConfig } from "./customModels";
import type { ChatMessage } from "./remoteApiClient";

// Mock the remoteApiClient module
jest.mock("./remoteApiClient", () => {
  class MockRemoteApiError extends Error {
    statusCode: number;
    details?: unknown;
    constructor(message: string, statusCode: number, details?: unknown) {
      super(message);
      this.name = "RemoteApiError";
      this.statusCode = statusCode;
      this.details = details;
    }
  }
  return {
    createRemoteApiClient: jest.fn(() => ({
      sendMessage: jest.fn().mockResolvedValue("non-streaming response"),
      sendMessageStreaming: jest.fn().mockResolvedValue("streaming response"),
    })),
    RemoteApiError: MockRemoteApiError,
  };
});

const mockedCreateRemoteApiClient =
  createRemoteApiClient as jest.MockedFunction<typeof createRemoteApiClient>;

describe("sendRemoteMessage", () => {
  const mockModelConfig: RemoteModelConfig = {
    modelId: "remote-openai-compatible-gpt-4",
    modelType: "remote-api",
    modelCategory: "llm",
    displayName: "GPT-4",
    description: "OpenAI GPT-4",
    providerId: "openai-compatible",
    baseUrl: "https://api.openai.com/v1",
    modelName: "gpt-4",
    apiKeyRef: "remote-openai-compatible-gpt-4-key",
    maxTokens: 4096,
    temperature: 0.7,
    isEnabled: true,
    privacyAcknowledged: true,
  };

  const mockMessages: ChatMessage[] = [
    { role: "user", content: "Hello, how are you?" },
  ];

  let mockDependencies: RemoteModelDependencies;
  let mockClient: {
    sendMessage: jest.Mock;
    sendMessageStreaming: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockClient = {
      sendMessage: jest.fn().mockResolvedValue("non-streaming response"),
      sendMessageStreaming: jest.fn().mockResolvedValue("streaming response"),
    };

    mockedCreateRemoteApiClient.mockReturnValue(
      mockClient as unknown as ReturnType<typeof createRemoteApiClient>,
    );

    mockDependencies = {
      getModelConfig: jest.fn().mockResolvedValue(mockModelConfig),
      getApiKey: jest.fn().mockResolvedValue("sk-test-api-key"),
    };
  });

  describe("successful requests", () => {
    it("sends a non-streaming message when no callbacks provided", async () => {
      const result = await sendRemoteMessage(
        "remote-openai-compatible-gpt-4",
        mockMessages,
        undefined,
        mockDependencies,
      );

      expect(result).toBe("non-streaming response");
      expect(mockClient.sendMessage).toHaveBeenCalledWith(mockMessages, {
        systemPrompt: undefined,
        maxTokens: 4096,
        temperature: 0.7,
        abortSignal: undefined,
      });
      expect(mockClient.sendMessageStreaming).not.toHaveBeenCalled();
    });

    it("sends a streaming message when responseCallback provided", async () => {
      const responseCallback = jest.fn();

      const result = await sendRemoteMessage(
        "remote-openai-compatible-gpt-4",
        mockMessages,
        { responseCallback },
        mockDependencies,
      );

      expect(result).toBe("streaming response");
      expect(mockClient.sendMessageStreaming).toHaveBeenCalledWith(
        mockMessages,
        expect.objectContaining({
          responseCallback,
          maxTokens: 4096,
          temperature: 0.7,
        }),
      );
      expect(mockClient.sendMessage).not.toHaveBeenCalled();
    });

    it("sends a streaming message when completeCallback provided", async () => {
      const completeCallback = jest.fn();

      const result = await sendRemoteMessage(
        "remote-openai-compatible-gpt-4",
        mockMessages,
        { completeCallback },
        mockDependencies,
      );

      expect(result).toBe("streaming response");
      expect(mockClient.sendMessageStreaming).toHaveBeenCalledWith(
        mockMessages,
        expect.objectContaining({
          completeCallback,
        }),
      );
    });

    it("uses options for maxTokens and temperature when provided", async () => {
      await sendRemoteMessage(
        "remote-openai-compatible-gpt-4",
        mockMessages,
        { maxTokens: 1000, temperature: 0.5 },
        mockDependencies,
      );

      expect(mockClient.sendMessage).toHaveBeenCalledWith(
        mockMessages,
        expect.objectContaining({
          maxTokens: 1000,
          temperature: 0.5,
        }),
      );
    });

    it("creates client with correct config", async () => {
      await sendRemoteMessage(
        "remote-openai-compatible-gpt-4",
        mockMessages,
        undefined,
        mockDependencies,
      );

      expect(createRemoteApiClient).toHaveBeenCalledWith(
        "openai-compatible",
        "https://api.openai.com/v1",
        "gpt-4",
        "sk-test-api-key",
        undefined, // customHeaders
      );
    });

    it("passes custom headers to client", async () => {
      const modelWithHeaders: RemoteModelConfig = {
        ...mockModelConfig,
        customHeaders: { "X-Custom-Header": "value" },
      };
      mockDependencies.getModelConfig = jest
        .fn()
        .mockResolvedValue(modelWithHeaders);

      await sendRemoteMessage(
        "remote-openai-compatible-gpt-4",
        mockMessages,
        undefined,
        mockDependencies,
      );

      expect(createRemoteApiClient).toHaveBeenCalledWith(
        "openai-compatible",
        "https://api.openai.com/v1",
        "gpt-4",
        "sk-test-api-key",
        { "X-Custom-Header": "value" },
      );
    });

    it("passes abortSignal to the request", async () => {
      const abortController = new AbortController();

      await sendRemoteMessage(
        "remote-openai-compatible-gpt-4",
        mockMessages,
        { abortSignal: abortController.signal },
        mockDependencies,
      );

      expect(mockClient.sendMessage).toHaveBeenCalledWith(
        mockMessages,
        expect.objectContaining({
          abortSignal: abortController.signal,
        }),
      );
    });
  });

  describe("error handling", () => {
    it("throws RemoteModelNotFoundError when model not found", async () => {
      mockDependencies.getModelConfig = jest.fn().mockResolvedValue(null);

      await expect(
        sendRemoteMessage(
          "remote-nonexistent",
          mockMessages,
          undefined,
          mockDependencies,
        ),
      ).rejects.toThrow(RemoteModelNotFoundError);

      await expect(
        sendRemoteMessage(
          "remote-nonexistent",
          mockMessages,
          undefined,
          mockDependencies,
        ),
      ).rejects.toThrow("Remote model not found: remote-nonexistent");
    });

    it("works without API key for self-hosted models", async () => {
      mockDependencies.getApiKey = jest.fn().mockResolvedValue(null);

      const result = await sendRemoteMessage(
        "remote-openai-compatible-gpt-4",
        mockMessages,
        undefined,
        mockDependencies,
      );

      expect(result).toBe("non-streaming response");
      expect(createRemoteApiClient).toHaveBeenCalledWith(
        "openai-compatible",
        "https://api.openai.com/v1",
        "gpt-4",
        "", // Empty string when no API key
        undefined,
      );
    });

    it("throws RemoteModelPrivacyNotAcknowledgedError when privacy not acknowledged", async () => {
      const unacknowledgedModel: RemoteModelConfig = {
        ...mockModelConfig,
        privacyAcknowledged: false,
      };
      mockDependencies.getModelConfig = jest
        .fn()
        .mockResolvedValue(unacknowledgedModel);

      await expect(
        sendRemoteMessage(
          "remote-openai-compatible-gpt-4",
          mockMessages,
          undefined,
          mockDependencies,
        ),
      ).rejects.toThrow(RemoteModelPrivacyNotAcknowledgedError);

      await expect(
        sendRemoteMessage(
          "remote-openai-compatible-gpt-4",
          mockMessages,
          undefined,
          mockDependencies,
        ),
      ).rejects.toThrow(
        "Privacy not acknowledged for remote model: remote-openai-compatible-gpt-4",
      );
    });

    it("does not call getApiKey if model not found", async () => {
      mockDependencies.getModelConfig = jest.fn().mockResolvedValue(null);

      try {
        await sendRemoteMessage(
          "remote-nonexistent",
          mockMessages,
          undefined,
          mockDependencies,
        );
      } catch {
        // Expected to throw
      }

      expect(mockDependencies.getApiKey).not.toHaveBeenCalled();
    });

    it("does not call getApiKey if privacy not acknowledged", async () => {
      const unacknowledgedModel: RemoteModelConfig = {
        ...mockModelConfig,
        privacyAcknowledged: false,
      };
      mockDependencies.getModelConfig = jest
        .fn()
        .mockResolvedValue(unacknowledgedModel);

      try {
        await sendRemoteMessage(
          "remote-openai-compatible-gpt-4",
          mockMessages,
          undefined,
          mockDependencies,
        );
      } catch {
        // Expected to throw
      }

      expect(mockDependencies.getApiKey).not.toHaveBeenCalled();
    });
  });

  describe("dependency injection", () => {
    it("calls getModelConfig with the provided modelId", async () => {
      await sendRemoteMessage(
        "remote-openai-compatible-gpt-4",
        mockMessages,
        undefined,
        mockDependencies,
      );

      expect(mockDependencies.getModelConfig).toHaveBeenCalledWith(
        "remote-openai-compatible-gpt-4",
      );
    });

    it("calls getApiKey with the apiKeyRef from model config", async () => {
      await sendRemoteMessage(
        "remote-openai-compatible-gpt-4",
        mockMessages,
        undefined,
        mockDependencies,
      );

      expect(mockDependencies.getApiKey).toHaveBeenCalledWith(
        "remote-openai-compatible-gpt-4-key",
      );
    });
  });
});
