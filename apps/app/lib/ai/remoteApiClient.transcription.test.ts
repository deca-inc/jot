/**
 * Tests for RemoteApiClient.transcribeAudio
 *
 * Tests the multipart form data upload for speech-to-text transcription.
 * The URL is used exactly as provided by the user.
 */

import {
  RemoteApiClient,
  type RemoteApiConfig,
  RemoteApiError,
} from "./remoteApiClient";

// Mock expo/fetch (used for streaming)
const mockExpoFetch = jest.fn();
jest.mock("expo/fetch", () => ({
  fetch: (...args: unknown[]) => mockExpoFetch(...args),
}));

// Mock global.fetch (used for transcription/file uploads)
const mockFetch = jest.fn();
const originalFetch = global.fetch;

describe("RemoteApiClient.transcribeAudio", () => {
  let client: RemoteApiClient;

  beforeEach(() => {
    mockFetch.mockReset();
    mockExpoFetch.mockReset();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.clearAllMocks();
    global.fetch = originalFetch;
  });

  describe("OpenAI-compatible transcription", () => {
    const config: RemoteApiConfig = {
      apiStyle: "openai-compatible",
      baseUrl: "https://api.openai.com/v1/audio/transcriptions",
      modelName: "whisper-1",
      apiKey: "sk-test-key",
    };

    beforeEach(() => {
      client = new RemoteApiClient(config);
    });

    it("sends audio to the provided URL", async () => {
      const mockResponse = {
        text: "Hello, this is a test transcription.",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      // Create mock audio data (WAV header + silence)
      const audioData = new Uint8Array(1000);

      const result = await client.transcribeAudio(audioData);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.openai.com/v1/audio/transcriptions",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer sk-test-key",
          }),
        }),
      );

      expect(result).toEqual({
        text: "Hello, this is a test transcription.",
      });
    });

    it("sends multipart form data with audio file", async () => {
      const mockResponse = { text: "Transcribed text" };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const audioData = new Uint8Array([0x52, 0x49, 0x46, 0x46]); // RIFF header

      await client.transcribeAudio(audioData);

      // Check that FormData was used (body should be FormData instance)
      const callArgs = mockFetch.mock.calls[0];
      const requestOptions = callArgs[1];

      // The body should be FormData
      expect(requestOptions.body).toBeInstanceOf(FormData);
    });

    it("includes model name in form data", async () => {
      const mockResponse = { text: "Test" };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const audioData = new Uint8Array(100);

      await client.transcribeAudio(audioData);

      const callArgs = mockFetch.mock.calls[0];
      const formData = callArgs[1].body as FormData;

      expect(formData.get("model")).toBe("whisper-1");
    });

    it("respects language option when provided", async () => {
      const mockResponse = { text: "Bonjour" };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const audioData = new Uint8Array(100);

      await client.transcribeAudio(audioData, { language: "fr" });

      const callArgs = mockFetch.mock.calls[0];
      const formData = callArgs[1].body as FormData;

      expect(formData.get("language")).toBe("fr");
    });

    it("supports response_format option", async () => {
      const mockResponse = { text: "Test" };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const audioData = new Uint8Array(100);

      await client.transcribeAudio(audioData, {
        responseFormat: "verbose_json",
      });

      const callArgs = mockFetch.mock.calls[0];
      const formData = callArgs[1].body as FormData;

      expect(formData.get("response_format")).toBe("verbose_json");
    });
  });

  describe("Groq transcription", () => {
    const config: RemoteApiConfig = {
      apiStyle: "openai-compatible",
      baseUrl: "https://api.groq.com/openai/v1/audio/transcriptions",
      modelName: "whisper-large-v3",
      apiKey: "gsk-test-key",
    };

    beforeEach(() => {
      client = new RemoteApiClient(config);
    });

    it("uses correct endpoint for Groq", async () => {
      const mockResponse = { text: "Fast transcription" };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const audioData = new Uint8Array(100);

      await client.transcribeAudio(audioData);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.groq.com/openai/v1/audio/transcriptions",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer gsk-test-key",
          }),
        }),
      );
    });
  });

  describe("error handling", () => {
    const config: RemoteApiConfig = {
      apiStyle: "openai-compatible",
      baseUrl: "https://api.openai.com/v1/audio/transcriptions",
      modelName: "whisper-1",
      apiKey: "sk-test-key",
    };

    beforeEach(() => {
      client = new RemoteApiClient(config);
    });

    it("throws RemoteApiError on HTTP error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: () =>
          Promise.resolve({
            error: { message: "Invalid audio file" },
          }),
      });

      const audioData = new Uint8Array(100);

      await expect(client.transcribeAudio(audioData)).rejects.toThrow(
        RemoteApiError,
      );
    });

    it("includes error details for rate limiting", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        json: () =>
          Promise.resolve({
            error: { message: "Rate limit exceeded for transcription" },
          }),
      });

      const audioData = new Uint8Array(100);

      try {
        await client.transcribeAudio(audioData);
        throw new Error("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(RemoteApiError);
        const apiError = error as RemoteApiError;
        expect(apiError.statusCode).toBe(429);
        expect(apiError.message).toContain("Rate limit");
      }
    });

    it("handles network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const audioData = new Uint8Array(100);

      await expect(client.transcribeAudio(audioData)).rejects.toThrow(
        "Network error",
      );
    });
  });

  describe("abort support", () => {
    const config: RemoteApiConfig = {
      apiStyle: "openai-compatible",
      baseUrl: "https://api.openai.com/v1/audio/transcriptions",
      modelName: "whisper-1",
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

      const audioData = new Uint8Array(100);

      const promise = client.transcribeAudio(audioData, {
        abortSignal: abortController.signal,
      });

      abortController.abort();

      await expect(promise).rejects.toThrow();
    });
  });

  describe("base64 audio input", () => {
    const config: RemoteApiConfig = {
      apiStyle: "openai-compatible",
      baseUrl: "https://api.openai.com/v1/audio/transcriptions",
      modelName: "whisper-1",
      apiKey: "sk-test-key",
    };

    beforeEach(() => {
      client = new RemoteApiClient(config);
    });

    it("accepts base64-encoded audio", async () => {
      const mockResponse = { text: "From base64" };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      // Base64-encoded "test" data
      const base64Audio = "dGVzdA==";

      const result = await client.transcribeAudio(base64Audio);

      expect(result.text).toBe("From base64");
    });
  });
});
