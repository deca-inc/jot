/**
 * LLM Service Interface (Stub)
 *
 * This module provides the interface for local LLM inference.
 * Actual implementation will use node-llama-cpp when added.
 */

export interface LLMModel {
  id: string;
  name: string;
  size: number;
  path: string;
  isDownloaded: boolean;
}

export interface GenerationOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stopSequences?: string[];
}

export interface GenerationResult {
  text: string;
  tokensGenerated: number;
  tokensPerSecond: number;
}

export interface LLMService {
  isAvailable(): boolean;
  getLoadedModel(): LLMModel | null;
  loadModel(modelId: string): Promise<void>;
  unloadModel(): Promise<void>;
  generate(prompt: string, options?: GenerationOptions): Promise<GenerationResult>;
  generateStream(
    prompt: string,
    options?: GenerationOptions,
  ): AsyncGenerator<string, GenerationResult, unknown>;
}

/**
 * Stub LLM service that returns "not configured" errors
 */
export class StubLLMService implements LLMService {
  isAvailable(): boolean {
    return false;
  }

  getLoadedModel(): LLMModel | null {
    return null;
  }

  async loadModel(_modelId: string): Promise<void> {
    throw new Error("LLM not configured. Please download a model first.");
  }

  async unloadModel(): Promise<void> {
    // No-op for stub
  }

  async generate(_prompt: string, _options?: GenerationOptions): Promise<GenerationResult> {
    throw new Error("LLM not configured. Please download a model first.");
  }

  // eslint-disable-next-line require-yield -- Stub that always throws
  async *generateStream(
    _prompt: string,
    _options?: GenerationOptions,
  ): AsyncGenerator<string, GenerationResult, unknown> {
    throw new Error("LLM not configured. Please download a model first.");
  }
}

// Singleton instance
let llmService: LLMService = new StubLLMService();

export function getLLMService(): LLMService {
  return llmService;
}

export function setLLMService(service: LLMService): void {
  llmService = service;
}
