/**
 * Tests for modelConfig platform tagging.
 */

import {
  ALL_LLM_MODELS,
  DesktopLlama31_8B,
  DesktopLlama32_1B,
  DesktopLlama32_3B,
  DesktopLlama33_70B,
  DesktopQwen25_1_5B,
  DesktopQwen25_14B,
  DesktopQwen25_32B,
  DesktopQwen25_7B,
  DesktopQwen3_1_7B,
  getModelsByFamily,
  Llama32_1B_Instruct,
  Llama32_3B_Instruct,
  Qwen3_0_6B,
  Qwen3_1_7B,
  Qwen3_4B,
  SmolLM2_135M,
  SmolLM2_1_7B,
  SmolLM2_360M,
  WebLlama32_3B,
  WebQwen25_1_5B,
} from "./modelConfig";

describe("modelConfig platform tags", () => {
  describe("mobile .pte models", () => {
    const mobileModels = [
      SmolLM2_135M,
      SmolLM2_360M,
      SmolLM2_1_7B,
      Llama32_1B_Instruct,
      Llama32_3B_Instruct,
      Qwen3_0_6B,
      Qwen3_1_7B,
      Qwen3_4B,
    ];

    it.each(mobileModels)(
      "$modelId has supportedPlatforms: ['ios', 'android']",
      (model) => {
        expect(model.supportedPlatforms).toEqual(["ios", "android"]);
      },
    );
  });

  describe("web MLC models", () => {
    const webModels = [WebQwen25_1_5B, WebLlama32_3B];

    it.each(webModels)("$modelId has supportedPlatforms: ['web']", (model) => {
      expect(model.supportedPlatforms).toEqual(["web"]);
    });

    it("web models use web-* modelId prefix", () => {
      for (const m of webModels) {
        expect(m.modelId.startsWith("web-")).toBe(true);
      }
    });
  });

  describe("desktop GGUF models", () => {
    const desktopModels = [DesktopQwen25_1_5B, DesktopLlama32_3B];

    it.each(desktopModels)(
      "$modelId has supportedPlatforms: ['tauri', 'macos']",
      (model) => {
        expect(model.supportedPlatforms).toEqual(["tauri", "macos"]);
      },
    );

    it("desktop models use desktop-* modelId prefix", () => {
      for (const m of desktopModels) {
        expect(m.modelId.startsWith("desktop-")).toBe(true);
      }
    });
  });

  describe("ALL_LLM_MODELS registry", () => {
    it("includes all mobile models", () => {
      expect(ALL_LLM_MODELS).toContain(Qwen3_1_7B);
      expect(ALL_LLM_MODELS).toContain(Qwen3_0_6B);
      expect(ALL_LLM_MODELS).toContain(Qwen3_4B);
      expect(ALL_LLM_MODELS).toContain(Llama32_1B_Instruct);
      expect(ALL_LLM_MODELS).toContain(Llama32_3B_Instruct);
      expect(ALL_LLM_MODELS).toContain(SmolLM2_135M);
      expect(ALL_LLM_MODELS).toContain(SmolLM2_360M);
      expect(ALL_LLM_MODELS).toContain(SmolLM2_1_7B);
    });

    it("includes all web models", () => {
      expect(ALL_LLM_MODELS).toContain(WebQwen25_1_5B);
      expect(ALL_LLM_MODELS).toContain(WebLlama32_3B);
    });

    it("includes all desktop models", () => {
      expect(ALL_LLM_MODELS).toContain(DesktopQwen25_1_5B);
      expect(ALL_LLM_MODELS).toContain(DesktopLlama32_3B);
    });

    it("has unique model IDs", () => {
      const ids = ALL_LLM_MODELS.map((m) => m.modelId);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    });
  });

  describe("modelFamily tagging", () => {
    it("every LlmModelConfig has modelFamily set", () => {
      for (const model of ALL_LLM_MODELS) {
        expect(model.modelFamily).toBeDefined();
        expect(typeof model.modelFamily).toBe("string");
        expect(model.modelFamily).not.toBe("");
      }
    });

    describe("mobile model families", () => {
      const expectedFamilies: Array<{
        model: (typeof ALL_LLM_MODELS)[number];
        family: string;
      }> = [
        { model: Qwen3_0_6B, family: "qwen-3-0.6b" },
        { model: Qwen3_1_7B, family: "qwen-3-1.7b" },
        { model: Qwen3_4B, family: "qwen-3-4b" },
        { model: Llama32_1B_Instruct, family: "llama-3.2-1b" },
        { model: Llama32_3B_Instruct, family: "llama-3.2-3b" },
        { model: SmolLM2_135M, family: "smollm2-135m" },
        { model: SmolLM2_360M, family: "smollm2-360m" },
        { model: SmolLM2_1_7B, family: "smollm2-1.7b" },
      ];

      it.each(expectedFamilies)(
        "$model.modelId has modelFamily: $family",
        ({ model, family }) => {
          expect(model.modelFamily).toBe(family);
        },
      );
    });

    describe("web model families", () => {
      const expectedFamilies: Array<{
        model: (typeof ALL_LLM_MODELS)[number];
        family: string;
      }> = [
        { model: WebQwen25_1_5B, family: "qwen-2.5-1.5b" },
        { model: WebLlama32_3B, family: "llama-3.2-3b" },
      ];

      it.each(expectedFamilies)(
        "$model.modelId has modelFamily: $family",
        ({ model, family }) => {
          expect(model.modelFamily).toBe(family);
        },
      );
    });

    describe("desktop model families", () => {
      const expectedFamilies: Array<{
        model: (typeof ALL_LLM_MODELS)[number];
        family: string;
      }> = [
        { model: DesktopQwen25_1_5B, family: "qwen-2.5-1.5b" },
        { model: DesktopLlama32_3B, family: "llama-3.2-3b" },
        { model: DesktopLlama32_1B, family: "llama-3.2-1b" },
        { model: DesktopQwen3_1_7B, family: "qwen-3-1.7b" },
        { model: DesktopLlama31_8B, family: "llama-3.1-8b" },
        { model: DesktopQwen25_7B, family: "qwen-2.5-7b" },
        { model: DesktopQwen25_14B, family: "qwen-2.5-14b" },
        { model: DesktopQwen25_32B, family: "qwen-2.5-32b" },
        { model: DesktopLlama33_70B, family: "llama-3.3-70b" },
      ];

      it.each(expectedFamilies)(
        "$model.modelId has modelFamily: $family",
        ({ model, family }) => {
          expect(model.modelFamily).toBe(family);
        },
      );
    });
  });

  describe("new desktop GGUF models", () => {
    it("desktop-llama-3.2-1b is registered with correct platforms", () => {
      expect(DesktopLlama32_1B.modelId).toBe("desktop-llama-3.2-1b");
      expect(DesktopLlama32_1B.supportedPlatforms).toEqual(["tauri", "macos"]);
      expect(ALL_LLM_MODELS).toContain(DesktopLlama32_1B);
    });

    it("desktop-qwen-3-1.7b is registered with correct platforms", () => {
      expect(DesktopQwen3_1_7B.modelId).toBe("desktop-qwen-3-1.7b");
      expect(DesktopQwen3_1_7B.supportedPlatforms).toEqual(["tauri", "macos"]);
      expect(ALL_LLM_MODELS).toContain(DesktopQwen3_1_7B);
    });

    it("desktop-llama-3.1-8b-instruct is registered with correct platforms", () => {
      expect(DesktopLlama31_8B.modelId).toBe("desktop-llama-3.1-8b-instruct");
      expect(DesktopLlama31_8B.supportedPlatforms).toEqual(["tauri", "macos"]);
      expect(ALL_LLM_MODELS).toContain(DesktopLlama31_8B);
    });

    it("desktop-qwen-2.5-7b-instruct is registered with correct platforms", () => {
      expect(DesktopQwen25_7B.modelId).toBe("desktop-qwen-2.5-7b-instruct");
      expect(DesktopQwen25_7B.supportedPlatforms).toEqual(["tauri", "macos"]);
      expect(ALL_LLM_MODELS).toContain(DesktopQwen25_7B);
    });

    it("desktop-qwen-2.5-14b-instruct is registered with correct platforms", () => {
      expect(DesktopQwen25_14B.modelId).toBe("desktop-qwen-2.5-14b-instruct");
      expect(DesktopQwen25_14B.supportedPlatforms).toEqual(["tauri", "macos"]);
      expect(ALL_LLM_MODELS).toContain(DesktopQwen25_14B);
    });

    it("desktop-qwen-2.5-32b-instruct is registered with correct platforms", () => {
      expect(DesktopQwen25_32B.modelId).toBe("desktop-qwen-2.5-32b-instruct");
      expect(DesktopQwen25_32B.supportedPlatforms).toEqual(["tauri", "macos"]);
      expect(ALL_LLM_MODELS).toContain(DesktopQwen25_32B);
    });

    it("desktop-llama-3.3-70b-instruct is registered with correct platforms", () => {
      expect(DesktopLlama33_70B.modelId).toBe("desktop-llama-3.3-70b-instruct");
      expect(DesktopLlama33_70B.supportedPlatforms).toEqual(["tauri", "macos"]);
      expect(ALL_LLM_MODELS).toContain(DesktopLlama33_70B);
    });
  });

  describe("getModelsByFamily", () => {
    it("returns 3 variants for llama-3.2-3b family (mobile, web, desktop)", () => {
      const variants = getModelsByFamily("llama-3.2-3b");
      expect(variants).toHaveLength(3);
      expect(variants).toContain(Llama32_3B_Instruct);
      expect(variants).toContain(WebLlama32_3B);
      expect(variants).toContain(DesktopLlama32_3B);
    });

    it("returns 2 variants for llama-3.2-1b family (mobile, desktop)", () => {
      const variants = getModelsByFamily("llama-3.2-1b");
      expect(variants).toHaveLength(2);
      expect(variants).toContain(Llama32_1B_Instruct);
      expect(variants).toContain(DesktopLlama32_1B);
    });

    it("returns 2 variants for qwen-3-1.7b family (mobile, desktop)", () => {
      const variants = getModelsByFamily("qwen-3-1.7b");
      expect(variants).toHaveLength(2);
      expect(variants).toContain(Qwen3_1_7B);
      expect(variants).toContain(DesktopQwen3_1_7B);
    });

    it("returns 2 variants for qwen-2.5-1.5b family (web, desktop)", () => {
      const variants = getModelsByFamily("qwen-2.5-1.5b");
      expect(variants).toHaveLength(2);
      expect(variants).toContain(WebQwen25_1_5B);
      expect(variants).toContain(DesktopQwen25_1_5B);
    });

    it("returns empty array for unknown family", () => {
      expect(getModelsByFamily("nonexistent-family")).toEqual([]);
    });

    it("returns single-item array for unique family", () => {
      const variants = getModelsByFamily("smollm2-135m");
      expect(variants).toHaveLength(1);
      expect(variants[0]).toBe(SmolLM2_135M);
    });
  });
});
