import { useDatabase } from "./DatabaseProvider";
import { SQLiteDatabase } from "expo-sqlite";

export interface TelemetrySettings {
  telemetryEnabled: boolean;
  decidedAt?: number;
}

const SETTINGS_KEY = "telemetry_settings";

export class TelemetrySettingsRepository {
  constructor(private db: SQLiteDatabase) {}

  async get(): Promise<TelemetrySettings | null> {
    const result = await this.db.getFirstAsync<{
      value: string;
    }>(`SELECT value FROM settings WHERE key = ?`, [SETTINGS_KEY]);

    if (!result) {
      return null;
    }

    try {
      return JSON.parse(result.value) as TelemetrySettings;
    } catch {
      return null;
    }
  }

  async set(settings: TelemetrySettings): Promise<void> {
    const now = Date.now();
    await this.db.runAsync(
      `INSERT OR REPLACE INTO settings (key, value, updatedAt) VALUES (?, ?, ?)`,
      [SETTINGS_KEY, JSON.stringify(settings), now]
    );
  }

  async isTelemetryEnabled(): Promise<boolean> {
    const settings = await this.get();
    return settings?.telemetryEnabled ?? false;
  }

  async setTelemetryEnabled(enabled: boolean): Promise<void> {
    const settings: TelemetrySettings = {
      telemetryEnabled: enabled,
      decidedAt: Date.now(),
    };
    await this.set(settings);
  }
}

export function useTelemetrySettings(): {
  getSettings: () => Promise<TelemetrySettings | null>;
  setSettings: (settings: TelemetrySettings) => Promise<void>;
  isTelemetryEnabled: () => Promise<boolean>;
  setTelemetryEnabled: (enabled: boolean) => Promise<void>;
} {
  const db = useDatabase();
  const repo = new TelemetrySettingsRepository(db);

  return {
    getSettings: () => repo.get(),
    setSettings: (settings: TelemetrySettings) => repo.set(settings),
    isTelemetryEnabled: () => repo.isTelemetryEnabled(),
    setTelemetryEnabled: (enabled: boolean) => repo.setTelemetryEnabled(enabled),
  };
}

