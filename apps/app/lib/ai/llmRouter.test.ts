/**
 * Tests for the llmRouter — routes `sendMessage` calls to the correct
 * engine (executorch / web-llm / tauri-llm) based on the selected model ID.
 *
 * These are integration-style tests: they exercise the real routing logic
 * but inject mock engine factories so no actual inference happens.
 */

import {
  createLLMRouter,
  type LLMRouter,
  type LLMRouterDependencies,
} from "./llmRouter";
import type { LlmModelConfig } from "./modelConfig";
import type {
  TauriLLMEngine,
  TauriLLMMessage,
  TauriLLMGenerateOptions,
  TauriLLMConfig,
} from "../platform/tauriLLM";
import type {
  WebLLMEngine,
  WebLLMMessage,
  WebLLMGenerateOptions,
  WebLLMConfig,
} from "../platform/webLLM";
import type { Message } from "react-native-executorch";

// ---------------------------------------------------------------------------
// Fake engines
// ---------------------------------------------------------------------------

function createFakeWebLLMEngine(): WebLLMEngine & {
  loadCalls: WebLLMConfig[];
  generateCalls: Array<{
    messages: WebLLMMessage[];
    options?: WebLLMGenerateOptions;
  }>;
  interruptCalls: number;
  unloadCalls: number;
} {
  let loadedModelId: string | null = null;
  const loadCalls: WebLLMConfig[] = [];
  const generateCalls: Array<{
    messages: WebLLMMessage[];
    options?: WebLLMGenerateOptions;
  }> = [];
  let interruptCalls = 0;
  let unloadCalls = 0;

  return {
    async load(config: WebLLMConfig): Promise<void> {
      loadCalls.push(config);
      loadedModelId = config.modelId;
    },
    async generate(
      messages: WebLLMMessage[],
      options?: WebLLMGenerateOptions,
    ): Promise<string> {
      generateCalls.push({ messages, options });
      // Simulate streaming
      const full = "hello from web-llm";
      if (options?.onToken) {
        for (const ch of full.split("")) {
          options.onToken(ch);
        }
      }
      return full;
    },
    interrupt(): void {
      interruptCalls += 1;
    },
    async unload(): Promise<void> {
      unloadCalls += 1;
      loadedModelId = null;
    },
    isLoaded(): boolean {
      return loadedModelId !== null;
    },
    getLoadedModelId(): string | null {
      return loadedModelId;
    },
    get loadCalls() {
      return loadCalls;
    },
    get generateCalls() {
      return generateCalls;
    },
    get interruptCalls() {
      return interruptCalls;
    },
    get unloadCalls() {
      return unloadCalls;
    },
  };
}

function createFakeTauriLLMEngine(): TauriLLMEngine & {
  loadCalls: TauriLLMConfig[];
  generateCalls: Array<{
    messages: TauriLLMMessage[];
    options?: TauriLLMGenerateOptions;
  }>;
  interruptCalls: number;
  unloadCalls: number;
} {
  let loadedModelId: string | null = null;
  const loadCalls: TauriLLMConfig[] = [];
  const generateCalls: Array<{
    messages: TauriLLMMessage[];
    options?: TauriLLMGenerateOptions;
  }> = [];
  let interruptCalls = 0;
  let unloadCalls = 0;

  return {
    async load(config: TauriLLMConfig): Promise<void> {
      loadCalls.push(config);
      loadedModelId = config.modelId;
    },
    async generate(
      messages: TauriLLMMessage[],
      options?: TauriLLMGenerateOptions,
    ): Promise<string> {
      generateCalls.push({ messages, options });
      const full = "hello from tauri-llm";
      if (options?.onToken) {
        for (const ch of full.split("")) {
          options.onToken(ch);
        }
      }
      return full;
    },
    async interrupt(): Promise<void> {
      interruptCalls += 1;
    },
    async unload(): Promise<void> {
      unloadCalls += 1;
      loadedModelId = null;
    },
    isLoaded(): boolean {
      return loadedModelId !== null;
    },
    getLoadedModelId(): string | null {
      return loadedModelId;
    },
    get loadCalls() {
      return loadCalls;
    },
    get generateCalls() {
      return generateCalls;
    },
    get interruptCalls() {
      return interruptCalls;
    },
    get unloadCalls() {
      return unloadCalls;
    },
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const webQwenConfig: LlmModelConfig = {
  modelType: "llm",
  modelId: "web-qwen-2.5-1.5b",
  displayName: "Qwen 2.5 1.5B (Web)",
  description: "web",
  size: "1.5B",
  folderName: "web-qwen-2.5-1.5b",
  pteFileName: "",
  available: true,
  supportedPlatforms: ["web"],
  pteSource: { kind: "remote", url: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC" },
  tokenizerSource: { kind: "unavailable", reason: "Handled by web-llm" },
  tokenizerConfigSource: { kind: "unavailable", reason: "Handled by web-llm" },
};

const webLlamaConfig: LlmModelConfig = {
  ...webQwenConfig,
  modelId: "web-llama-3.2-3b",
  displayName: "Llama 3.2 3B (Web)",
};

const desktopLlamaConfig: LlmModelConfig = {
  modelType: "llm",
  modelId: "desktop-llama-3.2-3b",
  displayName: "Llama 3.2 3B (Desktop)",
  description: "desktop",
  size: "3B",
  folderName: "desktop-llama-3.2-3b",
  pteFileName: "llama-3.2-3b-instruct-q4_k_m.gguf",
  available: true,
  supportedPlatforms: ["tauri", "macos"],
  pteSource: { kind: "remote", url: "https://example.com/llama.gguf" },
  tokenizerSource: { kind: "unavailable", reason: "Embedded in GGUF" },
  tokenizerConfigSource: { kind: "unavailable", reason: "Embedded in GGUF" },
};

const sampleMessages: Message[] = [{ role: "user", content: "hi" }];

// ---------------------------------------------------------------------------
// Dependency factory
// ---------------------------------------------------------------------------

function buildDeps(
  overrides: Partial<LLMRouterDependencies> = {},
): LLMRouterDependencies & {
  webEngine: ReturnType<typeof createFakeWebLLMEngine>;
  tauriEngine: ReturnType<typeof createFakeTauriLLMEngine>;
} {
  const webEngine = createFakeWebLLMEngine();
  const tauriEngine = createFakeTauriLLMEngine();
  return {
    webEngine,
    tauriEngine,
    createWebLLMEngine: () => webEngine,
    createTauriLLMEngine: () => tauriEngine,
    ensureDesktopModelPresent: jest.fn().mockResolvedValue("/tmp/llama.gguf"),
    isWebPlatform: () => true,
    isTauriPlatform: () => true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("llmRouter", () => {
  describe("web-llm routing", () => {
    it("routes a web-qwen model to the web engine", async () => {
      const deps = buildDeps();
      const router: LLMRouter = createLLMRouter(deps);

      const result = await router.sendWebLLMMessage(
        webQwenConfig,
        sampleMessages,
      );

      expect(result).toBe("hello from web-llm");
      expect(deps.webEngine.loadCalls).toHaveLength(1);
      expect(deps.webEngine.loadCalls[0].modelId).toBe(webQwenConfig.modelId);
      // MLC artifact id extracted from pteSource.url
      expect(deps.webEngine.loadCalls[0].mlcModelId).toBe(
        "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
      );
      expect(deps.webEngine.generateCalls).toHaveLength(1);
      expect(deps.tauriEngine.loadCalls).toHaveLength(0);
    });

    it("invokes responseCallback with accumulated text as tokens stream", async () => {
      const deps = buildDeps();
      const router = createLLMRouter(deps);

      const chunks: string[] = [];
      await router.sendWebLLMMessage(webQwenConfig, sampleMessages, {
        responseCallback: (soFar) => {
          chunks.push(soFar);
        },
      });

      // Each streamed token fires responseCallback with the accumulated text
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[chunks.length - 1]).toBe("hello from web-llm");
      // Accumulation is strictly monotonic
      for (let i = 1; i < chunks.length; i += 1) {
        expect(chunks[i].startsWith(chunks[i - 1])).toBe(true);
      }
    });

    it("prepends a system prompt when thinkMode !== 'none'", async () => {
      const deps = buildDeps();
      const router = createLLMRouter(deps);

      await router.sendWebLLMMessage(webQwenConfig, sampleMessages, {
        systemPrompt: "You are a helpful assistant.",
        thinkMode: "think",
      });

      const [{ messages }] = deps.webEngine.generateCalls;
      expect(messages[0].role).toBe("system");
      expect(messages[0].content).toBe("You are a helpful assistant.");
      expect(messages[1].role).toBe("user");
    });

    it("adds the /no_think prefix for Qwen models in no-think mode", async () => {
      const deps = buildDeps();
      const router = createLLMRouter(deps);

      await router.sendWebLLMMessage(webQwenConfig, sampleMessages, {
        systemPrompt: "You are a helpful assistant.",
        thinkMode: "no-think",
      });

      const [{ messages }] = deps.webEngine.generateCalls;
      expect(messages[0].role).toBe("system");
      expect(messages[0].content.startsWith("/no_think ")).toBe(true);
    });

    it("does NOT add /no_think prefix for non-Qwen (Llama) web models", async () => {
      const deps = buildDeps();
      const router = createLLMRouter(deps);

      await router.sendWebLLMMessage(webLlamaConfig, sampleMessages, {
        systemPrompt: "You are a helpful assistant.",
        thinkMode: "no-think",
      });

      const [{ messages }] = deps.webEngine.generateCalls;
      expect(messages[0].role).toBe("system");
      expect(messages[0].content.startsWith("/no_think ")).toBe(false);
    });

    it("skips the system prompt when thinkMode === 'none'", async () => {
      const deps = buildDeps();
      const router = createLLMRouter(deps);

      await router.sendWebLLMMessage(webQwenConfig, sampleMessages, {
        systemPrompt: "ignored",
        thinkMode: "none",
      });

      const [{ messages }] = deps.webEngine.generateCalls;
      expect(messages[0].role).toBe("user");
    });

    it("throws when Platform.OS !== 'web'", async () => {
      const deps = buildDeps({ isWebPlatform: () => false });
      const router = createLLMRouter(deps);

      await expect(
        router.sendWebLLMMessage(webQwenConfig, sampleMessages),
      ).rejects.toThrow("Web LLM is only available in web browsers");
    });
  });

  describe("tauri-llm routing", () => {
    it("routes a desktop model to the tauri engine", async () => {
      const deps = buildDeps();
      const router = createLLMRouter(deps);

      const result = await router.sendTauriLLMMessage(
        desktopLlamaConfig,
        sampleMessages,
      );

      expect(result).toBe("hello from tauri-llm");
      expect(deps.tauriEngine.loadCalls).toHaveLength(1);
      expect(deps.tauriEngine.loadCalls[0].modelId).toBe(
        desktopLlamaConfig.modelId,
      );
      expect(deps.tauriEngine.loadCalls[0].modelPath).toBe("/tmp/llama.gguf");
      expect(deps.tauriEngine.generateCalls).toHaveLength(1);
      expect(deps.webEngine.loadCalls).toHaveLength(0);
    });

    it("downloads the model via ensureDesktopModelPresent before loading", async () => {
      const ensureFn = jest.fn().mockResolvedValue("/some/abs/path/llama.gguf");
      const deps = buildDeps({ ensureDesktopModelPresent: ensureFn });
      const router = createLLMRouter(deps);

      await router.sendTauriLLMMessage(desktopLlamaConfig, sampleMessages);

      expect(ensureFn).toHaveBeenCalledWith(desktopLlamaConfig);
      expect(deps.tauriEngine.loadCalls[0].modelPath).toBe(
        "/some/abs/path/llama.gguf",
      );
    });

    it("streams tokens via responseCallback", async () => {
      const deps = buildDeps();
      const router = createLLMRouter(deps);

      const chunks: string[] = [];
      await router.sendTauriLLMMessage(desktopLlamaConfig, sampleMessages, {
        responseCallback: (soFar) => {
          chunks.push(soFar);
        },
      });

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[chunks.length - 1]).toBe("hello from tauri-llm");
    });

    it("throws when isTauri() === false", async () => {
      const deps = buildDeps({ isTauriPlatform: () => false });
      const router = createLLMRouter(deps);

      await expect(
        router.sendTauriLLMMessage(desktopLlamaConfig, sampleMessages),
      ).rejects.toThrow("Desktop LLM is only available via Tauri");
    });
  });

  describe("engine switching / unload semantics", () => {
    it("switching from web to tauri unloads the web engine first", async () => {
      const deps = buildDeps();
      const router = createLLMRouter(deps);

      await router.sendWebLLMMessage(webQwenConfig, sampleMessages);
      expect(deps.webEngine.unloadCalls).toBe(0);

      await router.sendTauriLLMMessage(desktopLlamaConfig, sampleMessages);

      expect(deps.webEngine.unloadCalls).toBeGreaterThanOrEqual(1);
      expect(deps.tauriEngine.loadCalls).toHaveLength(1);
    });

    it("switching from tauri to web unloads the tauri engine first", async () => {
      const deps = buildDeps();
      const router = createLLMRouter(deps);

      await router.sendTauriLLMMessage(desktopLlamaConfig, sampleMessages);
      expect(deps.tauriEngine.unloadCalls).toBe(0);

      await router.sendWebLLMMessage(webQwenConfig, sampleMessages);

      expect(deps.tauriEngine.unloadCalls).toBeGreaterThanOrEqual(1);
      expect(deps.webEngine.loadCalls).toHaveLength(1);
    });

    it("switching between two web models unloads the previous web load", async () => {
      const deps = buildDeps();
      const router = createLLMRouter(deps);

      await router.sendWebLLMMessage(webQwenConfig, sampleMessages);
      await router.sendWebLLMMessage(webLlamaConfig, sampleMessages);

      // Two loads, one unload (old -> new)
      expect(deps.webEngine.loadCalls).toHaveLength(2);
      expect(deps.webEngine.unloadCalls).toBeGreaterThanOrEqual(1);
    });

    it("reusing the same web model is a no-op reload", async () => {
      const deps = buildDeps();
      const router = createLLMRouter(deps);

      await router.sendWebLLMMessage(webQwenConfig, sampleMessages);
      await router.sendWebLLMMessage(webQwenConfig, sampleMessages);

      // Second call should not reload
      expect(deps.webEngine.loadCalls).toHaveLength(1);
      expect(deps.webEngine.generateCalls).toHaveLength(2);
    });
  });

  describe("interrupt / unloadAll", () => {
    it("interrupt() calls interrupt on the active web engine", async () => {
      const deps = buildDeps();
      const router = createLLMRouter(deps);

      await router.sendWebLLMMessage(webQwenConfig, sampleMessages);
      router.interruptAll();

      expect(deps.webEngine.interruptCalls).toBeGreaterThanOrEqual(1);
    });

    it("interrupt() calls interrupt on the active tauri engine", async () => {
      const deps = buildDeps();
      const router = createLLMRouter(deps);

      await router.sendTauriLLMMessage(desktopLlamaConfig, sampleMessages);
      router.interruptAll();

      expect(deps.tauriEngine.interruptCalls).toBeGreaterThanOrEqual(1);
    });

    it("unloadAll() unloads both web and tauri engines if loaded", async () => {
      const deps = buildDeps();
      const router = createLLMRouter(deps);

      await router.sendWebLLMMessage(webQwenConfig, sampleMessages);
      await router.unloadAll();

      expect(deps.webEngine.unloadCalls).toBeGreaterThanOrEqual(1);
      expect(router.isAnyLoaded()).toBe(false);
    });

    it("isAnyLoaded reports true after loading a model", async () => {
      const deps = buildDeps();
      const router = createLLMRouter(deps);

      expect(router.isAnyLoaded()).toBe(false);
      await router.sendWebLLMMessage(webQwenConfig, sampleMessages);
      expect(router.isAnyLoaded()).toBe(true);
    });
  });

  describe("Integration: resolved modelId routing", () => {
    // These tests verify the router preserves the modelId from the
    // config for identity tracking, while extracting the MLC artifact
    // id from pteSource.url for the engine load.

    it("loadWebLLM uses the app modelId for identity and MLC id for engine", async () => {
      const deps = buildDeps();
      const router = createLLMRouter(deps);

      await router.sendWebLLMMessage(webLlamaConfig, sampleMessages);

      expect(deps.webEngine.loadCalls).toHaveLength(1);
      expect(deps.webEngine.loadCalls[0].modelId).toBe("web-llama-3.2-3b");
      expect(deps.webEngine.loadCalls[0].mlcModelId).toBe(
        "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
      );
    });

    it("loadTauriLLM uses the exact modelId from the passed config", async () => {
      const deps = buildDeps();
      const router = createLLMRouter(deps);

      // Simulate a caller passing a resolved desktop-* config.
      await router.sendTauriLLMMessage(desktopLlamaConfig, sampleMessages);

      expect(deps.tauriEngine.loadCalls).toHaveLength(1);
      expect(deps.tauriEngine.loadCalls[0].modelId).toBe(
        desktopLlamaConfig.modelId,
      );
      expect(deps.tauriEngine.loadCalls[0].modelId).toBe(
        "desktop-llama-3.2-3b",
      );
    });

    it("passes the resolved modelId through to the generate() call's prepared messages", async () => {
      // The system prompt's /no_think handling keys off the modelId from
      // the config. Verify the check uses the app-level id.
      const deps = buildDeps();
      const router = createLLMRouter(deps);

      await router.sendWebLLMMessage(webQwenConfig, sampleMessages, {
        systemPrompt: "Be helpful.",
        thinkMode: "no-think",
      });

      const [{ messages }] = deps.webEngine.generateCalls;
      expect(messages[0].role).toBe("system");
      // Qwen detection runs on the app-level modelId from the config.
      expect(messages[0].content.startsWith("/no_think ")).toBe(true);
    });

    it("does NOT apply Qwen /no_think logic for a resolved Llama modelId", async () => {
      // If a persona resolves to a Llama sibling (non-Qwen), the Qwen-only
      // /no_think prefix must not be applied.
      const deps = buildDeps();
      const router = createLLMRouter(deps);

      await router.sendWebLLMMessage(webLlamaConfig, sampleMessages, {
        systemPrompt: "Be helpful.",
        thinkMode: "no-think",
      });

      const [{ messages }] = deps.webEngine.generateCalls;
      expect(messages[0].role).toBe("system");
      expect(messages[0].content.startsWith("/no_think ")).toBe(false);
    });
  });
});
