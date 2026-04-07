/**
 * Tests for the Tauri LLM web adapter.
 *
 * These tests mock `@tauri-apps/api/core` (for invoke) and `@tauri-apps/api`
 * (for Channel) as virtual modules because they are not yet installed in
 * the app package — they are only present in the desktop app.
 *
 * NOTE: During the TDD red phase the adapter stubs throw synchronously from
 * async methods, which creates microtask-level unhandled rejections in some
 * tests (e.g. when we schedule a promise and then poke at its Channel before
 * awaiting). We install a suppressing listener at file scope so Node does
 * not terminate the test process on these expected rejections.
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

import { createTauriLLMEngine, type TauriLLMMessage } from "./tauriLLM.web";

// @tauri-apps/api is not installed in the app package — these modules are
// provided via the virtual jest.mock calls above. We resolve them through
// jest.requireMock to avoid TS module resolution errors.
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

describe("tauriLLM.web", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    (Channel as unknown as jest.Mock).mockClear();
  });

  describe("createTauriLLMEngine", () => {
    it("returns an object with all required methods", () => {
      const engine = createTauriLLMEngine();

      expect(typeof engine.load).toBe("function");
      expect(typeof engine.generate).toBe("function");
      expect(typeof engine.interrupt).toBe("function");
      expect(typeof engine.unload).toBe("function");
      expect(typeof engine.isLoaded).toBe("function");
      expect(typeof engine.getLoadedModelId).toBe("function");
    });

    it("starts with isLoaded=false and getLoadedModelId=null", () => {
      const engine = createTauriLLMEngine();

      expect(engine.isLoaded()).toBe(false);
      expect(engine.getLoadedModelId()).toBeNull();
    });
  });

  describe("load", () => {
    it("invokes llm_load with modelPath, modelId, and contextSize", async () => {
      mockInvoke.mockResolvedValue(undefined);
      const engine = createTauriLLMEngine();

      await engine.load({
        modelPath: "/models/llama.gguf",
        modelId: "llama-3b",
        contextSize: 8192,
      });

      expect(mockInvoke).toHaveBeenCalledWith(
        "llm_load",
        expect.objectContaining({
          modelPath: "/models/llama.gguf",
          modelId: "llama-3b",
          contextSize: 8192,
        }),
      );
    });

    it("passes a Channel in the invoke payload for progress streaming", async () => {
      mockInvoke.mockResolvedValue(undefined);
      const engine = createTauriLLMEngine();

      await engine.load({
        modelPath: "/models/llama.gguf",
        modelId: "llama-3b",
      });

      expect(Channel).toHaveBeenCalled();
      const call = mockInvoke.mock.calls[0];
      const payload = call[1] as Record<string, unknown>;
      // The progress channel should be somewhere in the payload
      const hasChannel = Object.values(payload).some(
        (v) => v instanceof (Channel as unknown as jest.Mock),
      );
      expect(hasChannel).toBe(true);
    });

    it("calls onProgress when the Channel emits messages", async () => {
      mockInvoke.mockResolvedValue(undefined);
      const onProgress = jest.fn();
      const engine = createTauriLLMEngine();

      // Attach a noop catch handler synchronously so the rejection is handled.
      const loadPromise = engine.load({
        modelPath: "/models/llama.gguf",
        modelId: "llama-3b",
        onProgress,
      });
      const safeLoadPromise = loadPromise.catch(() => {
        /* handled by awaiting the original below */
      });

      const channel = getLatestChannelInstance();
      channel.onmessage?.({ loaded: 50, total: 100, text: "halfway" });
      channel.onmessage?.({ loaded: 100, total: 100, text: "done" });

      await safeLoadPromise;
      await loadPromise;

      expect(onProgress).toHaveBeenCalledWith({
        loaded: 50,
        total: 100,
        text: "halfway",
      });
      expect(onProgress).toHaveBeenCalledWith({
        loaded: 100,
        total: 100,
        text: "done",
      });
    });

    it("sets isLoaded=true and getLoadedModelId on successful load", async () => {
      mockInvoke.mockResolvedValue(undefined);
      const engine = createTauriLLMEngine();

      expect(engine.isLoaded()).toBe(false);
      expect(engine.getLoadedModelId()).toBeNull();

      await engine.load({
        modelPath: "/models/llama.gguf",
        modelId: "llama-3b",
      });

      expect(engine.isLoaded()).toBe(true);
      expect(engine.getLoadedModelId()).toBe("llama-3b");
    });

    it("throws when Tauri invoke rejects (e.g. model not found)", async () => {
      mockInvoke.mockRejectedValue(new Error("model file not found"));
      const engine = createTauriLLMEngine();

      await expect(
        engine.load({
          modelPath: "/bad/path.gguf",
          modelId: "missing",
        }),
      ).rejects.toThrow(/model file not found/);

      expect(engine.isLoaded()).toBe(false);
      expect(engine.getLoadedModelId()).toBeNull();
    });

    it("is a no-op when loading the same modelId twice", async () => {
      mockInvoke.mockResolvedValue(undefined);
      const engine = createTauriLLMEngine();

      await engine.load({
        modelPath: "/models/a.gguf",
        modelId: "same-model",
      });
      const callsAfterFirstLoad = mockInvoke.mock.calls.length;

      await engine.load({
        modelPath: "/models/a.gguf",
        modelId: "same-model",
      });

      // No additional invokes — neither unload nor load should have been called
      expect(mockInvoke.mock.calls.length).toBe(callsAfterFirstLoad);
      expect(engine.getLoadedModelId()).toBe("same-model");
    });

    it("unloads previous model before loading a different modelId", async () => {
      mockInvoke.mockResolvedValue(undefined);
      const engine = createTauriLLMEngine();

      await engine.load({ modelPath: "/a.gguf", modelId: "model-a" });
      mockInvoke.mockClear();

      await engine.load({ modelPath: "/b.gguf", modelId: "model-b" });

      const commandNames = mockInvoke.mock.calls.map((c) => c[0]);
      const unloadIdx = commandNames.indexOf("llm_unload");
      const loadIdx = commandNames.indexOf("llm_load");

      expect(unloadIdx).toBeGreaterThanOrEqual(0);
      expect(loadIdx).toBeGreaterThanOrEqual(0);
      expect(unloadIdx).toBeLessThan(loadIdx);
      expect(engine.getLoadedModelId()).toBe("model-b");
    });

    it("defaults contextSize to 4096 when not provided", async () => {
      mockInvoke.mockResolvedValue(undefined);
      const engine = createTauriLLMEngine();

      await engine.load({
        modelPath: "/models/llama.gguf",
        modelId: "llama-3b",
      });

      expect(mockInvoke).toHaveBeenCalledWith(
        "llm_load",
        expect.objectContaining({ contextSize: 4096 }),
      );
    });
  });

  describe("generate", () => {
    const messages: TauriLLMMessage[] = [
      { role: "system", content: "be concise" },
      { role: "user", content: "hi" },
    ];

    async function loadedEngine() {
      mockInvoke.mockResolvedValue(undefined);
      const engine = createTauriLLMEngine();
      await engine.load({
        modelPath: "/models/llama.gguf",
        modelId: "llama-3b",
      });
      mockInvoke.mockReset();
      (Channel as unknown as jest.Mock).mockClear();
      return engine;
    }

    it("throws a descriptive 'not loaded' error when generate is called before load", async () => {
      mockInvoke.mockResolvedValue(undefined);
      const engine = createTauriLLMEngine();

      await expect(engine.generate(messages)).rejects.toThrow(/not loaded/i);
      expect(mockInvoke).not.toHaveBeenCalledWith(
        "llm_generate",
        expect.any(Object),
      );
    });

    it("invokes llm_generate with messages and options", async () => {
      const engine = await loadedEngine();
      mockInvoke.mockResolvedValue("hello!");

      await engine.generate(messages, {
        maxTokens: 256,
        temperature: 0.5,
      });

      expect(mockInvoke).toHaveBeenCalledWith(
        "llm_generate",
        expect.objectContaining({
          messages,
          maxTokens: 256,
          temperature: 0.5,
        }),
      );
    });

    it("streams tokens via Channel subscription and calls onToken", async () => {
      const engine = await loadedEngine();
      mockInvoke.mockImplementation(async (command: string) => {
        if (command === "llm_generate") {
          // Simulate streaming
          const channel = getLatestChannelInstance();
          channel.onmessage?.({ token: "Hel" });
          channel.onmessage?.({ token: "lo" });
          channel.onmessage?.({ token: "!" });
          return "Hello!";
        }
        return undefined;
      });
      const onToken = jest.fn();

      await engine.generate(messages, { onToken });

      expect(onToken).toHaveBeenCalledWith("Hel");
      expect(onToken).toHaveBeenCalledWith("lo");
      expect(onToken).toHaveBeenCalledWith("!");
    });

    it("returns the full accumulated response text", async () => {
      const engine = await loadedEngine();
      mockInvoke.mockImplementation(async (command: string) => {
        if (command === "llm_generate") {
          const channel = getLatestChannelInstance();
          channel.onmessage?.({ token: "Hel" });
          channel.onmessage?.({ token: "lo" });
          return "Hello";
        }
        return undefined;
      });

      const result = await engine.generate(messages);

      expect(result).toBe("Hello");
    });

    it("aborts via AbortSignal by invoking llm_interrupt", async () => {
      const engine = await loadedEngine();
      const controller = new AbortController();

      let interruptCalled = false;
      mockInvoke.mockImplementation(async (command: string) => {
        if (command === "llm_generate") {
          // Simulate abort happening mid-generation
          controller.abort();
          // Wait a tick for the abort handler to fire
          await new Promise((r) => setTimeout(r, 0));
          return "";
        }
        if (command === "llm_interrupt") {
          interruptCalled = true;
          return undefined;
        }
        return undefined;
      });

      await engine
        .generate(messages, { signal: controller.signal })
        .catch(() => {
          // Abort may reject — that's fine
        });

      expect(interruptCalled).toBe(true);
    });

    it("passes temperature and maxTokens in the invoke payload", async () => {
      const engine = await loadedEngine();
      mockInvoke.mockResolvedValue("ok");

      await engine.generate(messages, {
        temperature: 0.9,
        maxTokens: 1024,
      });

      const call = mockInvoke.mock.calls.find((c) => c[0] === "llm_generate");
      expect(call).toBeDefined();
      const payload = call?.[1] as Record<string, unknown>;
      expect(payload.temperature).toBe(0.9);
      expect(payload.maxTokens).toBe(1024);
    });
  });

  describe("interrupt", () => {
    it("invokes llm_interrupt Tauri command", async () => {
      mockInvoke.mockResolvedValue(undefined);
      const engine = createTauriLLMEngine();

      await engine.interrupt();

      expect(mockInvoke).toHaveBeenCalledWith(
        "llm_interrupt",
        expect.any(Object),
      );
    });

    it("is a no-op when nothing is generating (does not throw)", async () => {
      mockInvoke.mockResolvedValue(undefined);
      const engine = createTauriLLMEngine();

      await expect(engine.interrupt()).resolves.not.toThrow();
    });
  });

  describe("unload", () => {
    it("invokes llm_unload Tauri command", async () => {
      mockInvoke.mockResolvedValue(undefined);
      const engine = createTauriLLMEngine();
      await engine.load({
        modelPath: "/models/llama.gguf",
        modelId: "llama-3b",
      });
      mockInvoke.mockClear();

      await engine.unload();

      expect(mockInvoke).toHaveBeenCalledWith("llm_unload", expect.any(Object));
    });

    it("sets isLoaded=false and getLoadedModelId=null after unload", async () => {
      mockInvoke.mockResolvedValue(undefined);
      const engine = createTauriLLMEngine();
      await engine.load({
        modelPath: "/models/llama.gguf",
        modelId: "llama-3b",
      });

      expect(engine.isLoaded()).toBe(true);
      expect(engine.getLoadedModelId()).toBe("llama-3b");

      await engine.unload();

      expect(engine.isLoaded()).toBe(false);
      expect(engine.getLoadedModelId()).toBeNull();
    });

    it("is a no-op when nothing is loaded (does not invoke or throw)", async () => {
      mockInvoke.mockResolvedValue(undefined);
      const engine = createTauriLLMEngine();

      await expect(engine.unload()).resolves.not.toThrow();
      expect(mockInvoke).not.toHaveBeenCalledWith(
        "llm_unload",
        expect.any(Object),
      );
    });
  });
});
