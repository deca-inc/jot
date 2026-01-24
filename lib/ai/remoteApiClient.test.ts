import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  RemoteApiClient,
  type RemoteApiConfig,
  type ChatMessage,
  RemoteApiError,
} from "./remoteApiClient";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("RemoteApiClient", () => {
  let client: RemoteApiClient;

  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("OpenAI-compatible requests", () => {
    const config: RemoteApiConfig = {
      providerId: "openai",
      baseUrl: "https://api.openai.com/v1",
      modelName: "gpt-4-turbo",
      apiKey: "sk-test-key",
    };

    beforeEach(() => {
      client = new RemoteApiClient(config);
    });

    it("sends correct request format for chat completions", async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              role: "assistant",
              content: "Hello! How can I help you?",
            },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 8,
          total_tokens: 18,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const messages: ChatMessage[] = [{ role: "user", content: "Hello" }];

      const result = await client.sendMessage(messages);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.openai.com/v1/chat/completions",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Authorization: "Bearer sk-test-key",
          }),
        }),
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.model).toBe("gpt-4-turbo");
      expect(body.messages).toEqual(messages);
      expect(result).toBe("Hello! How can I help you?");
    });

    it("includes system prompt when provided", async () => {
      const mockResponse = {
        choices: [
          {
            message: { role: "assistant", content: "Response" },
            finish_reason: "stop",
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const messages: ChatMessage[] = [{ role: "user", content: "Hello" }];

      await client.sendMessage(messages, {
        systemPrompt: "You are a helpful assistant.",
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.messages[0]).toEqual({
        role: "system",
        content: "You are a helpful assistant.",
      });
      expect(body.messages[1]).toEqual(messages[0]);
    });

    it("respects maxTokens and temperature options", async () => {
      const mockResponse = {
        choices: [
          {
            message: { role: "assistant", content: "Response" },
            finish_reason: "stop",
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await client.sendMessage([{ role: "user", content: "Hello" }], {
        maxTokens: 100,
        temperature: 0.5,
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.max_tokens).toBe(100);
      expect(body.temperature).toBe(0.5);
    });
  });

  describe("Anthropic-specific requests", () => {
    const config: RemoteApiConfig = {
      providerId: "anthropic",
      baseUrl: "https://api.anthropic.com/v1",
      modelName: "claude-3-5-sonnet-20241022",
      apiKey: "sk-ant-test-key",
    };

    beforeEach(() => {
      client = new RemoteApiClient(config);
    });

    it("uses x-api-key header instead of Bearer auth", async () => {
      const mockResponse = {
        content: [{ type: "text", text: "Hello from Claude!" }],
        stop_reason: "end_turn",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await client.sendMessage([{ role: "user", content: "Hello" }]);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.anthropic.com/v1/messages",
        expect.objectContaining({
          headers: expect.objectContaining({
            "x-api-key": "sk-ant-test-key",
            "anthropic-version": "2023-06-01",
          }),
        }),
      );
    });

    it("formats messages correctly for Anthropic API", async () => {
      const mockResponse = {
        content: [{ type: "text", text: "Response" }],
        stop_reason: "end_turn",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const messages: ChatMessage[] = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
        { role: "user", content: "How are you?" },
      ];

      await client.sendMessage(messages, {
        systemPrompt: "You are helpful.",
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.system).toBe("You are helpful.");
      expect(body.messages).toEqual(messages);
    });

    it("parses Anthropic response format correctly", async () => {
      const mockResponse = {
        content: [
          { type: "text", text: "Part 1" },
          { type: "text", text: " Part 2" },
        ],
        stop_reason: "end_turn",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await client.sendMessage([
        { role: "user", content: "Hello" },
      ]);

      expect(result).toBe("Part 1 Part 2");
    });
  });

  describe("Groq requests", () => {
    const config: RemoteApiConfig = {
      providerId: "groq",
      baseUrl: "https://api.groq.com/openai/v1",
      modelName: "llama-3.3-70b-versatile",
      apiKey: "gsk-test-key",
    };

    beforeEach(() => {
      client = new RemoteApiClient(config);
    });

    it("uses OpenAI-compatible format", async () => {
      const mockResponse = {
        choices: [
          {
            message: { role: "assistant", content: "Fast response!" },
            finish_reason: "stop",
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await client.sendMessage([{ role: "user", content: "Hello" }]);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.groq.com/openai/v1/chat/completions",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer gsk-test-key",
          }),
        }),
      );
    });
  });

  describe("Custom server requests", () => {
    const config: RemoteApiConfig = {
      providerId: "custom",
      baseUrl: "http://localhost:11434/v1",
      modelName: "llama2",
      apiKey: "optional-key",
      customHeaders: {
        "X-Custom-Header": "value",
      },
    };

    beforeEach(() => {
      client = new RemoteApiClient(config);
    });

    it("includes custom headers", async () => {
      const mockResponse = {
        choices: [
          {
            message: { role: "assistant", content: "Local response" },
            finish_reason: "stop",
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await client.sendMessage([{ role: "user", content: "Hello" }]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            "X-Custom-Header": "value",
          }),
        }),
      );
    });
  });

  describe("streaming", () => {
    const config: RemoteApiConfig = {
      providerId: "openai",
      baseUrl: "https://api.openai.com/v1",
      modelName: "gpt-4-turbo",
      apiKey: "sk-test-key",
    };

    beforeEach(() => {
      client = new RemoteApiClient(config);
    });

    it("calls responseCallback with streaming chunks", async () => {
      const chunks = [
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"!"}}]}\n\n',
        "data: [DONE]\n\n",
      ];

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          chunks.forEach((chunk) => {
            controller.enqueue(encoder.encode(chunk));
          });
          controller.close();
        },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: stream,
      });

      const responseCallback = vi.fn();

      const result = await client.sendMessageStreaming(
        [{ role: "user", content: "Hi" }],
        { responseCallback },
      );

      expect(responseCallback).toHaveBeenCalledWith("Hello");
      expect(responseCallback).toHaveBeenCalledWith("Hello world");
      expect(responseCallback).toHaveBeenCalledWith("Hello world!");
      expect(result).toBe("Hello world!");
    });

    it("calls completeCallback when stream ends", async () => {
      const chunks = [
        'data: {"choices":[{"delta":{"content":"Done"}}]}\n\n',
        "data: [DONE]\n\n",
      ];

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          chunks.forEach((chunk) => {
            controller.enqueue(encoder.encode(chunk));
          });
          controller.close();
        },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: stream,
      });

      const completeCallback = vi.fn();

      await client.sendMessageStreaming([{ role: "user", content: "Hi" }], {
        completeCallback,
      });

      expect(completeCallback).toHaveBeenCalledWith("Done");
    });
  });

  describe("error handling", () => {
    const config: RemoteApiConfig = {
      providerId: "openai",
      baseUrl: "https://api.openai.com/v1",
      modelName: "gpt-4-turbo",
      apiKey: "sk-test-key",
    };

    beforeEach(() => {
      client = new RemoteApiClient(config);
    });

    it("throws RemoteApiError on HTTP error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        json: () =>
          Promise.resolve({
            error: { message: "Invalid API key" },
          }),
      });

      await expect(
        client.sendMessage([{ role: "user", content: "Hello" }]),
      ).rejects.toThrow(RemoteApiError);
    });

    it("includes error details in RemoteApiError", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        json: () =>
          Promise.resolve({
            error: { message: "Rate limit exceeded" },
          }),
      });

      try {
        await client.sendMessage([{ role: "user", content: "Hello" }]);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(RemoteApiError);
        const apiError = error as RemoteApiError;
        expect(apiError.statusCode).toBe(429);
        expect(apiError.message).toContain("Rate limit");
      }
    });

    it("handles network errors gracefully", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      await expect(
        client.sendMessage([{ role: "user", content: "Hello" }]),
      ).rejects.toThrow("Network error");
    });

    it("handles malformed JSON response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.reject(new Error("Invalid JSON")),
      });

      await expect(
        client.sendMessage([{ role: "user", content: "Hello" }]),
      ).rejects.toThrow();
    });
  });

  describe("abort support", () => {
    const config: RemoteApiConfig = {
      providerId: "openai",
      baseUrl: "https://api.openai.com/v1",
      modelName: "gpt-4-turbo",
      apiKey: "sk-test-key",
    };

    beforeEach(() => {
      client = new RemoteApiClient(config);
    });

    it("supports AbortController for cancellation", async () => {
      const abortController = new AbortController();

      mockFetch.mockImplementationOnce(() => {
        return new Promise((_, reject) => {
          abortController.signal.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      });

      const promise = client.sendMessage([{ role: "user", content: "Hello" }], {
        abortSignal: abortController.signal,
      });

      abortController.abort();

      await expect(promise).rejects.toThrow();
    });
  });
});
