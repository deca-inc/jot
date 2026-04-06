import {
  isBuiltInModelId,
  isRemoteModelId,
  isCustomLocalModelId,
  isPlatformModelId,
  isWebLLMModelId,
  isDesktopLLMModelId,
  isLocalModel,
  requiresNetworkForInference,
  getModelCategory,
  generateCustomLocalModelId,
  generateRemoteModelId,
  validateModelId,
  type ModelCategory,
} from "./modelTypeGuards";

describe("modelTypeGuards", () => {
  describe("isBuiltInModelId", () => {
    it("returns true for built-in LLM model IDs", () => {
      expect(isBuiltInModelId("qwen-3-1.7b")).toBe(true);
      expect(isBuiltInModelId("llama-3.2-1b-instruct")).toBe(true);
      expect(isBuiltInModelId("smollm2-135m")).toBe(true);
    });

    it("returns true for platform model IDs", () => {
      expect(isBuiltInModelId("gemini-nano")).toBe(true);
      expect(isBuiltInModelId("apple-foundation")).toBe(true);
    });

    it("returns false for custom model IDs", () => {
      expect(isBuiltInModelId("custom-my-model")).toBe(false);
      expect(isBuiltInModelId("remote-openai-gpt-4")).toBe(false);
    });
  });

  describe("isRemoteModelId", () => {
    it("returns true for remote model IDs", () => {
      expect(isRemoteModelId("remote-openai-gpt-4")).toBe(true);
      expect(isRemoteModelId("remote-anthropic-claude-3")).toBe(true);
      expect(isRemoteModelId("remote-groq-llama")).toBe(true);
      expect(isRemoteModelId("remote-custom-server")).toBe(true);
    });

    it("returns false for non-remote model IDs", () => {
      expect(isRemoteModelId("qwen-3-1.7b")).toBe(false);
      expect(isRemoteModelId("custom-my-model")).toBe(false);
      expect(isRemoteModelId("gemini-nano")).toBe(false);
    });
  });

  describe("isCustomLocalModelId", () => {
    it("returns true for custom local model IDs", () => {
      expect(isCustomLocalModelId("custom-mistral-7b")).toBe(true);
      expect(isCustomLocalModelId("custom-my-model")).toBe(true);
    });

    it("returns false for non-custom model IDs", () => {
      expect(isCustomLocalModelId("qwen-3-1.7b")).toBe(false);
      expect(isCustomLocalModelId("remote-openai-gpt-4")).toBe(false);
      expect(isCustomLocalModelId("gemini-nano")).toBe(false);
    });
  });

  describe("isPlatformModelId", () => {
    it("returns true for platform model IDs", () => {
      expect(isPlatformModelId("gemini-nano")).toBe(true);
      expect(isPlatformModelId("apple-foundation")).toBe(true);
      expect(isPlatformModelId("android-speech")).toBe(true);
      expect(isPlatformModelId("apple-speech")).toBe(true);
    });

    it("returns false for non-platform model IDs", () => {
      expect(isPlatformModelId("qwen-3-1.7b")).toBe(false);
      expect(isPlatformModelId("remote-openai-gpt-4")).toBe(false);
      expect(isPlatformModelId("custom-my-model")).toBe(false);
    });
  });

  describe("isWebLLMModelId", () => {
    it("returns true for web-llm model IDs", () => {
      expect(isWebLLMModelId("web-qwen-2.5-1.5b")).toBe(true);
      expect(isWebLLMModelId("web-llama-3.2-3b")).toBe(true);
    });

    it("returns false for non-web model IDs", () => {
      expect(isWebLLMModelId("qwen-3-1.7b")).toBe(false);
      expect(isWebLLMModelId("desktop-llama-3.2-3b")).toBe(false);
      expect(isWebLLMModelId("remote-openai-gpt-4")).toBe(false);
    });
  });

  describe("isDesktopLLMModelId", () => {
    it("returns true for desktop-llm model IDs", () => {
      expect(isDesktopLLMModelId("desktop-llama-3.2-3b")).toBe(true);
      expect(isDesktopLLMModelId("desktop-qwen-2.5-1.5b")).toBe(true);
    });

    it("returns false for non-desktop model IDs", () => {
      expect(isDesktopLLMModelId("qwen-3-1.7b")).toBe(false);
      expect(isDesktopLLMModelId("web-qwen-2.5-1.5b")).toBe(false);
      expect(isDesktopLLMModelId("remote-openai-gpt-4")).toBe(false);
    });
  });

  describe("isLocalModel (web/desktop additions)", () => {
    it("returns true for web-llm models", () => {
      expect(isLocalModel("web-qwen-2.5-1.5b")).toBe(true);
    });

    it("returns true for desktop-llm models", () => {
      expect(isLocalModel("desktop-llama-3.2-3b")).toBe(true);
    });
  });

  describe("requiresNetworkForInference (web/desktop additions)", () => {
    it("returns false for web-llm models (local inference)", () => {
      expect(requiresNetworkForInference("web-qwen-2.5-1.5b")).toBe(false);
    });

    it("returns false for desktop-llm models (local inference)", () => {
      expect(requiresNetworkForInference("desktop-llama-3.2-3b")).toBe(false);
    });
  });

  describe("getModelCategory", () => {
    it("returns 'built-in' for built-in LLM models", () => {
      expect(getModelCategory("qwen-3-1.7b")).toBe("built-in" as ModelCategory);
      expect(getModelCategory("llama-3.2-1b-instruct")).toBe(
        "built-in" as ModelCategory,
      );
    });

    it("returns 'platform' for platform models", () => {
      expect(getModelCategory("gemini-nano")).toBe("platform" as ModelCategory);
      expect(getModelCategory("apple-foundation")).toBe(
        "platform" as ModelCategory,
      );
    });

    it("returns 'remote' for remote API models", () => {
      expect(getModelCategory("remote-openai-gpt-4")).toBe(
        "remote" as ModelCategory,
      );
      expect(getModelCategory("remote-anthropic-claude")).toBe(
        "remote" as ModelCategory,
      );
    });

    it("returns 'custom-local' for custom local models", () => {
      expect(getModelCategory("custom-my-model")).toBe(
        "custom-local" as ModelCategory,
      );
    });

    it("returns 'web-llm' for web-llm models", () => {
      expect(getModelCategory("web-qwen-2.5-1.5b")).toBe(
        "web-llm" as ModelCategory,
      );
    });

    it("returns 'desktop-llm' for desktop-llm models", () => {
      expect(getModelCategory("desktop-llama-3.2-3b")).toBe(
        "desktop-llm" as ModelCategory,
      );
    });

    it("returns 'unknown' for unrecognized model IDs", () => {
      expect(getModelCategory("")).toBe("unknown" as ModelCategory);
      expect(getModelCategory("random-string")).toBe(
        "unknown" as ModelCategory,
      );
    });
  });

  describe("generateCustomLocalModelId", () => {
    it("generates valid custom model IDs", () => {
      expect(generateCustomLocalModelId("my-model")).toBe("custom-my-model");
      expect(generateCustomLocalModelId("Mistral-7B")).toBe(
        "custom-mistral-7b",
      );
    });

    it("sanitizes special characters", () => {
      expect(generateCustomLocalModelId("my model")).toBe("custom-my-model");
      expect(generateCustomLocalModelId("my_model")).toBe("custom-my-model");
      expect(generateCustomLocalModelId("my.model")).toBe("custom-my-model");
    });

    it("handles multiple consecutive special characters", () => {
      expect(generateCustomLocalModelId("my--model")).toBe("custom-my-model");
      expect(generateCustomLocalModelId("my___model")).toBe("custom-my-model");
    });
  });

  describe("generateRemoteModelId", () => {
    it("generates valid remote model IDs", () => {
      expect(generateRemoteModelId("openai", "gpt-4")).toBe(
        "remote-openai-gpt-4",
      );
      expect(generateRemoteModelId("anthropic", "claude-3")).toBe(
        "remote-anthropic-claude-3",
      );
    });

    it("sanitizes provider and model names", () => {
      expect(generateRemoteModelId("Open AI", "GPT-4 Turbo")).toBe(
        "remote-open-ai-gpt-4-turbo",
      );
    });
  });

  describe("validateModelId", () => {
    it("returns valid result for known model IDs", () => {
      const result = validateModelId("qwen-3-1.7b");
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.category).toBe("built-in");
      }
    });

    it("returns valid result for remote model IDs", () => {
      const result = validateModelId("remote-openai-gpt-4");
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.category).toBe("remote");
      }
    });

    it("returns invalid result for unknown model IDs", () => {
      const result = validateModelId("random-string");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain("Unknown model ID");
      }
    });

    it("returns invalid result for non-string inputs", () => {
      const result = validateModelId(123);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain("non-empty string");
      }
    });

    it("returns invalid result for empty string", () => {
      const result = validateModelId("");
      expect(result.valid).toBe(false);
    });
  });
});
