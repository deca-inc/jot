import { useDatabase } from "./DatabaseProvider";
import { SQLiteDatabase } from "expo-sqlite";

export interface ModelDownloadInfo {
  modelId: string;
  downloadedAt: number;
  ptePath: string;
  tokenizerPath?: string;
  tokenizerConfigPath?: string;
  size: number; // Size in bytes
}

export interface ModelSettings {
  selectedModelId: string;
  downloadedModels: ModelDownloadInfo[];
}

const SETTINGS_KEY = "model_settings";

export class ModelSettingsRepository {
  constructor(private db: SQLiteDatabase) {}

  async get(): Promise<ModelSettings | null> {
    const result = await this.db.getFirstAsync<{
      value: string;
    }>(`SELECT value FROM settings WHERE key = ?`, [SETTINGS_KEY]);

    if (!result) {
      return null;
    }

    try {
      return JSON.parse(result.value) as ModelSettings;
    } catch {
      return null;
    }
  }

  async set(settings: ModelSettings): Promise<void> {
    const now = Date.now();
    await this.db.runAsync(
      `INSERT OR REPLACE INTO settings (key, value, updatedAt) VALUES (?, ?, ?)`,
      [SETTINGS_KEY, JSON.stringify(settings), now]
    );
  }

  async getSelectedModelId(): Promise<string | null> {
    const settings = await this.get();
    return settings?.selectedModelId ?? null;
  }

  async setSelectedModelId(modelId: string): Promise<void> {
    const settings = (await this.get()) || {
      selectedModelId: modelId,
      downloadedModels: [],
    };
    settings.selectedModelId = modelId;
    await this.set(settings);
  }

  async addDownloadedModel(info: ModelDownloadInfo): Promise<void> {
    const settings = (await this.get()) || {
      selectedModelId: info.modelId, // Default to this model if first one
      downloadedModels: [],
    };

    // Remove existing entry for this model if present
    settings.downloadedModels = settings.downloadedModels.filter(
      (m) => m.modelId !== info.modelId
    );

    // Add new entry
    settings.downloadedModels.push(info);

    await this.set(settings);
  }

  async removeDownloadedModel(modelId: string): Promise<void> {
    const settings = await this.get();
    if (!settings) return;

    settings.downloadedModels = settings.downloadedModels.filter(
      (m) => m.modelId !== modelId
    );

    // If we removed the selected model, switch to another one or default to bundled model
    if (settings.selectedModelId === modelId) {
      settings.selectedModelId =
        settings.downloadedModels[0]?.modelId ?? "qwen-3-0.6b"; // Default bundled model
    }

    await this.set(settings);
  }

  async getDownloadedModels(): Promise<ModelDownloadInfo[]> {
    const settings = await this.get();
    return settings?.downloadedModels ?? [];
  }

  async isModelDownloaded(modelId: string): Promise<boolean> {
    const models = await this.getDownloadedModels();
    return models.some((m) => m.modelId === modelId);
  }

  async getModelDownloadInfo(
    modelId: string
  ): Promise<ModelDownloadInfo | null> {
    const models = await this.getDownloadedModels();
    return models.find((m) => m.modelId === modelId) ?? null;
  }
}

export function useModelSettings(): {
  getSettings: () => Promise<ModelSettings | null>;
  setSettings: (settings: ModelSettings) => Promise<void>;
  getSelectedModelId: () => Promise<string | null>;
  setSelectedModelId: (modelId: string) => Promise<void>;
  addDownloadedModel: (info: ModelDownloadInfo) => Promise<void>;
  removeDownloadedModel: (modelId: string) => Promise<void>;
  getDownloadedModels: () => Promise<ModelDownloadInfo[]>;
  isModelDownloaded: (modelId: string) => Promise<boolean>;
  getModelDownloadInfo: (modelId: string) => Promise<ModelDownloadInfo | null>;
} {
  const db = useDatabase();
  const repo = new ModelSettingsRepository(db);

  return {
    getSettings: () => repo.get(),
    setSettings: (settings: ModelSettings) => repo.set(settings),
    getSelectedModelId: () => repo.getSelectedModelId(),
    setSelectedModelId: (modelId: string) => repo.setSelectedModelId(modelId),
    addDownloadedModel: (info: ModelDownloadInfo) =>
      repo.addDownloadedModel(info),
    removeDownloadedModel: (modelId: string) =>
      repo.removeDownloadedModel(modelId),
    getDownloadedModels: () => repo.getDownloadedModels(),
    isModelDownloaded: (modelId: string) => repo.isModelDownloaded(modelId),
    getModelDownloadInfo: (modelId: string) => repo.getModelDownloadInfo(modelId),
  };
}

