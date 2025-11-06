/**
 * ModelService - Pure service class for AI model operations
 *
 * This service handles model loading, generation, and token streaming
 * without React dependencies. It can be used from React components or
 * anywhere else in the app.
 */

import { Message as LlmMessage } from "react-native-executorch";
import { ensureModelPresent, EnsureResult } from "./modelManager";
import { LlmModelConfig } from "./modelConfig";

export interface ModelServiceConfig {
  ptePath: string;
  tokenizerPath?: string;
  tokenizerConfigPath?: string;
}

export interface GenerationOptions {
  /** Callback called with each new token as it's generated */
  onToken?: (token: string, fullText: string) => void;
  /** Callback called when generation starts */
  onStart?: () => void;
  /** Callback called when generation completes */
  onComplete?: (fullText: string) => void;
  /** Callback called on error */
  onError?: (error: Error) => void;
}

/**
 * ModelService manages the AI model lifecycle and generation.
 *
 * This is a pure service class - no React dependencies.
 * Use it from React components via the ModelProvider wrapper.
 */
export class ModelService {
  private config: LlmModelConfig;
  private modelPaths: EnsureResult | null = null;
  private loadError: string | null = null;
  private isModelLoading = false;
  private isReady = false;

  // We'll need to inject the LLM hook instance from React
  // This is a bridge - the actual useLLM hook will be in ModelProvider
  private llmInstance: any = null;

  constructor(config: LlmModelConfig) {
    this.config = config;
  }

  /**
   * Set the LLM instance (from useLLM hook)
   * This is called by ModelProvider to inject the React hook
   */
  setLLMInstance(llm: any) {
    this.llmInstance = llm;
    this.updateReadyState();
  }

  /**
   * Load model files asynchronously
   */
  async loadModel(): Promise<void> {
    if (this.modelPaths) {
      return; // Already loaded
    }

    this.isModelLoading = true;
    this.loadError = null;

    try {
      const isPlaceholder =
        this.config.pteSource.kind === "remote" &&
        this.config.pteSource.url.includes("YOUR_HOST");

      if (isPlaceholder) {
        throw new Error(
          "AI model URLs are not configured. Please set up model URLs in Settings or configure them in lib/ai/modelConfig.ts"
        );
      }

      console.log("[ModelService] Starting model load...");

      // Set timeout for model download
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error("Model download timed out after 60 seconds"));
        }, 60000);
      });

      const ensured = await Promise.race([
        ensureModelPresent(this.config),
        timeoutPromise,
      ]);

      this.modelPaths = ensured;
      console.log("[ModelService] Model files loaded:", ensured);
    } catch (e: any) {
      console.error("[ModelService] Error loading model:", e);
      this.loadError = e?.message || "Unknown error";
      throw e;
    } finally {
      this.isModelLoading = false;
      this.updateReadyState();
    }
  }

  /**
   * Update ready state based on current conditions
   */
  private updateReadyState() {
    this.isReady =
      !!this.llmInstance?.isReady &&
      !this.loadError &&
      !!this.modelPaths &&
      !this.isModelLoading;
  }

  /**
   * Wait for model to be ready
   */
  private async waitForReady(timeoutMs: number = 30000): Promise<void> {
    let attempts = 0;
    const maxAttempts = timeoutMs / 100;

    while (!this.isReady && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      attempts++;

      if (this.loadError) {
        throw new Error(`Model failed to load: ${this.loadError}`);
      }

      this.updateReadyState();
    }

    if (!this.isReady) {
      throw new Error(
        "Model is not ready yet. Please wait a moment and try again."
      );
    }
  }

  /**
   * Generate a response with token streaming support
   *
   * @param messages - Array of messages for the conversation
   * @param options - Generation options including token streaming callbacks
   * @returns Promise that resolves with the full generated text
   */
  async generate(
    messages: LlmMessage[],
    options: GenerationOptions = {}
  ): Promise<string> {
    const { onToken, onStart, onComplete, onError } = options;

    try {
      // Wait for model to be ready
      await this.waitForReady();

      if (!this.llmInstance) {
        throw new Error("LLM instance not available");
      }

      if (this.llmInstance.error) {
        throw new Error(`LLM error: ${this.llmInstance.error}`);
      }

      onStart?.();

      // Start generation
      await this.llmInstance.generate(messages);

      // Poll for response updates and stream tokens
      let lastResponse = "";
      let attempts = 0;
      const maxAttempts = 200; // 20 seconds max wait

      while (this.llmInstance.isGenerating && attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        attempts++;

        if (this.llmInstance.error) {
          throw new Error(`LLM error: ${this.llmInstance.error}`);
        }

        // Check for new tokens
        const currentResponse = this.llmInstance.response || "";
        if (currentResponse && currentResponse !== lastResponse) {
          // Extract new tokens (simple diff - could be improved)
          const newText = currentResponse.slice(lastResponse.length);
          if (newText && onToken) {
            onToken(newText, currentResponse);
          }
          lastResponse = currentResponse;
        }
      }

      // Wait a bit more for final response
      let finalWaitAttempts = 0;
      const maxFinalWaitAttempts = 10;
      while (
        (!this.llmInstance.response ||
          this.llmInstance.response.trim().length === 0) &&
        finalWaitAttempts < maxFinalWaitAttempts
      ) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        finalWaitAttempts++;

        const currentResponse = this.llmInstance.response || "";
        if (currentResponse && currentResponse !== lastResponse) {
          const newText = currentResponse.slice(lastResponse.length);
          if (newText && onToken) {
            onToken(newText, currentResponse);
          }
          lastResponse = currentResponse;
        }
      }

      if (this.llmInstance.error) {
        throw new Error(`LLM error: ${this.llmInstance.error}`);
      }

      const finalResponse = this.llmInstance.response || "";

      if (!finalResponse || finalResponse.trim().length === 0) {
        throw new Error("Model generated an empty response");
      }

      const trimmedResponse = finalResponse.trim();
      onComplete?.(trimmedResponse);
      return trimmedResponse;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      onError?.(err);
      throw err;
    }
  }

  /**
   * Configure the model
   */
  configure(config: {
    chatConfig?: {
      initialMessageHistory?: LlmMessage[];
      systemPrompt?: string;
    };
    generationConfig?: Record<string, any>;
  }) {
    if (this.llmInstance?.configure && this.isReady) {
      this.llmInstance.configure(config);
    } else {
      console.warn("[ModelService] Cannot configure: model is not ready");
    }
  }

  // Getters for state
  getModelPaths(): EnsureResult | null {
    return this.modelPaths;
  }

  getLoadError(): string | null {
    return this.loadError;
  }

  getIsModelLoading(): boolean {
    return this.isModelLoading;
  }

  getIsReady(): boolean {
    return this.isReady;
  }

  getIsGenerating(): boolean {
    return this.llmInstance?.isGenerating || false;
  }

  getResponse(): string | null {
    return this.llmInstance?.response || null;
  }
}
