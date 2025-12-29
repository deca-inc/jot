import { SQLiteDatabase } from "expo-sqlite";
import { useDatabase } from "./DatabaseProvider";

export type ComposerMode = "journal" | "ai";

export interface ComposerSettings {
  lastUsedMode: ComposerMode;
}

const SETTINGS_KEY = "composer_settings";

export class ComposerSettingsRepository {
  constructor(private db: SQLiteDatabase) {}

  async get(): Promise<ComposerSettings> {
    const result = await this.db.getFirstAsync<{
      value: string;
    }>(`SELECT value FROM settings WHERE key = ?`, [SETTINGS_KEY]);

    if (!result) {
      return { lastUsedMode: "journal" };
    }

    try {
      return JSON.parse(result.value) as ComposerSettings;
    } catch {
      return { lastUsedMode: "journal" };
    }
  }

  async set(settings: ComposerSettings): Promise<void> {
    const now = Date.now();
    await this.db.runAsync(
      `INSERT OR REPLACE INTO settings (key, value, updatedAt) VALUES (?, ?, ?)`,
      [SETTINGS_KEY, JSON.stringify(settings), now],
    );
  }

  async getLastUsedMode(): Promise<ComposerMode> {
    const settings = await this.get();
    return settings.lastUsedMode;
  }

  async setLastUsedMode(mode: ComposerMode): Promise<void> {
    const settings = await this.get();
    settings.lastUsedMode = mode;
    await this.set(settings);
  }
}

export function useComposerSettings(): {
  getSettings: () => Promise<ComposerSettings>;
  setSettings: (settings: ComposerSettings) => Promise<void>;
  getLastUsedMode: () => Promise<ComposerMode>;
  setLastUsedMode: (mode: ComposerMode) => Promise<void>;
} {
  const db = useDatabase();
  const repo = new ComposerSettingsRepository(db);

  return {
    getSettings: () => repo.get(),
    setSettings: (settings: ComposerSettings) => repo.set(settings),
    getLastUsedMode: () => repo.getLastUsedMode(),
    setLastUsedMode: (mode: ComposerMode) => repo.setLastUsedMode(mode),
  };
}

