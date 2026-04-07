/**
 * Tests for the Tauri STT web adapter.
 *
 * These tests mock `@tauri-apps/api/core` (for invoke and Channel) as a
 * virtual module because it is not installed in the app package — it is
 * only present in the desktop app.
 *
 * Mirrors the structure and conventions of tauriLLM.web.test.ts.
 */

const noopUnhandled = (_reason: unknown) => {
  /* swallow — tests assert on rejection via the returned promise */
};
process.on("unhandledRejection", noopUnhandled);
afterAll(() => {
  process.off("unhandledRejection", noopUnhandled);
});

jest.mock(
  "@tauri-apps/api/core",
  () => ({
    invoke: jest.fn(),
    Channel: jest.fn().mockImplementation(function MockChannel(this: {
      onmessage: ((message: unknown) => void) | null;
    }) {
      this.onmessage = null;
    }),
  }),
  { virtual: true },
);

import { createTauriSTTEngine } from "./tauriSTT.web";

// @tauri-apps/api is not installed in the app package — these modules are
// provided via the virtual jest.mock calls above.
const { invoke, Channel } = jest.requireMock("@tauri-apps/api/core") as {
  invoke: jest.Mock;
  Channel: jest.Mock;
};

type InvokeMock = jest.Mock<
  Promise<unknown>,
  [string, Record<string, unknown>?]
>;
const mockInvoke = invoke as unknown as InvokeMock;

interface MockChannelInstance {
  onmessage: ((message: unknown) => void) | null;
}

function getLatestChannelInstance(): MockChannelInstance {
  const ChannelCtor = Channel as unknown as jest.Mock;
  const instances = ChannelCtor.mock.instances;
  if (instances.length === 0) {
    throw new Error("No Channel instances constructed yet");
  }
  return instances[instances.length - 1] as MockChannelInstance;
}

describe("tauriSTT.web", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    (Channel as unknown as jest.Mock).mockClear();
  });

  describe("createTauriSTTEngine", () => {
    it("returns an object with all required methods", () => {
      const engine = createTauriSTTEngine();

      expect(typeof engine.load).toBe("function");
      expect(typeof engine.transcribe).toBe("function");
      expect(typeof engine.unload).toBe("function");
      expect(typeof engine.isLoaded).toBe("function");
      expect(typeof engine.getLoadedModelId).toBe("function");
    });

    it("starts with isLoaded=false and getLoadedModelId=null", () => {
      const engine = createTauriSTTEngine();

      expect(engine.isLoaded()).toBe(false);
      expect(engine.getLoadedModelId()).toBeNull();
    });
  });

  describe("load", () => {
    it("invokes stt_load with modelPath and modelId", async () => {
      mockInvoke.mockResolvedValue(undefined);
      const engine = createTauriSTTEngine();

      await engine.load({
        modelPath: "/models/ggml-tiny.en.bin",
        modelId: "desktop-whisper-tiny-en",
      });

      expect(mockInvoke).toHaveBeenCalledWith(
        "stt_load",
        expect.objectContaining({
          modelPath: "/models/ggml-tiny.en.bin",
          modelId: "desktop-whisper-tiny-en",
        }),
      );
    });

    it("passes a Channel in the invoke payload for progress streaming", async () => {
      mockInvoke.mockResolvedValue(undefined);
      const engine = createTauriSTTEngine();

      await engine.load({
        modelPath: "/models/ggml-tiny.en.bin",
        modelId: "desktop-whisper-tiny-en",
      });

      expect(Channel).toHaveBeenCalled();
      const call = mockInvoke.mock.calls[0];
      const payload = call[1] as Record<string, unknown>;
      const hasChannel = Object.values(payload).some(
        (v) => v instanceof (Channel as unknown as jest.Mock),
      );
      expect(hasChannel).toBe(true);
    });

    it("calls onProgress when the Channel emits messages", async () => {
      mockInvoke.mockResolvedValue(undefined);
      const onProgress = jest.fn();
      const engine = createTauriSTTEngine();

      const loadPromise = engine.load({
        modelPath: "/models/ggml-tiny.en.bin",
        modelId: "desktop-whisper-tiny-en",
        onProgress,
      });
      const safeLoadPromise = loadPromise.catch(() => {
        /* handled by awaiting the original below */
      });

      const channel = getLatestChannelInstance();
      channel.onmessage?.({
        loaded: 0,
        total: 1,
        text: "loading whisper model",
      });
      channel.onmessage?.({
        loaded: 1,
        total: 1,
        text: "whisper model loaded",
      });

      await safeLoadPromise;
      await loadPromise;

      expect(onProgress).toHaveBeenCalledWith({
        loaded: 0,
        total: 1,
        text: "loading whisper model",
      });
      expect(onProgress).toHaveBeenCalledWith({
        loaded: 1,
        total: 1,
        text: "whisper model loaded",
      });
    });

    it("sets isLoaded=true and getLoadedModelId on successful load", async () => {
      mockInvoke.mockResolvedValue(undefined);
      const engine = createTauriSTTEngine();

      expect(engine.isLoaded()).toBe(false);
      expect(engine.getLoadedModelId()).toBeNull();

      await engine.load({
        modelPath: "/models/ggml-tiny.en.bin",
        modelId: "desktop-whisper-tiny-en",
      });

      expect(engine.isLoaded()).toBe(true);
      expect(engine.getLoadedModelId()).toBe("desktop-whisper-tiny-en");
    });

    it("throws when Tauri invoke rejects (e.g. model not found)", async () => {
      mockInvoke.mockRejectedValue(new Error("model file not found"));
      const engine = createTauriSTTEngine();

      await expect(
        engine.load({
          modelPath: "/bad/path.bin",
          modelId: "missing",
        }),
      ).rejects.toThrow(/model file not found/);

      expect(engine.isLoaded()).toBe(false);
      expect(engine.getLoadedModelId()).toBeNull();
    });

    it("is a no-op when loading the same modelId twice", async () => {
      mockInvoke.mockResolvedValue(undefined);
      const engine = createTauriSTTEngine();

      await engine.load({
        modelPath: "/models/ggml-tiny.en.bin",
        modelId: "same-model",
      });
      const callsAfterFirstLoad = mockInvoke.mock.calls.length;

      await engine.load({
        modelPath: "/models/ggml-tiny.en.bin",
        modelId: "same-model",
      });

      // No additional invokes
      expect(mockInvoke.mock.calls.length).toBe(callsAfterFirstLoad);
      expect(engine.getLoadedModelId()).toBe("same-model");
    });

    it("unloads previous model before loading a different modelId", async () => {
      mockInvoke.mockResolvedValue(undefined);
      const engine = createTauriSTTEngine();

      await engine.load({ modelPath: "/a.bin", modelId: "model-a" });
      mockInvoke.mockClear();

      await engine.load({ modelPath: "/b.bin", modelId: "model-b" });

      const commandNames = mockInvoke.mock.calls.map((c) => c[0]);
      const unloadIdx = commandNames.indexOf("stt_unload");
      const loadIdx = commandNames.indexOf("stt_load");

      expect(unloadIdx).toBeGreaterThanOrEqual(0);
      expect(loadIdx).toBeGreaterThanOrEqual(0);
      expect(unloadIdx).toBeLessThan(loadIdx);
      expect(engine.getLoadedModelId()).toBe("model-b");
    });
  });

  describe("transcribe", () => {
    async function loadedEngine() {
      mockInvoke.mockResolvedValue(undefined);
      const engine = createTauriSTTEngine();
      await engine.load({
        modelPath: "/models/ggml-tiny.en.bin",
        modelId: "desktop-whisper-tiny-en",
      });
      mockInvoke.mockReset();
      (Channel as unknown as jest.Mock).mockClear();
      return engine;
    }

    it("throws when transcribe is called before load", async () => {
      const engine = createTauriSTTEngine();
      const audio = new Float32Array([0.1, 0.2, 0.3]);

      await expect(engine.transcribe(audio)).rejects.toThrow(/not loaded/i);
    });

    it("invokes stt_transcribe with audio data converted to number array", async () => {
      const engine = await loadedEngine();
      mockInvoke.mockResolvedValue({ text: "hello world", durationMs: 150 });

      const audio = new Float32Array([0.1, 0.2, 0.3]);
      await engine.transcribe(audio);

      expect(mockInvoke).toHaveBeenCalledWith("stt_transcribe", {
        audioData: [
          expect.closeTo(0.1, 5),
          expect.closeTo(0.2, 5),
          expect.closeTo(0.3, 5),
        ],
        language: null,
      });
    });

    it("passes language option when provided", async () => {
      const engine = await loadedEngine();
      mockInvoke.mockResolvedValue({ text: "bonjour", durationMs: 100 });

      const audio = new Float32Array([0.1, 0.2]);
      await engine.transcribe(audio, "fr");

      expect(mockInvoke).toHaveBeenCalledWith("stt_transcribe", {
        audioData: [expect.closeTo(0.1, 5), expect.closeTo(0.2, 5)],
        language: "fr",
      });
    });

    it("returns the transcription result from the Rust side", async () => {
      const engine = await loadedEngine();
      mockInvoke.mockResolvedValue({ text: "hello world", durationMs: 250 });

      const audio = new Float32Array([0.1, 0.2, 0.3]);
      const result = await engine.transcribe(audio);

      expect(result).toEqual({ text: "hello world", durationMs: 250 });
    });

    it("propagates errors from the Rust side", async () => {
      const engine = await loadedEngine();
      mockInvoke.mockRejectedValue(new Error("Transcription failed: OOM"));

      const audio = new Float32Array([0.1]);
      await expect(engine.transcribe(audio)).rejects.toThrow(
        /Transcription failed/,
      );
    });
  });

  describe("unload", () => {
    it("invokes stt_unload Tauri command", async () => {
      mockInvoke.mockResolvedValue(undefined);
      const engine = createTauriSTTEngine();
      await engine.load({
        modelPath: "/models/ggml-tiny.en.bin",
        modelId: "desktop-whisper-tiny-en",
      });
      mockInvoke.mockClear();

      await engine.unload();

      expect(mockInvoke).toHaveBeenCalledWith("stt_unload", {});
    });

    it("sets isLoaded=false and getLoadedModelId=null after unload", async () => {
      mockInvoke.mockResolvedValue(undefined);
      const engine = createTauriSTTEngine();
      await engine.load({
        modelPath: "/models/ggml-tiny.en.bin",
        modelId: "desktop-whisper-tiny-en",
      });

      expect(engine.isLoaded()).toBe(true);
      expect(engine.getLoadedModelId()).toBe("desktop-whisper-tiny-en");

      await engine.unload();

      expect(engine.isLoaded()).toBe(false);
      expect(engine.getLoadedModelId()).toBeNull();
    });

    it("is a no-op when nothing is loaded (does not invoke or throw)", async () => {
      mockInvoke.mockResolvedValue(undefined);
      const engine = createTauriSTTEngine();

      await expect(engine.unload()).resolves.not.toThrow();
      expect(mockInvoke).not.toHaveBeenCalledWith(
        "stt_unload",
        expect.any(Object),
      );
    });
  });
});
