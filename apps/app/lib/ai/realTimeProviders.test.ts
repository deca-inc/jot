/**
 * Tests for realTimeProviders
 *
 * Tests provider detection and WebSocket configuration for real-time STT:
 * - Deepgram detection and config
 * - OpenAI Realtime detection and config
 * - Non-real-time provider handling
 */

import {
  detectRealTimeProvider,
  supportsRealTime,
  getRealTimeConfig,
  isWebSocketUrl,
  type RealTimeProvider,
} from "./realTimeProviders";

describe("isWebSocketUrl", () => {
  it("returns true for wss:// URLs", () => {
    expect(isWebSocketUrl("wss://api.deepgram.com/v1/listen")).toBe(true);
    expect(isWebSocketUrl("wss://api.openai.com/v1/realtime")).toBe(true);
  });

  it("returns true for ws:// URLs", () => {
    expect(isWebSocketUrl("ws://localhost:8080/stream")).toBe(true);
  });

  it("is case insensitive", () => {
    expect(isWebSocketUrl("WSS://api.deepgram.com/v1/listen")).toBe(true);
    expect(isWebSocketUrl("WS://localhost:8080")).toBe(true);
  });

  it("returns false for https:// URLs", () => {
    expect(isWebSocketUrl("https://api.openai.com/v1")).toBe(false);
    expect(isWebSocketUrl("https://api.deepgram.com/v1")).toBe(false);
  });

  it("returns false for http:// URLs", () => {
    expect(isWebSocketUrl("http://localhost:8080/v1")).toBe(false);
  });

  it("returns false for empty or invalid URLs", () => {
    expect(isWebSocketUrl("")).toBe(false);
    expect(isWebSocketUrl("not-a-url")).toBe(false);
  });

  it("handles URLs with leading/trailing whitespace", () => {
    expect(isWebSocketUrl("  wss://api.deepgram.com/v1/listen  ")).toBe(true);
  });
});

describe("detectRealTimeProvider", () => {
  describe("Deepgram detection", () => {
    it("detects Deepgram from api.deepgram.com", () => {
      expect(detectRealTimeProvider("https://api.deepgram.com/v1")).toBe(
        "deepgram",
      );
    });

    it("detects Deepgram from WebSocket URL", () => {
      expect(detectRealTimeProvider("wss://api.deepgram.com/v1/listen")).toBe(
        "deepgram",
      );
    });

    it("detects Deepgram from deepgram.com subdomains", () => {
      expect(detectRealTimeProvider("https://listen.deepgram.com/v1")).toBe(
        "deepgram",
      );
    });

    it("is case insensitive for Deepgram", () => {
      expect(detectRealTimeProvider("https://API.DEEPGRAM.COM/v1")).toBe(
        "deepgram",
      );
    });
  });

  describe("OpenAI detection", () => {
    // OpenAI Realtime doesn't support interim results, so it's not detected as real-time
    // Users should use batch mode for OpenAI Whisper API instead
    it("returns null for OpenAI (no interim results support)", () => {
      expect(detectRealTimeProvider("https://api.openai.com/v1")).toBeNull();
    });

    it("returns null for OpenAI case insensitive", () => {
      expect(detectRealTimeProvider("https://API.OPENAI.COM/v1")).toBeNull();
    });
  });

  describe("non-real-time providers", () => {
    it("returns null for Groq (no real-time support)", () => {
      expect(
        detectRealTimeProvider("https://api.groq.com/openai/v1"),
      ).toBeNull();
    });

    it("returns null for Anthropic", () => {
      expect(detectRealTimeProvider("https://api.anthropic.com/v1")).toBeNull();
    });

    it("returns null for local servers", () => {
      expect(detectRealTimeProvider("http://localhost:8000/v1")).toBeNull();
    });

    it("returns null for unknown providers", () => {
      expect(detectRealTimeProvider("https://api.example.com/v1")).toBeNull();
    });

    it("returns null for empty URL", () => {
      expect(detectRealTimeProvider("")).toBeNull();
    });

    it("returns null for malformed URL", () => {
      expect(detectRealTimeProvider("not-a-url")).toBeNull();
    });
  });
});

describe("supportsRealTime", () => {
  it("returns true for Deepgram HTTP URL", () => {
    expect(supportsRealTime("https://api.deepgram.com/v1")).toBe(true);
  });

  it("returns true for Deepgram WebSocket URL", () => {
    expect(supportsRealTime("wss://api.deepgram.com/v1/listen")).toBe(true);
  });

  it("returns true for any WebSocket URL (implies real-time)", () => {
    // Even unknown providers with wss:// are treated as real-time capable
    expect(supportsRealTime("wss://custom-stt.example.com/stream")).toBe(true);
    expect(supportsRealTime("ws://localhost:8080/transcribe")).toBe(true);
  });

  it("returns false for OpenAI (no interim results)", () => {
    expect(supportsRealTime("https://api.openai.com/v1")).toBe(false);
  });

  it("returns false for Groq", () => {
    expect(supportsRealTime("https://api.groq.com/openai/v1")).toBe(false);
  });

  it("returns false for local HTTP servers", () => {
    expect(supportsRealTime("http://localhost:8000/v1")).toBe(false);
  });
});

describe("getRealTimeConfig", () => {
  describe("Deepgram config", () => {
    it("generates correct WebSocket URL with default options", () => {
      const config = getRealTimeConfig("deepgram", "dg-test-key", {});

      expect(config.wsUrl).toContain("wss://api.deepgram.com/v1/listen");
      expect(config.wsUrl).toContain("model=nova-2");
      expect(config.wsUrl).toContain("interim_results=true");
      expect(config.wsUrl).toContain("encoding=linear16");
      expect(config.wsUrl).toContain("sample_rate=16000");
      expect(config.wsUrl).toContain("channels=1");
    });

    it("includes language in URL if specified", () => {
      const config = getRealTimeConfig("deepgram", "dg-test-key", {
        language: "fr",
      });

      expect(config.wsUrl).toContain("language=fr");
    });

    it("uses correct auth header format", () => {
      const config = getRealTimeConfig("deepgram", "dg-test-key", {});

      expect(config.headers).toEqual({
        Authorization: "Token dg-test-key",
      });
    });

    it("allows custom model name", () => {
      const config = getRealTimeConfig("deepgram", "dg-test-key", {
        modelName: "nova-2-general",
      });

      expect(config.wsUrl).toContain("model=nova-2-general");
    });

    it("uses user-provided WebSocket URL and adds required params", () => {
      const userUrl =
        "wss://api.deepgram.com/v1/listen?model=nova-2&punctuate=true";
      const config = getRealTimeConfig("deepgram", "dg-test-key", {
        baseUrl: userUrl,
      });

      // Should use user's URL as base but add required encoding params
      expect(config.wsUrl).toContain("wss://api.deepgram.com/v1/listen");
      expect(config.wsUrl).toContain("model=nova-2");
      expect(config.wsUrl).toContain("punctuate=true");
      expect(config.wsUrl).toContain("encoding=linear16");
      expect(config.wsUrl).toContain("sample_rate=16000");
      expect(config.wsUrl).toContain("interim_results=true");
    });

    it("does not override user-provided encoding params", () => {
      const userUrl =
        "wss://api.deepgram.com/v1/listen?encoding=opus&sample_rate=48000";
      const config = getRealTimeConfig("deepgram", "dg-test-key", {
        baseUrl: userUrl,
      });

      // Should keep user's encoding params
      expect(config.wsUrl).toContain("encoding=opus");
      expect(config.wsUrl).toContain("sample_rate=48000");
      // But still add missing required params
      expect(config.wsUrl).toContain("channels=1");
      expect(config.wsUrl).toContain("interim_results=true");
    });

    it("ignores HTTP baseUrl and constructs WebSocket URL", () => {
      const config = getRealTimeConfig("deepgram", "dg-test-key", {
        baseUrl: "https://api.deepgram.com/v1",
      });

      // Should construct a wss:// URL since baseUrl is HTTP
      expect(config.wsUrl).toContain("wss://api.deepgram.com/v1/listen");
    });
  });

  describe("OpenAI Realtime config", () => {
    it("generates correct WebSocket URL with model", () => {
      const config = getRealTimeConfig("openai-realtime", "sk-test-key", {});

      expect(config.wsUrl).toBe(
        "wss://api.openai.com/v1/realtime?model=gpt-realtime",
      );
    });

    it("uses Bearer auth format with OpenAI-Beta header", () => {
      const config = getRealTimeConfig("openai-realtime", "sk-test-key", {});

      expect(config.headers).toEqual({
        Authorization: "Bearer sk-test-key",
        "OpenAI-Beta": "realtime=v1",
      });
    });

    it("includes model in config", () => {
      const config = getRealTimeConfig("openai-realtime", "sk-test-key", {
        modelName: "gpt-realtime",
      });

      expect(config.modelName).toBe("gpt-realtime");
    });

    it("uses user-provided WebSocket URL directly", () => {
      const userUrl = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime";
      const config = getRealTimeConfig("openai-realtime", "sk-test-key", {
        baseUrl: userUrl,
      });

      expect(config.wsUrl).toBe(userUrl);
    });
  });

  describe("unknown provider", () => {
    it("throws error for unknown provider", () => {
      expect(() =>
        getRealTimeConfig("unknown" as RealTimeProvider, "key", {}),
      ).toThrow("Unknown real-time provider: unknown");
    });
  });
});
