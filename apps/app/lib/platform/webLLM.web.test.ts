/**
 * Tests for webLLM.web.ts — browser-based LLM adapter via @mlc-ai/web-llm.
 *
 * @mlc-ai/web-llm is not yet installed; we use a virtual mock so tests
 * can reference the module. Tests are intentionally failing (TDD red phase).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only mutable global navigator stand-in
type NavigatorLike = any;

// Mock @mlc-ai/web-llm as a virtual module (not yet installed).
// Variable names prefixed with "mock" are allowed inside jest.mock factories.
interface MockChunk {
  choices: { delta: { content?: string } }[];
}

interface MockCompletion {
  [Symbol.asyncIterator](): AsyncIterator<MockChunk>;
}

interface MockEngine {
  chat: {
    completions: {
      create: jest.Mock<Promise<MockCompletion>, [Record<string, unknown>]>;
    };
  };
  interruptGenerate: jest.Mock<void, []>;
  unload: jest.Mock<Promise<void>, []>;
  reload: jest.Mock<Promise<void>, [string]>;
}

const mockEngineInstance: MockEngine = {
  chat: {
    completions: {
      create: jest.fn(),
    },
  },
  interruptGenerate: jest.fn(),
  unload: jest.fn().mockResolvedValue(undefined),
  reload: jest.fn().mockResolvedValue(undefined),
};

const mockCreateMLCEngine = jest.fn();

jest.mock(
  "@mlc-ai/web-llm",
  () => ({
    CreateMLCEngine: mockCreateMLCEngine,
  }),
  { virtual: true },
);

import {
  checkStorageForModel,
  createWebLLMEngine,
  getEstimatedModelSize,
  getStorageQuota,
  isWebLLMSupported,
  WEB_LLM_MODEL_SIZES,
  type WebLLMEngine,
  type WebLLMMessage,
} from "./webLLM.web";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface StorageMock {
  persist?: jest.Mock<Promise<boolean>, []>;
  estimate?: jest.Mock<Promise<{ usage?: number; quota?: number }>, []>;
  persisted?: jest.Mock<Promise<boolean>, []>;
}

function installNavigator(overrides: {
  gpu?: unknown;
  storage?: StorageMock;
}): void {
  const navigatorStub: NavigatorLike = {};
  if (overrides.gpu !== undefined) {
    navigatorStub.gpu = overrides.gpu;
  }
  if (overrides.storage !== undefined) {
    navigatorStub.storage = overrides.storage;
  }
  Object.defineProperty(globalThis, "navigator", {
    value: navigatorStub,
    writable: true,
    configurable: true,
  });
}

function removeNavigator(): void {
  Object.defineProperty(globalThis, "navigator", {
    value: undefined,
    writable: true,
    configurable: true,
  });
}

function makeAsyncIterable(tokens: string[]): MockCompletion {
  return {
    async *[Symbol.asyncIterator]() {
      for (const token of tokens) {
        yield { choices: [{ delta: { content: token } }] };
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("webLLM.web", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateMLCEngine.mockResolvedValue(mockEngineInstance);
    installNavigator({
      gpu: {},
      storage: {
        persist: jest.fn().mockResolvedValue(true),
        estimate: jest
          .fn()
          .mockResolvedValue({ usage: 0, quota: 8 * 1024 * 1024 * 1024 }),
        persisted: jest.fn().mockResolvedValue(true),
      },
    });
  });

  afterEach(() => {
    removeNavigator();
  });

  // -------------------------------------------------------------------------
  // isWebLLMSupported
  // -------------------------------------------------------------------------

  describe("isWebLLMSupported", () => {
    it("returns false when navigator.gpu is undefined (no WebGPU)", () => {
      installNavigator({
        gpu: undefined,
        storage: { persist: jest.fn().mockResolvedValue(true) },
      });
      expect(isWebLLMSupported()).toBe(false);
    });

    it("returns false when navigator.storage is undefined (no OPFS)", () => {
      installNavigator({ gpu: {}, storage: undefined });
      expect(isWebLLMSupported()).toBe(false);
    });

    it("returns true when both WebGPU and OPFS are available", () => {
      installNavigator({
        gpu: {},
        storage: { persist: jest.fn().mockResolvedValue(true) },
      });
      expect(isWebLLMSupported()).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // createWebLLMEngine — factory
  // -------------------------------------------------------------------------

  describe("createWebLLMEngine", () => {
    it("returns an object with all required methods", () => {
      const engine = createWebLLMEngine();
      expect(typeof engine.load).toBe("function");
      expect(typeof engine.generate).toBe("function");
      expect(typeof engine.interrupt).toBe("function");
      expect(typeof engine.unload).toBe("function");
      expect(typeof engine.isLoaded).toBe("function");
      expect(typeof engine.getLoadedModelId).toBe("function");
    });

    it("starts in unloaded state: isLoaded=false, getLoadedModelId=null", () => {
      const engine = createWebLLMEngine();
      expect(engine.isLoaded()).toBe(false);
      expect(engine.getLoadedModelId()).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // load
  // -------------------------------------------------------------------------

  describe("load", () => {
    const modelId = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";

    it("initializes the web-llm engine with the specified model id", async () => {
      const engine = createWebLLMEngine();
      await engine.load({ modelId });
      expect(mockCreateMLCEngine).toHaveBeenCalledTimes(1);
      const call = mockCreateMLCEngine.mock.calls[0];
      expect(call[0]).toBe(modelId);
    });

    it("calls navigator.storage.persist() to prevent eviction", async () => {
      const persist = jest.fn().mockResolvedValue(true);
      installNavigator({
        gpu: {},
        storage: {
          persist,
          estimate: jest
            .fn()
            .mockResolvedValue({ usage: 0, quota: 8 * 1024 * 1024 * 1024 }),
          persisted: jest.fn().mockResolvedValue(true),
        },
      });
      const engine = createWebLLMEngine();
      await engine.load({ modelId });
      expect(persist).toHaveBeenCalledTimes(1);
    });

    it("invokes onProgress with {loaded, total, text} during download", async () => {
      const onProgress = jest.fn();
      mockCreateMLCEngine.mockImplementation(
        async (
          _model: string,
          opts: {
            initProgressCallback?: (p: {
              progress: number;
              timeElapsed: number;
              text: string;
            }) => void;
          },
        ) => {
          opts.initProgressCallback?.({
            progress: 0.25,
            timeElapsed: 1,
            text: "Fetching shard 1/4",
          });
          opts.initProgressCallback?.({
            progress: 1,
            timeElapsed: 4,
            text: "Ready",
          });
          return mockEngineInstance;
        },
      );

      const engine = createWebLLMEngine();
      await engine.load({ modelId, onProgress });
      expect(onProgress).toHaveBeenCalled();
      const firstArg = onProgress.mock.calls[0][0];
      expect(firstArg).toHaveProperty("loaded");
      expect(firstArg).toHaveProperty("total");
      expect(firstArg).toHaveProperty("text");
    });

    it("sets isLoaded() to true after successful load", async () => {
      const engine = createWebLLMEngine();
      await engine.load({ modelId });
      expect(engine.isLoaded()).toBe(true);
    });

    it("sets getLoadedModelId() to config.modelId after successful load", async () => {
      const engine = createWebLLMEngine();
      await engine.load({ modelId });
      expect(engine.getLoadedModelId()).toBe(modelId);
    });

    it("throws if WebGPU is unavailable", async () => {
      installNavigator({
        gpu: undefined,
        storage: { persist: jest.fn().mockResolvedValue(true) },
      });
      const engine = createWebLLMEngine();
      await expect(engine.load({ modelId })).rejects.toThrow(/WebGPU/i);
    });

    it("rejects if the underlying engine initialization fails", async () => {
      mockCreateMLCEngine.mockRejectedValueOnce(new Error("init failed"));
      const engine = createWebLLMEngine();
      await expect(engine.load({ modelId })).rejects.toThrow("init failed");
    });

    it("is a no-op when called twice with the same modelId", async () => {
      const engine = createWebLLMEngine();
      await engine.load({ modelId });
      await engine.load({ modelId });
      expect(mockCreateMLCEngine).toHaveBeenCalledTimes(1);
    });

    it("unloads previous model and loads new one when modelId differs", async () => {
      const engine = createWebLLMEngine();
      await engine.load({ modelId });
      await engine.load({ modelId: "OtherModel-q4f16_1-MLC" });
      expect(mockEngineInstance.unload).toHaveBeenCalled();
      expect(mockCreateMLCEngine).toHaveBeenCalledTimes(2);
      expect(engine.getLoadedModelId()).toBe("OtherModel-q4f16_1-MLC");
    });
  });

  // -------------------------------------------------------------------------
  // generate
  // -------------------------------------------------------------------------

  describe("generate", () => {
    const modelId = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";
    const messages: WebLLMMessage[] = [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Hello!" },
    ];

    async function loadedEngine(): Promise<WebLLMEngine> {
      const engine = createWebLLMEngine();
      await engine.load({ modelId });
      return engine;
    }

    it("throws if the engine is not loaded yet", async () => {
      const engine = createWebLLMEngine();
      await expect(engine.generate(messages)).rejects.toThrow(/loaded/i);
    });

    it("returns the full completion text on success", async () => {
      mockEngineInstance.chat.completions.create.mockResolvedValue(
        makeAsyncIterable(["Hel", "lo", " world"]),
      );
      const engine = await loadedEngine();
      const result = await engine.generate(messages);
      expect(result).toBe("Hello world");
    });

    it("invokes onToken for each streamed token", async () => {
      mockEngineInstance.chat.completions.create.mockResolvedValue(
        makeAsyncIterable(["A", "B", "C"]),
      );
      const engine = await loadedEngine();
      const tokens: string[] = [];
      await engine.generate(messages, { onToken: (t) => tokens.push(t) });
      expect(tokens).toEqual(["A", "B", "C"]);
    });

    it("passes temperature and maxTokens to the engine", async () => {
      mockEngineInstance.chat.completions.create.mockResolvedValue(
        makeAsyncIterable(["x"]),
      );
      const engine = await loadedEngine();
      await engine.generate(messages, { temperature: 0.42, maxTokens: 128 });
      const callArgs = mockEngineInstance.chat.completions.create.mock
        .calls[0][0] as Record<string, unknown>;
      expect(callArgs.temperature).toBe(0.42);
      expect(callArgs.max_tokens).toBe(128);
    });

    it("aborts generation when AbortSignal fires (calls interrupt)", async () => {
      mockEngineInstance.chat.completions.create.mockImplementation(
        async () => {
          return {
            async *[Symbol.asyncIterator]() {
              yield { choices: [{ delta: { content: "a" } }] };
              await new Promise((r) => setTimeout(r, 50));
              yield { choices: [{ delta: { content: "b" } }] };
            },
          };
        },
      );

      const engine = await loadedEngine();
      const controller = new AbortController();
      const genPromise = engine.generate(messages, {
        signal: controller.signal,
      });
      // Abort shortly after starting
      setTimeout(() => controller.abort(), 10);
      await genPromise.catch(() => {
        /* aborting may reject; that's fine */
      });
      expect(mockEngineInstance.interruptGenerate).toHaveBeenCalled();
    });

    it("formats messages with role/content correctly for web-llm's API", async () => {
      mockEngineInstance.chat.completions.create.mockResolvedValue(
        makeAsyncIterable(["ok"]),
      );
      const engine = await loadedEngine();
      await engine.generate(messages);
      const callArgs = mockEngineInstance.chat.completions.create.mock
        .calls[0][0] as { messages: WebLLMMessage[]; stream: boolean };
      expect(callArgs.messages).toEqual([
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hello!" },
      ]);
      expect(callArgs.stream).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // interrupt
  // -------------------------------------------------------------------------

  describe("interrupt", () => {
    it("is a no-op if nothing is currently generating", () => {
      const engine = createWebLLMEngine();
      expect(() => engine.interrupt()).not.toThrow();
      expect(mockEngineInstance.interruptGenerate).not.toHaveBeenCalled();
    });

    it("signals the engine to stop during active generation", async () => {
      mockEngineInstance.chat.completions.create.mockImplementation(
        async () => {
          return {
            async *[Symbol.asyncIterator]() {
              yield { choices: [{ delta: { content: "a" } }] };
              await new Promise((r) => setTimeout(r, 50));
              yield { choices: [{ delta: { content: "b" } }] };
            },
          };
        },
      );

      const engine = createWebLLMEngine();
      await engine.load({ modelId: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC" });

      const genPromise = engine.generate([{ role: "user", content: "hi" }]);
      setTimeout(() => engine.interrupt(), 10);
      await genPromise.catch(() => {
        /* interrupt may reject; that's fine */
      });
      expect(mockEngineInstance.interruptGenerate).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // unload
  // -------------------------------------------------------------------------

  describe("unload", () => {
    const modelId = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";

    it("releases the underlying engine", async () => {
      const engine = createWebLLMEngine();
      await engine.load({ modelId });
      await engine.unload();
      expect(mockEngineInstance.unload).toHaveBeenCalled();
    });

    it("sets isLoaded() to false after unload", async () => {
      const engine = createWebLLMEngine();
      await engine.load({ modelId });
      await engine.unload();
      expect(engine.isLoaded()).toBe(false);
    });

    it("sets getLoadedModelId() to null after unload", async () => {
      const engine = createWebLLMEngine();
      await engine.load({ modelId });
      await engine.unload();
      expect(engine.getLoadedModelId()).toBeNull();
    });

    it("is a no-op when nothing was loaded", async () => {
      const engine = createWebLLMEngine();
      await expect(engine.unload()).resolves.toBeUndefined();
      expect(mockEngineInstance.unload).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // getStorageQuota
  // -------------------------------------------------------------------------

  describe("getStorageQuota", () => {
    it("returns null when navigator.storage is undefined", async () => {
      installNavigator({ gpu: {}, storage: undefined });
      const result = await getStorageQuota();
      expect(result).toBeNull();
    });

    it("returns null when navigator is undefined", async () => {
      removeNavigator();
      const result = await getStorageQuota();
      expect(result).toBeNull();
    });

    it("returns null when estimate() is not a function", async () => {
      installNavigator({
        gpu: {},
        storage: { persist: jest.fn().mockResolvedValue(true) },
      });
      const result = await getStorageQuota();
      expect(result).toBeNull();
    });

    it("returns usage/quota/available/persistent from navigator.storage", async () => {
      const usage = 500 * 1024 * 1024; // 500 MB
      const quota = 2 * 1024 * 1024 * 1024; // 2 GB
      installNavigator({
        gpu: {},
        storage: {
          persist: jest.fn().mockResolvedValue(true),
          estimate: jest.fn().mockResolvedValue({ usage, quota }),
          persisted: jest.fn().mockResolvedValue(true),
        },
      });

      const result = await getStorageQuota();
      expect(result).not.toBeNull();
      expect(result?.usage).toBe(usage);
      expect(result?.quota).toBe(quota);
      expect(result?.available).toBe(quota - usage);
      expect(result?.persistent).toBe(true);
    });

    it("reports persistent=false when persisted() resolves false", async () => {
      installNavigator({
        gpu: {},
        storage: {
          persist: jest.fn().mockResolvedValue(true),
          estimate: jest
            .fn()
            .mockResolvedValue({ usage: 0, quota: 1024 * 1024 }),
          persisted: jest.fn().mockResolvedValue(false),
        },
      });
      const result = await getStorageQuota();
      expect(result?.persistent).toBe(false);
    });

    it("reports persistent=false when persisted() is missing", async () => {
      installNavigator({
        gpu: {},
        storage: {
          persist: jest.fn().mockResolvedValue(true),
          estimate: jest
            .fn()
            .mockResolvedValue({ usage: 0, quota: 1024 * 1024 }),
        },
      });
      const result = await getStorageQuota();
      expect(result?.persistent).toBe(false);
    });

    it("handles estimate() rejection gracefully", async () => {
      installNavigator({
        gpu: {},
        storage: {
          persist: jest.fn().mockResolvedValue(true),
          estimate: jest.fn().mockRejectedValue(new Error("denied")),
          persisted: jest.fn().mockResolvedValue(true),
        },
      });
      const result = await getStorageQuota();
      expect(result).toBeNull();
    });

    it("handles persisted() rejection gracefully (returns persistent=false)", async () => {
      installNavigator({
        gpu: {},
        storage: {
          persist: jest.fn().mockResolvedValue(true),
          estimate: jest
            .fn()
            .mockResolvedValue({ usage: 0, quota: 1024 * 1024 }),
          persisted: jest.fn().mockRejectedValue(new Error("denied")),
        },
      });
      const result = await getStorageQuota();
      expect(result).not.toBeNull();
      expect(result?.persistent).toBe(false);
    });

    it("defaults undefined usage/quota to 0", async () => {
      installNavigator({
        gpu: {},
        storage: {
          persist: jest.fn().mockResolvedValue(true),
          estimate: jest.fn().mockResolvedValue({}),
          persisted: jest.fn().mockResolvedValue(false),
        },
      });
      const result = await getStorageQuota();
      expect(result?.usage).toBe(0);
      expect(result?.quota).toBe(0);
      expect(result?.available).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // checkStorageForModel
  // -------------------------------------------------------------------------

  describe("checkStorageForModel", () => {
    function setQuota(usage: number, quota: number): void {
      installNavigator({
        gpu: {},
        storage: {
          persist: jest.fn().mockResolvedValue(true),
          estimate: jest.fn().mockResolvedValue({ usage, quota }),
          persisted: jest.fn().mockResolvedValue(true),
        },
      });
    }

    it("returns canFit=true when available > required*1.1", async () => {
      const required = 900 * 1024 * 1024; // 900 MB
      setQuota(0, 2 * 1024 * 1024 * 1024); // 2 GB available
      const result = await checkStorageForModel(required);
      expect(result.canFit).toBe(true);
      expect(result.requiredBytes).toBe(required);
      expect(result.shortfallBytes).toBe(0);
      expect(result.availableBytes).toBe(2 * 1024 * 1024 * 1024);
      expect(result.quota).not.toBeNull();
    });

    it("returns canFit=false with shortfall when required > available", async () => {
      const required = 2 * 1024 * 1024 * 1024; // 2 GB
      const quota = 1 * 1024 * 1024 * 1024; // 1 GB available
      const usage = 500 * 1024 * 1024; // 500 MB used
      setQuota(usage, quota);

      const result = await checkStorageForModel(required);
      expect(result.canFit).toBe(false);
      // required with 10% margin
      const requiredWithMargin = Math.ceil(required * 1.1);
      const availableBytes = quota - usage;
      expect(result.shortfallBytes).toBe(requiredWithMargin - availableBytes);
      expect(result.availableBytes).toBe(availableBytes);
      expect(result.reason).toBeDefined();
    });

    it("returns canFit=false when storage unavailable", async () => {
      installNavigator({ gpu: {}, storage: undefined });
      const result = await checkStorageForModel(100 * 1024 * 1024);
      expect(result.canFit).toBe(false);
      expect(result.quota).toBeNull();
      expect(result.availableBytes).toBe(0);
      expect(result.reason).toBeDefined();
    });

    it("applies 10% safety margin to required size", async () => {
      // 1000 MB required → with 10% margin = 1100 MB
      // Available = 1050 MB → should NOT fit due to margin
      const required = 1000 * 1024 * 1024;
      const available = 1050 * 1024 * 1024;
      setQuota(0, available);

      const result = await checkStorageForModel(required);
      expect(result.canFit).toBe(false);
      expect(result.shortfallBytes).toBeGreaterThan(0);

      // Without margin (1000 MB required, 1050 MB available), it WOULD fit.
      // So the failure must come from the 10% margin.
      const requiredWithMargin = Math.ceil(required * 1.1);
      expect(result.shortfallBytes).toBe(requiredWithMargin - available);
    });

    it("includes human-readable reason when !canFit", async () => {
      const required = 2 * 1024 * 1024 * 1024; // 2 GB
      setQuota(0, 500 * 1024 * 1024); // 500 MB available
      const result = await checkStorageForModel(required);
      expect(result.canFit).toBe(false);
      expect(result.reason).toMatch(/GB|MB/);
      // Mentions both required and available in some form
      expect(result.reason).toEqual(expect.any(String));
      expect((result.reason ?? "").length).toBeGreaterThan(0);
    });

    it("returns canFit=true at exact margin boundary", async () => {
      const required = 1000 * 1024 * 1024;
      const requiredWithMargin = Math.ceil(required * 1.1);
      setQuota(0, requiredWithMargin);
      const result = await checkStorageForModel(required);
      expect(result.canFit).toBe(true);
      expect(result.shortfallBytes).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // getEstimatedModelSize
  // -------------------------------------------------------------------------

  describe("getEstimatedModelSize", () => {
    it("returns a size for known Qwen 1.5B model", () => {
      const size = getEstimatedModelSize("Qwen2.5-1.5B-Instruct-q4f16_1-MLC");
      expect(size).not.toBeNull();
      expect(size).toBeGreaterThan(0);
    });

    it("returns a size for known Llama 3.2 3B model", () => {
      const size = getEstimatedModelSize("Llama-3.2-3B-Instruct-q4f16_1-MLC");
      expect(size).not.toBeNull();
      expect(size).toBeGreaterThan(0);
    });

    it("returns null for unknown model id", () => {
      const size = getEstimatedModelSize("Unknown-Model-XYZ");
      expect(size).toBeNull();
    });

    it("exposes WEB_LLM_MODEL_SIZES as a map", () => {
      expect(typeof WEB_LLM_MODEL_SIZES).toBe("object");
      expect(
        WEB_LLM_MODEL_SIZES["Qwen2.5-1.5B-Instruct-q4f16_1-MLC"],
      ).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // load with quota check
  // -------------------------------------------------------------------------

  describe("load with quota check", () => {
    const modelId = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";

    function setQuota(usage: number, quota: number): void {
      installNavigator({
        gpu: {},
        storage: {
          persist: jest.fn().mockResolvedValue(true),
          estimate: jest.fn().mockResolvedValue({ usage, quota }),
          persisted: jest.fn().mockResolvedValue(true),
        },
      });
    }

    it("throws when quota insufficient", async () => {
      // 500 MB available, 900 MB model → fails
      setQuota(0, 500 * 1024 * 1024);
      const engine = createWebLLMEngine();
      await expect(engine.load({ modelId })).rejects.toThrow(/storage|quota/i);
      // Engine should NOT have been created
      expect(mockCreateMLCEngine).not.toHaveBeenCalled();
    });

    it("proceeds when quota sufficient", async () => {
      // 4 GB available, 900 MB model → fits
      setQuota(0, 4 * 1024 * 1024 * 1024);
      const engine = createWebLLMEngine();
      await engine.load({ modelId });
      expect(mockCreateMLCEngine).toHaveBeenCalledTimes(1);
    });

    it("skips quota check with skipQuotaCheck=true", async () => {
      // 500 MB available, 900 MB model → would fail, but skipped
      setQuota(0, 500 * 1024 * 1024);
      const engine = createWebLLMEngine();
      await engine.load({ modelId, skipQuotaCheck: true });
      expect(mockCreateMLCEngine).toHaveBeenCalledTimes(1);
    });

    it("warns to console but proceeds when model size unknown", async () => {
      const unknownModel = "Unknown-Model-ID-XYZ";
      setQuota(0, 100 * 1024); // even 100 KB, but size unknown → proceed
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
      try {
        const engine = createWebLLMEngine();
        await engine.load({ modelId: unknownModel });
        expect(mockCreateMLCEngine).toHaveBeenCalledTimes(1);
        expect(warnSpy).toHaveBeenCalled();
      } finally {
        warnSpy.mockRestore();
      }
    });

    it("proceeds when Storage API is unavailable (can't check, best-effort)", async () => {
      installNavigator({ gpu: {}, storage: undefined });
      const engine = createWebLLMEngine();
      // No storage means isWebLLMSupported() returns false → load throws for that reason
      await expect(engine.load({ modelId })).rejects.toThrow(/WebGPU/i);
    });
  });
});
