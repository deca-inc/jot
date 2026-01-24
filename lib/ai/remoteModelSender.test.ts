import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRemoteApiClient } from "./remoteApiClient";
import {
  sendRemoteMessage,
  RemoteModelNotFoundError,
  RemoteModelApiKeyMissingError,
  RemoteModelPrivacyNotAcknowledgedError,
  type RemoteModelDependencies,
} from "./remoteModelSender";
import type { RemoteModelConfig } from "./customModels";
import type { ChatMessage } from "./remoteApiClient";

// Mock the remoteApiClient module
vi.mock("./remoteApiClient", () => ({
  createRemoteApiClient: vi.fn(() => ({
    sendMessage: vi.fn().mockResolvedValue("non-streaming response"),
    sendMessageStreaming: vi.fn().mockResolvedValue("streaming response"),
  })),
  RemoteApiError: class RemoteApiError extends Error {
    constructor(
      message: string,
      public statusCode: number,
      public details?: unknown,
    ) {
      super(message);
      this.name = "RemoteApiError";
    }
  },
}));

describe("sendRemoteMessage", () => {
  const mockModelConfig: RemoteModelConfig = {
    modelId: "remote-openai-gpt-4",
    modelType: "remote-api",
    displayName: "GPT-4",
    description: "OpenAI GPT-4",
    providerId: "openai",
    baseUrl: "https://api.openai.com/v1",
    modelName: "gpt-4",
    apiKeyRef: "remote-openai-gpt-4-key",
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
    sendMessage: ReturnType<typeof vi.fn>;
    sendMessageStreaming: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockClient = {
      sendMessage: vi.fn().mockResolvedValue("non-streaming response"),
      sendMessageStreaming: vi.fn().mockResolvedValue("streaming response"),
    };

    vi.mocked(createRemoteApiClient).mockReturnValue(
      mockClient as unknown as ReturnType<typeof createRemoteApiClient>,
    );

    mockDependencies = {
      getModelConfig: vi.fn().mockResolvedValue(mockModelConfig),
      getApiKey: vi.fn().mockResolvedValue("sk-test-api-key"),
    };
  });

  describe("successful requests", () => {
    it("sends a non-streaming message when no callbacks provided", async () => {
      const result = await sendRemoteMessage(
        "remote-openai-gpt-4",
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
      const responseCallback = vi.fn();

      const result = await sendRemoteMessage(
        "remote-openai-gpt-4",
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
      const completeCallback = vi.fn();

      const result = await sendRemoteMessage(
        "remote-openai-gpt-4",
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
        "remote-openai-gpt-4",
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
        "remote-openai-gpt-4",
        mockMessages,
        undefined,
        mockDependencies,
      );

      expect(createRemoteApiClient).toHaveBeenCalledWith(
        "openai",
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
      mockDependencies.getModelConfig = vi
        .fn()
        .mockResolvedValue(modelWithHeaders);

      await sendRemoteMessage(
        "remote-openai-gpt-4",
        mockMessages,
        undefined,
        mockDependencies,
      );

      expect(createRemoteApiClient).toHaveBeenCalledWith(
        "openai",
        "https://api.openai.com/v1",
        "gpt-4",
        "sk-test-api-key",
        { "X-Custom-Header": "value" },
      );
    });

    it("passes abortSignal to the request", async () => {
      const abortController = new AbortController();

      await sendRemoteMessage(
        "remote-openai-gpt-4",
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
      mockDependencies.getModelConfig = vi.fn().mockResolvedValue(null);

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

    it("throws RemoteModelApiKeyMissingError when API key not found", async () => {
      mockDependencies.getApiKey = vi.fn().mockResolvedValue(null);

      await expect(
        sendRemoteMessage(
          "remote-openai-gpt-4",
          mockMessages,
          undefined,
          mockDependencies,
        ),
      ).rejects.toThrow(RemoteModelApiKeyMissingError);

      await expect(
        sendRemoteMessage(
          "remote-openai-gpt-4",
          mockMessages,
          undefined,
          mockDependencies,
        ),
      ).rejects.toThrow(
        "API key not found for remote model: remote-openai-gpt-4",
      );
    });

    it("throws RemoteModelPrivacyNotAcknowledgedError when privacy not acknowledged", async () => {
      const unacknowledgedModel: RemoteModelConfig = {
        ...mockModelConfig,
        privacyAcknowledged: false,
      };
      mockDependencies.getModelConfig = vi
        .fn()
        .mockResolvedValue(unacknowledgedModel);

      await expect(
        sendRemoteMessage(
          "remote-openai-gpt-4",
          mockMessages,
          undefined,
          mockDependencies,
        ),
      ).rejects.toThrow(RemoteModelPrivacyNotAcknowledgedError);

      await expect(
        sendRemoteMessage(
          "remote-openai-gpt-4",
          mockMessages,
          undefined,
          mockDependencies,
        ),
      ).rejects.toThrow(
        "Privacy not acknowledged for remote model: remote-openai-gpt-4",
      );
    });

    it("does not call getApiKey if model not found", async () => {
      mockDependencies.getModelConfig = vi.fn().mockResolvedValue(null);

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
      mockDependencies.getModelConfig = vi
        .fn()
        .mockResolvedValue(unacknowledgedModel);

      try {
        await sendRemoteMessage(
          "remote-openai-gpt-4",
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
        "remote-openai-gpt-4",
        mockMessages,
        undefined,
        mockDependencies,
      );

      expect(mockDependencies.getModelConfig).toHaveBeenCalledWith(
        "remote-openai-gpt-4",
      );
    });

    it("calls getApiKey with the apiKeyRef from model config", async () => {
      await sendRemoteMessage(
        "remote-openai-gpt-4",
        mockMessages,
        undefined,
        mockDependencies,
      );

      expect(mockDependencies.getApiKey).toHaveBeenCalledWith(
        "remote-openai-gpt-4-key",
      );
    });
  });
});
