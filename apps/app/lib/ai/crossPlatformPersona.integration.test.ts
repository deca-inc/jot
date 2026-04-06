/**
 * Integration tests for cross-platform persona portability.
 *
 * These tests exercise the real `ALL_LLM_MODELS` registry (no mocks) against
 * `resolvePersonaModel` / `isPersonaAvailableOnPlatform` /
 * `getPersonaResolutionInfo`, verifying that:
 *
 * 1. A persona pinned to a mobile-only modelId still runs on desktop/web via
 *    same-family fallback (e.g. llama-3.2-3b-instruct -> web-llama-3.2-3b on
 *    web, desktop-llama-3.2-3b on tauri).
 * 2. Personas pinned to mobile-only families (e.g. smollm2-135m) are correctly
 *    rejected on web/tauri.
 * 3. Remote and platform models behave according to their own rules.
 *
 * Plus a router-integration test that verifies the contract between persona
 * resolution and engine routing: whatever modelId resolvePersonaModel returns
 * is exactly what the underlying engine's `load()` receives.
 */

import { createLLMRouter, type LLMRouterDependencies } from "./llmRouter";
import {
  ALL_LLM_MODELS,
  getModelById,
  type LlmModelConfig,
} from "./modelConfig";
import {
  getPersonaResolutionInfo,
  isPersonaAvailableOnPlatform,
  resolvePersonaModel,
  type PersonaModelRef,
} from "./personaAvailability";
import type {
  TauriLLMConfig,
  TauriLLMEngine,
  TauriLLMGenerateOptions,
  TauriLLMMessage,
} from "../platform/tauriLLM";
import type {
  WebLLMConfig,
  WebLLMEngine,
  WebLLMGenerateOptions,
  WebLLMMessage,
} from "../platform/webLLM";
import type { AppPlatform } from "./platformFilter";
import type { Message } from "react-native-executorch";

const ALL_PLATFORMS: AppPlatform[] = [
  "ios",
  "android",
  "web",
  "tauri",
  "macos",
];

describe("Cross-platform persona portability (real registry)", () => {
  describe("persona tied to llama-3.2-3b family (mobile modelId)", () => {
    const persona: PersonaModelRef = { modelId: "llama-3.2-3b-instruct" };

    it("runs as-is on ios", () => {
      expect(resolvePersonaModel(persona, ALL_LLM_MODELS, "ios")).toBe(
        "llama-3.2-3b-instruct",
      );
    });

    it("runs as-is on android", () => {
      expect(resolvePersonaModel(persona, ALL_LLM_MODELS, "android")).toBe(
        "llama-3.2-3b-instruct",
      );
    });

    it("resolves to web-llama-3.2-3b on web", () => {
      expect(resolvePersonaModel(persona, ALL_LLM_MODELS, "web")).toBe(
        "web-llama-3.2-3b",
      );
    });

    it("resolves to desktop-llama-3.2-3b on tauri", () => {
      expect(resolvePersonaModel(persona, ALL_LLM_MODELS, "tauri")).toBe(
        "desktop-llama-3.2-3b",
      );
    });

    it("resolves to desktop-llama-3.2-3b on macos", () => {
      expect(resolvePersonaModel(persona, ALL_LLM_MODELS, "macos")).toBe(
        "desktop-llama-3.2-3b",
      );
    });

    it("is available on all platforms in the family", () => {
      for (const platform of ALL_PLATFORMS) {
        expect(
          isPersonaAvailableOnPlatform(persona, ALL_LLM_MODELS, platform),
        ).toBe(true);
      }
    });

    it("shows no fallback info on ios (exact match)", () => {
      const info = getPersonaResolutionInfo(persona, ALL_LLM_MODELS, "ios");
      expect(info.available).toBe(true);
      expect(info.usingFallback).toBe(false);
      expect(info.resolvedModelId).toBe("llama-3.2-3b-instruct");
    });

    it("shows fallback info on web with the web sibling's displayName", () => {
      const info = getPersonaResolutionInfo(persona, ALL_LLM_MODELS, "web");
      expect(info.available).toBe(true);
      expect(info.usingFallback).toBe(true);
      expect(info.resolvedModelId).toBe("web-llama-3.2-3b");
      expect(info.displayName).toBe("Llama 3.2 3B (Web)");
    });

    it("shows fallback info on tauri with the desktop sibling's displayName", () => {
      const info = getPersonaResolutionInfo(persona, ALL_LLM_MODELS, "tauri");
      expect(info.available).toBe(true);
      expect(info.usingFallback).toBe(true);
      expect(info.resolvedModelId).toBe("desktop-llama-3.2-3b");
      expect(info.displayName).toBe("Llama 3.2 3B (Desktop)");
    });
  });

  describe("persona tied to smollm2-135m (mobile-only family)", () => {
    const persona: PersonaModelRef = { modelId: "smollm2-135m" };

    it("runs on ios", () => {
      expect(resolvePersonaModel(persona, ALL_LLM_MODELS, "ios")).toBe(
        "smollm2-135m",
      );
    });

    it("runs on android", () => {
      expect(resolvePersonaModel(persona, ALL_LLM_MODELS, "android")).toBe(
        "smollm2-135m",
      );
    });

    it("is unavailable on web (no cross-platform sibling)", () => {
      expect(resolvePersonaModel(persona, ALL_LLM_MODELS, "web")).toBeNull();
    });

    it("is unavailable on tauri (no cross-platform sibling)", () => {
      expect(resolvePersonaModel(persona, ALL_LLM_MODELS, "tauri")).toBeNull();
    });

    it("is unavailable on macos (no cross-platform sibling)", () => {
      expect(resolvePersonaModel(persona, ALL_LLM_MODELS, "macos")).toBeNull();
    });

    it("shows unavailable in resolution info on web", () => {
      const info = getPersonaResolutionInfo(persona, ALL_LLM_MODELS, "web");
      expect(info.available).toBe(false);
      expect(info.resolvedModelId).toBeNull();
      expect(info.usingFallback).toBe(false);
      expect(info.displayName).toBeNull();
    });

    it("isPersonaAvailableOnPlatform matches resolvePersonaModel", () => {
      for (const platform of ALL_PLATFORMS) {
        const resolved = resolvePersonaModel(persona, ALL_LLM_MODELS, platform);
        const available = isPersonaAvailableOnPlatform(
          persona,
          ALL_LLM_MODELS,
          platform,
        );
        expect(available).toBe(resolved !== null);
      }
    });
  });

  describe("persona tied to qwen-3-1.7b family (mobile + desktop, no web)", () => {
    const persona: PersonaModelRef = { modelId: "qwen-3-1.7b" };

    it("runs as-is on ios", () => {
      expect(resolvePersonaModel(persona, ALL_LLM_MODELS, "ios")).toBe(
        "qwen-3-1.7b",
      );
    });

    it("runs as-is on android", () => {
      expect(resolvePersonaModel(persona, ALL_LLM_MODELS, "android")).toBe(
        "qwen-3-1.7b",
      );
    });

    it("resolves to desktop-qwen-3-1.7b on tauri", () => {
      expect(resolvePersonaModel(persona, ALL_LLM_MODELS, "tauri")).toBe(
        "desktop-qwen-3-1.7b",
      );
    });

    it("resolves to desktop-qwen-3-1.7b on macos", () => {
      expect(resolvePersonaModel(persona, ALL_LLM_MODELS, "macos")).toBe(
        "desktop-qwen-3-1.7b",
      );
    });

    it("is unavailable on web (no web sibling for this family)", () => {
      expect(resolvePersonaModel(persona, ALL_LLM_MODELS, "web")).toBeNull();
    });

    it("shows fallback info on tauri", () => {
      const info = getPersonaResolutionInfo(persona, ALL_LLM_MODELS, "tauri");
      expect(info.available).toBe(true);
      expect(info.usingFallback).toBe(true);
      expect(info.resolvedModelId).toBe("desktop-qwen-3-1.7b");
    });
  });

  describe("persona tied to llama-3.2-1b family (mobile + desktop, no web)", () => {
    const persona: PersonaModelRef = { modelId: "llama-3.2-1b-instruct" };

    it("runs as-is on ios", () => {
      expect(resolvePersonaModel(persona, ALL_LLM_MODELS, "ios")).toBe(
        "llama-3.2-1b-instruct",
      );
    });

    it("resolves to desktop-llama-3.2-1b on tauri", () => {
      expect(resolvePersonaModel(persona, ALL_LLM_MODELS, "tauri")).toBe(
        "desktop-llama-3.2-1b",
      );
    });

    it("is unavailable on web (no web sibling)", () => {
      expect(resolvePersonaModel(persona, ALL_LLM_MODELS, "web")).toBeNull();
    });
  });

  describe("persona tied to remote API model", () => {
    const persona: PersonaModelRef = { modelId: "remote-openai-gpt-4" };

    it("is always available (remote models are API calls)", () => {
      for (const platform of ALL_PLATFORMS) {
        expect(resolvePersonaModel(persona, ALL_LLM_MODELS, platform)).toBe(
          "remote-openai-gpt-4",
        );
      }
    });

    it("never uses fallback (resolves to itself)", () => {
      for (const platform of ALL_PLATFORMS) {
        const info = getPersonaResolutionInfo(
          persona,
          ALL_LLM_MODELS,
          platform,
        );
        expect(info.available).toBe(true);
        expect(info.usingFallback).toBe(false);
      }
    });
  });

  describe("persona tied to custom-local model", () => {
    const persona: PersonaModelRef = { modelId: "custom-mistral-7b" };

    it("runs on mobile (ios/android)", () => {
      expect(resolvePersonaModel(persona, ALL_LLM_MODELS, "ios")).toBe(
        "custom-mistral-7b",
      );
      expect(resolvePersonaModel(persona, ALL_LLM_MODELS, "android")).toBe(
        "custom-mistral-7b",
      );
    });

    it("is unavailable on web/tauri/macos (mobile-only)", () => {
      expect(resolvePersonaModel(persona, ALL_LLM_MODELS, "web")).toBeNull();
      expect(resolvePersonaModel(persona, ALL_LLM_MODELS, "tauri")).toBeNull();
      expect(resolvePersonaModel(persona, ALL_LLM_MODELS, "macos")).toBeNull();
    });
  });

  describe("persona tied to platform model", () => {
    it("apple-foundation only on ios/macos", () => {
      const persona: PersonaModelRef = { modelId: "apple-foundation" };
      expect(resolvePersonaModel(persona, ALL_LLM_MODELS, "ios")).toBe(
        "apple-foundation",
      );
      expect(resolvePersonaModel(persona, ALL_LLM_MODELS, "macos")).toBe(
        "apple-foundation",
      );
      expect(
        resolvePersonaModel(persona, ALL_LLM_MODELS, "android"),
      ).toBeNull();
      expect(resolvePersonaModel(persona, ALL_LLM_MODELS, "web")).toBeNull();
      expect(resolvePersonaModel(persona, ALL_LLM_MODELS, "tauri")).toBeNull();
    });

    it("gemini-nano only on android", () => {
      const persona: PersonaModelRef = { modelId: "gemini-nano" };
      expect(resolvePersonaModel(persona, ALL_LLM_MODELS, "android")).toBe(
        "gemini-nano",
      );
      expect(resolvePersonaModel(persona, ALL_LLM_MODELS, "ios")).toBeNull();
      expect(resolvePersonaModel(persona, ALL_LLM_MODELS, "macos")).toBeNull();
      expect(resolvePersonaModel(persona, ALL_LLM_MODELS, "web")).toBeNull();
      expect(resolvePersonaModel(persona, ALL_LLM_MODELS, "tauri")).toBeNull();
    });
  });

  describe("persona tied to a web-only model (persona created in browser)", () => {
    const persona: PersonaModelRef = { modelId: "web-llama-3.2-3b" };

    it("runs as-is on web", () => {
      expect(resolvePersonaModel(persona, ALL_LLM_MODELS, "web")).toBe(
        "web-llama-3.2-3b",
      );
    });

    it("falls back to the mobile sibling on ios via the llama-3.2-3b family", () => {
      expect(resolvePersonaModel(persona, ALL_LLM_MODELS, "ios")).toBe(
        "llama-3.2-3b-instruct",
      );
    });

    it("falls back to desktop sibling on tauri", () => {
      expect(resolvePersonaModel(persona, ALL_LLM_MODELS, "tauri")).toBe(
        "desktop-llama-3.2-3b",
      );
    });
  });

  describe("persona tied to a desktop-only model (persona created on desktop)", () => {
    const persona: PersonaModelRef = { modelId: "desktop-llama-3.2-3b" };

    it("runs as-is on tauri/macos", () => {
      expect(resolvePersonaModel(persona, ALL_LLM_MODELS, "tauri")).toBe(
        "desktop-llama-3.2-3b",
      );
      expect(resolvePersonaModel(persona, ALL_LLM_MODELS, "macos")).toBe(
        "desktop-llama-3.2-3b",
      );
    });

    it("falls back to mobile sibling on ios/android", () => {
      expect(resolvePersonaModel(persona, ALL_LLM_MODELS, "ios")).toBe(
        "llama-3.2-3b-instruct",
      );
      expect(resolvePersonaModel(persona, ALL_LLM_MODELS, "android")).toBe(
        "llama-3.2-3b-instruct",
      );
    });

    it("falls back to web sibling on web", () => {
      expect(resolvePersonaModel(persona, ALL_LLM_MODELS, "web")).toBe(
        "web-llama-3.2-3b",
      );
    });
  });

  describe("family coverage summary (real registry)", () => {
    it("ALL_LLM_MODELS has at least one tagged modelFamily", () => {
      const familiesFromModels = new Set(
        ALL_LLM_MODELS.filter((m) => m.modelFamily).map(
          (m) => m.modelFamily as string,
        ),
      );
      expect(familiesFromModels.size).toBeGreaterThan(0);
    });

    it("every built-in mobile model declares a modelFamily", () => {
      const mobileBuiltInIds = [
        "smollm2-135m",
        "smollm2-360m",
        "smollm2-1.7b",
        "llama-3.2-1b-instruct",
        "llama-3.2-3b-instruct",
        "qwen-3-0.6b",
        "qwen-3-1.7b",
        "qwen-3-4b",
      ];
      for (const id of mobileBuiltInIds) {
        const model = getModelById(id);
        expect(model).toBeDefined();
        expect(model?.modelFamily).toBeTruthy();
      }
    });

    it("cross-platform families have 2+ variants (llama-3.2-3b, qwen-2.5-1.5b)", () => {
      const crossPlatformFamilies = ["llama-3.2-3b", "qwen-2.5-1.5b"];
      for (const family of crossPlatformFamilies) {
        const variants = ALL_LLM_MODELS.filter((m) => m.modelFamily === family);
        expect(variants.length).toBeGreaterThanOrEqual(2);
      }
    });

    it("llama-3.2-3b family has variants for mobile, web, and desktop", () => {
      const variants = ALL_LLM_MODELS.filter(
        (m) => m.modelFamily === "llama-3.2-3b",
      );
      const platforms = new Set(
        variants.flatMap((v) => v.supportedPlatforms ?? []),
      );
      expect(platforms.has("ios")).toBe(true);
      expect(platforms.has("android")).toBe(true);
      expect(platforms.has("web")).toBe(true);
      expect(platforms.has("tauri")).toBe(true);
    });

    it("qwen-3-1.7b family has variants for mobile + desktop (no web)", () => {
      const variants = ALL_LLM_MODELS.filter(
        (m) => m.modelFamily === "qwen-3-1.7b",
      );
      const platforms = new Set(
        variants.flatMap((v) => v.supportedPlatforms ?? []),
      );
      expect(platforms.has("ios")).toBe(true);
      expect(platforms.has("tauri")).toBe(true);
      expect(platforms.has("web")).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Router integration: verify resolved modelId is what actually loads
// ---------------------------------------------------------------------------

interface FakeWebLLMEngineWithTracking extends WebLLMEngine {
  loadCalls: WebLLMConfig[];
  generateCalls: Array<{
    messages: WebLLMMessage[];
    options?: WebLLMGenerateOptions;
  }>;
}

interface FakeTauriLLMEngineWithTracking extends TauriLLMEngine {
  loadCalls: TauriLLMConfig[];
  generateCalls: Array<{
    messages: TauriLLMMessage[];
    options?: TauriLLMGenerateOptions;
  }>;
}

function createFakeWebLLMEngine(): FakeWebLLMEngineWithTracking {
  let loadedModelId: string | null = null;
  const loadCalls: WebLLMConfig[] = [];
  const generateCalls: Array<{
    messages: WebLLMMessage[];
    options?: WebLLMGenerateOptions;
  }> = [];
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
      return "ok";
    },
    interrupt(): void {},
    async unload(): Promise<void> {
      loadedModelId = null;
    },
    isLoaded(): boolean {
      return loadedModelId !== null;
    },
    getLoadedModelId(): string | null {
      return loadedModelId;
    },
    loadCalls,
    generateCalls,
  };
}

function createFakeTauriLLMEngine(): FakeTauriLLMEngineWithTracking {
  let loadedModelId: string | null = null;
  const loadCalls: TauriLLMConfig[] = [];
  const generateCalls: Array<{
    messages: TauriLLMMessage[];
    options?: TauriLLMGenerateOptions;
  }> = [];
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
      return "ok";
    },
    async interrupt(): Promise<void> {},
    async unload(): Promise<void> {
      loadedModelId = null;
    },
    isLoaded(): boolean {
      return loadedModelId !== null;
    },
    getLoadedModelId(): string | null {
      return loadedModelId;
    },
    loadCalls,
    generateCalls,
  };
}

function buildDeps(): LLMRouterDependencies & {
  webEngine: FakeWebLLMEngineWithTracking;
  tauriEngine: FakeTauriLLMEngineWithTracking;
} {
  const webEngine = createFakeWebLLMEngine();
  const tauriEngine = createFakeTauriLLMEngine();
  return {
    webEngine,
    tauriEngine,
    createWebLLMEngine: () => webEngine,
    createTauriLLMEngine: () => tauriEngine,
    ensureDesktopModelPresent: async (config: LlmModelConfig) =>
      `/tmp/${config.pteFileName}`,
    isWebPlatform: () => true,
    isTauriPlatform: () => true,
  };
}

const sampleMessages: Message[] = [{ role: "user", content: "hi" }];

describe("Integration: resolvePersonaModel -> llmRouter end-to-end", () => {
  it("web engine loads the web sibling modelId that persona resolution selected", async () => {
    // Persona was created on mobile, user is now on web.
    const persona: PersonaModelRef = { modelId: "llama-3.2-3b-instruct" };
    const resolvedId = resolvePersonaModel(persona, ALL_LLM_MODELS, "web");
    expect(resolvedId).toBe("web-llama-3.2-3b");

    // Simulate the app flow: caller takes resolvedId and hands it to the router.
    const deps = buildDeps();
    const router = createLLMRouter(deps);
    await router.sendWebLLMMessage(resolvedId as string, sampleMessages);

    // Router forwards the EXACT resolvedId to the engine (no remapping).
    expect(deps.webEngine.loadCalls).toHaveLength(1);
    expect(deps.webEngine.loadCalls[0].modelId).toBe("web-llama-3.2-3b");
    // And critically, NOT the original mobile modelId.
    expect(deps.webEngine.loadCalls[0].modelId).not.toBe(
      "llama-3.2-3b-instruct",
    );
  });

  it("tauri engine loads the desktop sibling config that persona resolution selected", async () => {
    // Persona was created on mobile, user is now on tauri desktop.
    const persona: PersonaModelRef = { modelId: "llama-3.2-3b-instruct" };
    const resolvedId = resolvePersonaModel(persona, ALL_LLM_MODELS, "tauri");
    expect(resolvedId).toBe("desktop-llama-3.2-3b");

    // Caller looks up the full config by the resolved id.
    const resolvedConfig = getModelById(resolvedId as string);
    expect(resolvedConfig).toBeDefined();

    const deps = buildDeps();
    const router = createLLMRouter(deps);
    await router.sendTauriLLMMessage(
      resolvedConfig as LlmModelConfig,
      sampleMessages,
    );

    // Router forwards the EXACT resolved config's modelId to the engine.
    expect(deps.tauriEngine.loadCalls).toHaveLength(1);
    expect(deps.tauriEngine.loadCalls[0].modelId).toBe("desktop-llama-3.2-3b");
    expect(deps.tauriEngine.loadCalls[0].modelId).not.toBe(
      "llama-3.2-3b-instruct",
    );
  });

  it("web engine loads a web-native persona modelId unchanged (no fallback needed)", async () => {
    const persona: PersonaModelRef = { modelId: "web-llama-3.2-3b" };
    const resolvedId = resolvePersonaModel(persona, ALL_LLM_MODELS, "web");
    expect(resolvedId).toBe("web-llama-3.2-3b");

    const deps = buildDeps();
    const router = createLLMRouter(deps);
    await router.sendWebLLMMessage(resolvedId as string, sampleMessages);

    expect(deps.webEngine.loadCalls[0].modelId).toBe("web-llama-3.2-3b");
  });

  it("persona whose family has no web sibling is rejected before hitting router", () => {
    const persona: PersonaModelRef = { modelId: "qwen-3-1.7b" };
    const resolvedId = resolvePersonaModel(persona, ALL_LLM_MODELS, "web");
    expect(resolvedId).toBeNull();
    // Caller would short-circuit here — never calling the router.
    // This is the contract: UI filters unavailable personas, router never sees them.
  });

  it("resolution info + router together produce a consistent outcome for a fallback persona", async () => {
    const persona: PersonaModelRef = { modelId: "llama-3.2-3b-instruct" };
    const info = getPersonaResolutionInfo(persona, ALL_LLM_MODELS, "tauri");

    expect(info.available).toBe(true);
    expect(info.usingFallback).toBe(true);
    expect(info.resolvedModelId).toBe("desktop-llama-3.2-3b");

    // Use the info to drive the router.
    const config = getModelById(info.resolvedModelId as string);
    expect(config).toBeDefined();

    const deps = buildDeps();
    const router = createLLMRouter(deps);
    await router.sendTauriLLMMessage(config as LlmModelConfig, sampleMessages);

    expect(deps.tauriEngine.loadCalls[0].modelId).toBe(info.resolvedModelId);
  });
});
