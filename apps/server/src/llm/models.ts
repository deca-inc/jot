/**
 * Model Management (Stub)
 *
 * This module handles downloading and managing LLM models.
 * Actual implementation will download GGUF files when added.
 */

import * as fs from "fs";
import * as path from "path";

export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  size: string; // e.g., "3.2GB"
  sizeBytes: number;
  url: string;
  category: "fast" | "quality";
}

export interface DownloadedModel extends ModelInfo {
  path: string;
  downloadedAt: number;
}

// Available models for download (stub - these are placeholders)
export const AVAILABLE_MODELS: ModelInfo[] = [
  {
    id: "llama-3.2-3b-instruct",
    name: "Llama 3.2 3B Instruct",
    description: "Fast, lightweight model for general tasks",
    size: "2.0GB",
    sizeBytes: 2 * 1024 * 1024 * 1024,
    url: "https://huggingface.co/lmstudio-community/Llama-3.2-3B-Instruct-GGUF",
    category: "fast",
  },
  {
    id: "llama-3.1-8b-instruct",
    name: "Llama 3.1 8B Instruct",
    description: "Balanced model for quality responses",
    size: "4.7GB",
    sizeBytes: 4.7 * 1024 * 1024 * 1024,
    url: "https://huggingface.co/lmstudio-community/Meta-Llama-3.1-8B-Instruct-GGUF",
    category: "quality",
  },
];

export class ModelManager {
  private modelsDir: string;

  constructor(dataDir: string = "./data") {
    this.modelsDir = path.join(dataDir, "models");
  }

  /**
   * List available models (both downloaded and not downloaded)
   */
  listAvailable(): Array<ModelInfo & { isDownloaded: boolean }> {
    const downloaded = this.listDownloaded();
    const downloadedIds = new Set(downloaded.map((m) => m.id));

    return AVAILABLE_MODELS.map((model) => ({
      ...model,
      isDownloaded: downloadedIds.has(model.id),
    }));
  }

  /**
   * List downloaded models
   */
  listDownloaded(): DownloadedModel[] {
    if (!fs.existsSync(this.modelsDir)) {
      return [];
    }

    const files = fs.readdirSync(this.modelsDir);
    const models: DownloadedModel[] = [];

    for (const file of files) {
      if (!file.endsWith(".gguf")) continue;

      const filePath = path.join(this.modelsDir, file);
      const stats = fs.statSync(filePath);
      const modelId = file.replace(".gguf", "");

      // Find model info
      const modelInfo = AVAILABLE_MODELS.find((m) => m.id === modelId);
      if (!modelInfo) continue;

      models.push({
        ...modelInfo,
        path: filePath,
        downloadedAt: stats.mtimeMs,
      });
    }

    return models;
  }

  /**
   * Get a specific downloaded model
   */
  getModel(modelId: string): DownloadedModel | null {
    const models = this.listDownloaded();
    return models.find((m) => m.id === modelId) || null;
  }

  /**
   * Download a model (stub - just logs for now)
   */
  async download(modelId: string, onProgress?: (progress: number) => void): Promise<void> {
    const model = AVAILABLE_MODELS.find((m) => m.id === modelId);
    if (!model) {
      throw new Error(`Unknown model: ${modelId}`);
    }

    // Ensure models directory exists
    if (!fs.existsSync(this.modelsDir)) {
      fs.mkdirSync(this.modelsDir, { recursive: true });
    }

    // Stub: In real implementation, this would download the model
    console.log(`\nModel download not yet implemented.`);
    console.log(`To download manually:`);
    console.log(`  1. Go to: ${model.url}`);
    console.log(`  2. Download the GGUF file (Q4_K_M recommended)`);
    console.log(`  3. Save to: ${path.join(this.modelsDir, `${modelId}.gguf`)}`);

    // Simulate progress callback
    if (onProgress) {
      onProgress(0);
    }

    throw new Error(
      "Model download not yet implemented. Please download manually.",
    );
  }

  /**
   * Delete a downloaded model
   */
  delete(modelId: string): boolean {
    const model = this.getModel(modelId);
    if (!model) {
      return false;
    }

    fs.unlinkSync(model.path);
    return true;
  }
}

// Singleton instance
let modelManager: ModelManager | null = null;

export function getModelManager(dataDir?: string): ModelManager {
  if (!modelManager) {
    modelManager = new ModelManager(dataDir);
  }
  return modelManager;
}
