import { SQLiteDatabase } from "expo-sqlite";
import { type Season, type TimeOfDay } from "../theme/seasonalTheme";
import { useDatabase } from "./DatabaseProvider";

export interface ThemeSettings {
  mode: "auto" | "manual";
  season?: Season;
  timeOfDay?: TimeOfDay | "system";
  useSystemTimeOfDay?: boolean; // Legacy support
}

const SETTINGS_KEY = "theme_settings";

export class ThemeSettingsRepository {
  constructor(private db: SQLiteDatabase) {}

  async get(): Promise<ThemeSettings> {
    const result = await this.db.getFirstAsync<{
      value: string;
    }>(`SELECT value FROM settings WHERE key = ?`, [SETTINGS_KEY]);

    if (!result) {
      return { mode: "auto" };
    }

    try {
      return JSON.parse(result.value) as ThemeSettings;
    } catch {
      return { mode: "auto" };
    }
  }

  async set(settings: ThemeSettings): Promise<void> {
    const now = Date.now();
    await this.db.runAsync(
      `INSERT OR REPLACE INTO settings (key, value, updatedAt) VALUES (?, ?, ?)`,
      [SETTINGS_KEY, JSON.stringify(settings), now],
    );
  }
}

export function useThemeSettings(): {
  getSettings: () => Promise<ThemeSettings>;
  setSettings: (settings: ThemeSettings) => Promise<void>;
} {
  const db = useDatabase();
  const repo = new ThemeSettingsRepository(db);

  return {
    getSettings: () => repo.get(),
    setSettings: (settings: ThemeSettings) => repo.set(settings),
  };
}
