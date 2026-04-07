/**
 * Tests for webSpeechRecognition
 *
 * In Jest (Node), there is no browser SpeechRecognition API, so we test both:
 * - The native stub (webSpeechRecognition.ts) via direct import
 * - The web implementation (webSpeechRecognition.web.ts) with mocked window globals
 */

import {
  isWebSpeechAvailable,
  createWebSpeechRecognition,
} from "./webSpeechRecognition";

// ---- Native stub tests (the default .ts file) ----
// In Jest, the .web.ts resolver is not active, so we get the native stub.

describe("webSpeechRecognition (native stub)", () => {
  it("isWebSpeechAvailable returns false", () => {
    expect(isWebSpeechAvailable()).toBe(false);
  });

  it("createWebSpeechRecognition throws", () => {
    expect(() => createWebSpeechRecognition()).toThrow(
      "Web Speech API is not available on this platform",
    );
  });
});

// ---- Web implementation tests (mocked browser globals) ----

describe("webSpeechRecognition (web, mocked)", () => {
  // We manually require the web module and mock SpeechRecognition on global
  let webModule: typeof import("./webSpeechRecognition.web");

  const mockRecognitionInstance = {
    lang: "",
    continuous: false,
    interimResults: false,
    maxAlternatives: 1,
    onresult: null as ((event: unknown) => void) | null,
    onerror: null as ((event: unknown) => void) | null,
    onend: null as (() => void) | null,
    start: jest.fn(),
    stop: jest.fn(),
    abort: jest.fn(),
  };

  const MockSpeechRecognition = jest.fn(() => mockRecognitionInstance);

  beforeEach(() => {
    jest.resetModules();
    // Reset the mock instance state
    mockRecognitionInstance.lang = "";
    mockRecognitionInstance.continuous = false;
    mockRecognitionInstance.interimResults = false;
    mockRecognitionInstance.maxAlternatives = 1;
    mockRecognitionInstance.onresult = null;
    mockRecognitionInstance.onerror = null;
    mockRecognitionInstance.onend = null;
    mockRecognitionInstance.start.mockClear();
    mockRecognitionInstance.stop.mockClear();
    mockRecognitionInstance.abort.mockClear();
    MockSpeechRecognition.mockClear();
  });

  afterEach(() => {
    // Clean up the global
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cleaning up test global
    delete (globalThis as any).SpeechRecognition;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cleaning up test global
    delete (globalThis as any).webkitSpeechRecognition;
  });

  function loadWebModule() {
    webModule = require("./webSpeechRecognition.web");
  }

  describe("isWebSpeechAvailable", () => {
    it("returns false when SpeechRecognition is not in window", () => {
      loadWebModule();
      expect(webModule.isWebSpeechAvailable()).toBe(false);
    });

    it("returns true when SpeechRecognition is in window", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- setting up test global
      (globalThis as any).SpeechRecognition = MockSpeechRecognition;
      loadWebModule();
      expect(webModule.isWebSpeechAvailable()).toBe(true);
    });

    it("returns true when webkitSpeechRecognition is in window", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- setting up test global
      (globalThis as any).webkitSpeechRecognition = MockSpeechRecognition;
      loadWebModule();
      expect(webModule.isWebSpeechAvailable()).toBe(true);
    });
  });

  describe("createWebSpeechRecognition", () => {
    it("throws when SpeechRecognition is not available", () => {
      loadWebModule();
      expect(() => webModule.createWebSpeechRecognition()).toThrow(
        "Web Speech API is not available in this browser",
      );
    });

    it("creates and configures recognition instance with defaults", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- setting up test global
      (globalThis as any).SpeechRecognition = MockSpeechRecognition;
      loadWebModule();

      const handle = webModule.createWebSpeechRecognition();

      expect(MockSpeechRecognition).toHaveBeenCalledTimes(1);
      expect(mockRecognitionInstance.continuous).toBe(true);
      expect(mockRecognitionInstance.interimResults).toBe(true);
      expect(mockRecognitionInstance.maxAlternatives).toBe(1);
      expect(handle).toBeDefined();
      expect(handle.onResult).toBeNull();
      expect(handle.onError).toBeNull();
      expect(handle.onEnd).toBeNull();
    });

    it("applies custom language option", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- setting up test global
      (globalThis as any).SpeechRecognition = MockSpeechRecognition;
      loadWebModule();

      webModule.createWebSpeechRecognition({ lang: "fr-FR" });

      expect(mockRecognitionInstance.lang).toBe("fr-FR");
    });

    it("applies continuous=false option", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- setting up test global
      (globalThis as any).SpeechRecognition = MockSpeechRecognition;
      loadWebModule();

      webModule.createWebSpeechRecognition({ continuous: false });

      expect(mockRecognitionInstance.continuous).toBe(false);
    });

    it("delegates start/stop/abort to recognition instance", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- setting up test global
      (globalThis as any).SpeechRecognition = MockSpeechRecognition;
      loadWebModule();

      const handle = webModule.createWebSpeechRecognition();

      handle.start();
      expect(mockRecognitionInstance.start).toHaveBeenCalledTimes(1);

      handle.stop();
      expect(mockRecognitionInstance.stop).toHaveBeenCalledTimes(1);

      handle.abort();
      expect(mockRecognitionInstance.abort).toHaveBeenCalledTimes(1);
    });

    it("delivers results via onResult callback", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- setting up test global
      (globalThis as any).SpeechRecognition = MockSpeechRecognition;
      loadWebModule();

      const handle = webModule.createWebSpeechRecognition();
      const onResult = jest.fn();
      handle.onResult = onResult;

      // Simulate a recognition result event
      const mockEvent = {
        resultIndex: 0,
        results: {
          length: 1,
          0: {
            isFinal: true,
            length: 1,
            0: { transcript: "hello world", confidence: 0.95 },
          },
        },
      };

      mockRecognitionInstance.onresult?.(mockEvent);

      expect(onResult).toHaveBeenCalledWith({
        transcript: "hello world",
        isFinal: true,
      });
    });

    it("delivers interim (partial) results", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- setting up test global
      (globalThis as any).SpeechRecognition = MockSpeechRecognition;
      loadWebModule();

      const handle = webModule.createWebSpeechRecognition();
      const onResult = jest.fn();
      handle.onResult = onResult;

      const mockEvent = {
        resultIndex: 0,
        results: {
          length: 1,
          0: {
            isFinal: false,
            length: 1,
            0: { transcript: "hel", confidence: 0.5 },
          },
        },
      };

      mockRecognitionInstance.onresult?.(mockEvent);

      expect(onResult).toHaveBeenCalledWith({
        transcript: "hel",
        isFinal: false,
      });
    });

    it("delivers error via onError callback", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- setting up test global
      (globalThis as any).SpeechRecognition = MockSpeechRecognition;
      loadWebModule();

      const handle = webModule.createWebSpeechRecognition();
      const onError = jest.fn();
      handle.onError = onError;

      mockRecognitionInstance.onerror?.({ error: "no-speech", message: "" });

      expect(onError).toHaveBeenCalledWith("no-speech");
    });

    it("delivers end via onEnd callback", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- setting up test global
      (globalThis as any).SpeechRecognition = MockSpeechRecognition;
      loadWebModule();

      const handle = webModule.createWebSpeechRecognition();
      const onEnd = jest.fn();
      handle.onEnd = onEnd;

      mockRecognitionInstance.onend?.();

      expect(onEnd).toHaveBeenCalledTimes(1);
    });
  });
});
