/**
 * Tests for personaAvailability helpers.
 */

import {
  getAvailablePersonas,
  getPersonaResolutionInfo,
  isPersonaAvailableOnPlatform,
  resolvePersonaModel,
  type PersonaModelRef,
} from "./personaAvailability";
import type { AppPlatform, LlmModelConfig } from "./modelConfig";

// Helper to build a model config with just the fields we care about.
function buildModel(
  modelId: string,
  supportedPlatforms?: AppPlatform[],
  modelFamily?: string,
  displayName?: string,
): LlmModelConfig {
  return {
    modelId,
    modelType: "llm",
    displayName: displayName ?? modelId,
    description: "",
    size: "",
    folderName: modelId,
    available: true,
    pteFileName: "",
    pteSource: { kind: "unavailable", reason: "test" },
    tokenizerSource: { kind: "unavailable", reason: "test" },
    tokenizerConfigSource: { kind: "unavailable", reason: "test" },
    ...(supportedPlatforms ? { supportedPlatforms } : {}),
    ...(modelFamily ? { modelFamily } : {}),
  };
}

describe("personaAvailability", () => {
  describe("isPersonaAvailableOnPlatform", () => {
    it("returns true when persona's modelId matches a model that supports the platform", () => {
      const models = [buildModel("web-qwen", ["web"])];
      const persona: PersonaModelRef = { modelId: "web-qwen" };
      expect(isPersonaAvailableOnPlatform(persona, models, "web")).toBe(true);
    });

    it("returns false when persona's modelId is not in allModels (model was deleted)", () => {
      const models = [buildModel("qwen-3-1.7b", ["ios", "android"])];
      const persona: PersonaModelRef = { modelId: "web-qwen" };
      expect(isPersonaAvailableOnPlatform(persona, models, "web")).toBe(false);
    });

    it("returns false when persona's modelId exists but doesn't support the platform", () => {
      const models = [buildModel("qwen-3-1.7b", ["ios", "android"])];
      const persona: PersonaModelRef = { modelId: "qwen-3-1.7b" };
      expect(isPersonaAvailableOnPlatform(persona, models, "web")).toBe(false);
    });

    it("returns true for remote models on any platform (they are API calls)", () => {
      const persona: PersonaModelRef = { modelId: "remote-openai-gpt-4" };
      expect(isPersonaAvailableOnPlatform(persona, [], "ios")).toBe(true);
      expect(isPersonaAvailableOnPlatform(persona, [], "android")).toBe(true);
      expect(isPersonaAvailableOnPlatform(persona, [], "web")).toBe(true);
      expect(isPersonaAvailableOnPlatform(persona, [], "tauri")).toBe(true);
      expect(isPersonaAvailableOnPlatform(persona, [], "macos")).toBe(true);
    });

    it("returns true for custom-local models on mobile (user-uploaded .pte)", () => {
      const persona: PersonaModelRef = { modelId: "custom-mistral-7b" };
      expect(isPersonaAvailableOnPlatform(persona, [], "ios")).toBe(true);
      expect(isPersonaAvailableOnPlatform(persona, [], "android")).toBe(true);
    });

    it("returns false for custom-local models on non-mobile platforms", () => {
      const persona: PersonaModelRef = { modelId: "custom-mistral-7b" };
      expect(isPersonaAvailableOnPlatform(persona, [], "web")).toBe(false);
      expect(isPersonaAvailableOnPlatform(persona, [], "tauri")).toBe(false);
      expect(isPersonaAvailableOnPlatform(persona, [], "macos")).toBe(false);
    });

    it("returns true for apple-foundation on ios and macos", () => {
      const persona: PersonaModelRef = { modelId: "apple-foundation" };
      expect(isPersonaAvailableOnPlatform(persona, [], "ios")).toBe(true);
      expect(isPersonaAvailableOnPlatform(persona, [], "macos")).toBe(true);
    });

    it("returns false for apple-foundation on non-apple platforms", () => {
      const persona: PersonaModelRef = { modelId: "apple-foundation" };
      expect(isPersonaAvailableOnPlatform(persona, [], "android")).toBe(false);
      expect(isPersonaAvailableOnPlatform(persona, [], "web")).toBe(false);
      expect(isPersonaAvailableOnPlatform(persona, [], "tauri")).toBe(false);
    });

    it("returns true for gemini-nano on android only", () => {
      const persona: PersonaModelRef = { modelId: "gemini-nano" };
      expect(isPersonaAvailableOnPlatform(persona, [], "android")).toBe(true);
      expect(isPersonaAvailableOnPlatform(persona, [], "ios")).toBe(false);
      expect(isPersonaAvailableOnPlatform(persona, [], "macos")).toBe(false);
      expect(isPersonaAvailableOnPlatform(persona, [], "web")).toBe(false);
      expect(isPersonaAvailableOnPlatform(persona, [], "tauri")).toBe(false);
    });

    it("treats legacy built-in models without supportedPlatforms as mobile-only", () => {
      const models = [buildModel("qwen-3-1.7b")]; // no supportedPlatforms
      const persona: PersonaModelRef = { modelId: "qwen-3-1.7b" };
      expect(isPersonaAvailableOnPlatform(persona, models, "ios")).toBe(true);
      expect(isPersonaAvailableOnPlatform(persona, models, "android")).toBe(
        true,
      );
      expect(isPersonaAvailableOnPlatform(persona, models, "web")).toBe(false);
      expect(isPersonaAvailableOnPlatform(persona, models, "tauri")).toBe(
        false,
      );
      expect(isPersonaAvailableOnPlatform(persona, models, "macos")).toBe(
        false,
      );
    });

    it("returns false for a web-llm model id not present in allModels", () => {
      const persona: PersonaModelRef = { modelId: "web-qwen-2.5-1.5b" };
      expect(isPersonaAvailableOnPlatform(persona, [], "web")).toBe(false);
    });

    it("returns true for a desktop-llm model present and supporting tauri", () => {
      const models = [buildModel("desktop-llama-3.2-3b", ["tauri", "macos"])];
      const persona: PersonaModelRef = { modelId: "desktop-llama-3.2-3b" };
      expect(isPersonaAvailableOnPlatform(persona, models, "tauri")).toBe(true);
      expect(isPersonaAvailableOnPlatform(persona, models, "macos")).toBe(true);
      expect(isPersonaAvailableOnPlatform(persona, models, "ios")).toBe(false);
    });
  });

  describe("getAvailablePersonas", () => {
    const models: LlmModelConfig[] = [
      buildModel("qwen-3-1.7b", ["ios", "android"]),
      buildModel("web-qwen", ["web"]),
      buildModel("desktop-llama", ["tauri", "macos"]),
    ];

    it("filters an array of personas to those with available models", () => {
      const personas = [
        { id: 1, modelId: "qwen-3-1.7b" },
        { id: 2, modelId: "web-qwen" },
        { id: 3, modelId: "desktop-llama" },
      ];
      const result = getAvailablePersonas(personas, models, "web");
      expect(result).toEqual([{ id: 2, modelId: "web-qwen" }]);
    });

    it("preserves the original order", () => {
      const personas = [
        { id: 1, modelId: "web-qwen" },
        { id: 2, modelId: "qwen-3-1.7b" },
        { id: 3, modelId: "web-qwen" },
        { id: 4, modelId: "qwen-3-1.7b" },
      ];
      const result = getAvailablePersonas(personas, models, "ios");
      expect(result.map((p) => p.id)).toEqual([2, 4]);
    });

    it("returns empty array if no personas are available", () => {
      const personas = [
        { id: 1, modelId: "qwen-3-1.7b" },
        { id: 2, modelId: "desktop-llama" },
      ];
      const result = getAvailablePersonas(personas, models, "web");
      expect(result).toEqual([]);
    });

    it("returns empty array for empty input", () => {
      expect(getAvailablePersonas([], models, "ios")).toEqual([]);
    });

    it("includes remote personas on every platform", () => {
      const personas = [
        { id: 1, modelId: "remote-openai-gpt-4" },
        { id: 2, modelId: "qwen-3-1.7b" },
      ];
      expect(getAvailablePersonas(personas, models, "web")).toEqual([
        { id: 1, modelId: "remote-openai-gpt-4" },
      ]);
      expect(getAvailablePersonas(personas, models, "ios")).toEqual(personas);
    });
  });

  describe("isPersonaAvailableOnPlatform (with family fallback)", () => {
    it("returns true if exact modelId is available", () => {
      const models = [
        buildModel("llama-3.2-3b-instruct", ["ios", "android"], "llama-3.2-3b"),
      ];
      const persona: PersonaModelRef = { modelId: "llama-3.2-3b-instruct" };
      expect(isPersonaAvailableOnPlatform(persona, models, "ios")).toBe(true);
    });

    it("returns true if modelId unavailable but same-family sibling exists on platform", () => {
      const models = [
        // Mobile .pte version (unavailable on web)
        buildModel("llama-3.2-3b-instruct", ["ios", "android"], "llama-3.2-3b"),
        // Web sibling with same family
        buildModel("web-llama-3.2-3b", ["web"], "llama-3.2-3b"),
      ];
      const persona: PersonaModelRef = { modelId: "llama-3.2-3b-instruct" };
      expect(isPersonaAvailableOnPlatform(persona, models, "web")).toBe(true);
    });

    it("returns false if modelId unavailable and no sibling in family", () => {
      const models = [
        buildModel("smollm2-135m", ["ios", "android"], "smollm2-135m"),
      ];
      const persona: PersonaModelRef = { modelId: "smollm2-135m" };
      expect(isPersonaAvailableOnPlatform(persona, models, "web")).toBe(false);
    });

    it("returns false if modelFamily is missing on the persona's model", () => {
      // Legacy: model without modelFamily - strict match only
      const models = [
        // Original model has no family
        buildModel("qwen-3-1.7b", ["ios", "android"]),
        // A web model with no family either - can't be linked
        buildModel("web-qwen", ["web"]),
      ];
      const persona: PersonaModelRef = { modelId: "qwen-3-1.7b" };
      expect(isPersonaAvailableOnPlatform(persona, models, "web")).toBe(false);
    });

    it("handles remote models unchanged", () => {
      const persona: PersonaModelRef = { modelId: "remote-openai-gpt-4" };
      expect(isPersonaAvailableOnPlatform(persona, [], "web")).toBe(true);
      expect(isPersonaAvailableOnPlatform(persona, [], "ios")).toBe(true);
    });

    it("handles custom-local models unchanged (mobile only)", () => {
      const persona: PersonaModelRef = { modelId: "custom-mistral-7b" };
      expect(isPersonaAvailableOnPlatform(persona, [], "ios")).toBe(true);
      expect(isPersonaAvailableOnPlatform(persona, [], "web")).toBe(false);
    });

    it("handles platform models unchanged", () => {
      const appleFoundation: PersonaModelRef = { modelId: "apple-foundation" };
      expect(isPersonaAvailableOnPlatform(appleFoundation, [], "macos")).toBe(
        true,
      );
      expect(isPersonaAvailableOnPlatform(appleFoundation, [], "android")).toBe(
        false,
      );
    });
  });

  describe("resolvePersonaModel", () => {
    it("returns original modelId if available on platform", () => {
      const models = [
        buildModel("llama-3.2-3b-instruct", ["ios", "android"], "llama-3.2-3b"),
      ];
      const persona: PersonaModelRef = { modelId: "llama-3.2-3b-instruct" };
      expect(resolvePersonaModel(persona, models, "ios")).toBe(
        "llama-3.2-3b-instruct",
      );
    });

    it("returns same-family sibling modelId if original unavailable", () => {
      const models = [
        buildModel("llama-3.2-3b-instruct", ["ios", "android"], "llama-3.2-3b"),
        buildModel("web-llama-3.2-3b", ["web"], "llama-3.2-3b"),
      ];
      const persona: PersonaModelRef = { modelId: "llama-3.2-3b-instruct" };
      expect(resolvePersonaModel(persona, models, "web")).toBe(
        "web-llama-3.2-3b",
      );
    });

    it("returns null if no sibling available", () => {
      const models = [
        buildModel("smollm2-135m", ["ios", "android"], "smollm2-135m"),
      ];
      const persona: PersonaModelRef = { modelId: "smollm2-135m" };
      expect(resolvePersonaModel(persona, models, "web")).toBeNull();
    });

    it("returns original modelId for remote models (always available)", () => {
      const persona: PersonaModelRef = { modelId: "remote-openai-gpt-4" };
      expect(resolvePersonaModel(persona, [], "web")).toBe(
        "remote-openai-gpt-4",
      );
      expect(resolvePersonaModel(persona, [], "ios")).toBe(
        "remote-openai-gpt-4",
      );
    });

    it("returns original modelId for custom-local on mobile", () => {
      const persona: PersonaModelRef = { modelId: "custom-mistral-7b" };
      expect(resolvePersonaModel(persona, [], "ios")).toBe("custom-mistral-7b");
      expect(resolvePersonaModel(persona, [], "android")).toBe(
        "custom-mistral-7b",
      );
    });

    it("returns null for custom-local on non-mobile", () => {
      const persona: PersonaModelRef = { modelId: "custom-mistral-7b" };
      expect(resolvePersonaModel(persona, [], "web")).toBeNull();
      expect(resolvePersonaModel(persona, [], "tauri")).toBeNull();
    });

    it("returns null for platform models on wrong OS", () => {
      const appleFoundation: PersonaModelRef = { modelId: "apple-foundation" };
      expect(resolvePersonaModel(appleFoundation, [], "android")).toBeNull();
      expect(resolvePersonaModel(appleFoundation, [], "web")).toBeNull();

      const geminiNano: PersonaModelRef = { modelId: "gemini-nano" };
      expect(resolvePersonaModel(geminiNano, [], "ios")).toBeNull();
      expect(resolvePersonaModel(geminiNano, [], "android")).toBe(
        "gemini-nano",
      );
    });

    it("returns original modelId for platform models on right OS", () => {
      const appleFoundation: PersonaModelRef = { modelId: "apple-foundation" };
      expect(resolvePersonaModel(appleFoundation, [], "ios")).toBe(
        "apple-foundation",
      );
      expect(resolvePersonaModel(appleFoundation, [], "macos")).toBe(
        "apple-foundation",
      );
    });

    it("prefers same-category siblings when multiple siblings exist", () => {
      const models = [
        buildModel("llama-3.2-3b-instruct", ["ios", "android"], "llama-3.2-3b"),
        buildModel("web-llama-3.2-3b", ["web"], "llama-3.2-3b"),
        buildModel("desktop-llama-3.2-3b", ["tauri", "macos"], "llama-3.2-3b"),
      ];
      const persona: PersonaModelRef = { modelId: "llama-3.2-3b-instruct" };
      // On tauri, prefer desktop sibling (not web, even though web would also match platform support)
      expect(resolvePersonaModel(persona, models, "tauri")).toBe(
        "desktop-llama-3.2-3b",
      );
    });

    it("returns null if persona modelFamily field is missing", () => {
      const models = [
        buildModel("qwen-3-1.7b", ["ios", "android"]),
        buildModel("web-qwen", ["web"]),
      ];
      const persona: PersonaModelRef = { modelId: "qwen-3-1.7b" };
      expect(resolvePersonaModel(persona, models, "web")).toBeNull();
    });
  });

  describe("getPersonaResolutionInfo", () => {
    it("returns unavailable info when model cannot be resolved", () => {
      const models = [
        buildModel("smollm2-135m", ["ios", "android"], "smollm2-135m"),
      ];
      const persona: PersonaModelRef = { modelId: "smollm2-135m" };
      const info = getPersonaResolutionInfo(persona, models, "web");
      expect(info).toEqual({
        available: false,
        originalModelId: "smollm2-135m",
        resolvedModelId: null,
        usingFallback: false,
        displayName: null,
      });
    });

    it("returns non-fallback info when exact model is available", () => {
      const models = [
        buildModel(
          "llama-3.2-3b-instruct",
          ["ios", "android"],
          "llama-3.2-3b",
          "Llama 3.2 3B",
        ),
      ];
      const persona: PersonaModelRef = { modelId: "llama-3.2-3b-instruct" };
      const info = getPersonaResolutionInfo(persona, models, "ios");
      expect(info).toEqual({
        available: true,
        originalModelId: "llama-3.2-3b-instruct",
        resolvedModelId: "llama-3.2-3b-instruct",
        usingFallback: false,
        displayName: "Llama 3.2 3B",
      });
    });

    it("returns fallback info when same-family sibling is used", () => {
      const models = [
        buildModel(
          "llama-3.2-3b-instruct",
          ["ios", "android"],
          "llama-3.2-3b",
          "Llama 3.2 3B",
        ),
        buildModel(
          "web-llama-3.2-3b",
          ["web"],
          "llama-3.2-3b",
          "Llama 3.2 3B (Web)",
        ),
      ];
      const persona: PersonaModelRef = { modelId: "llama-3.2-3b-instruct" };
      const info = getPersonaResolutionInfo(persona, models, "web");
      expect(info).toEqual({
        available: true,
        originalModelId: "llama-3.2-3b-instruct",
        resolvedModelId: "web-llama-3.2-3b",
        usingFallback: true,
        displayName: "Llama 3.2 3B (Web)",
      });
    });

    it("reports no displayName for remote models not in allModels", () => {
      const persona: PersonaModelRef = { modelId: "remote-openai-gpt-4" };
      const info = getPersonaResolutionInfo(persona, [], "ios");
      expect(info.available).toBe(true);
      expect(info.usingFallback).toBe(false);
      expect(info.resolvedModelId).toBe("remote-openai-gpt-4");
      expect(info.displayName).toBeNull();
    });
  });
});
