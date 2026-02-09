/**
 * Sync Settings Repository
 *
 * Stores sync server configuration in SQLite.
 * Sensitive data (tokens) are stored in SecureStore, not here.
 */

import { SQLiteDatabase } from "expo-sqlite";
import { useDatabase } from "./DatabaseProvider";

export interface SyncSettings {
  /** The sync server URL (e.g., "https://sync.example.com") */
  serverUrl: string | null;
  /** The user's email (for display purposes) */
  email: string | null;
  /** The user ID from the server */
  userId: string | null;
  /** Whether sync is enabled */
  enabled: boolean;
  /** Last successful sync timestamp */
  lastSyncAt: number | null;
  /** Last sync error message */
  lastError: string | null;
}

const SETTINGS_KEY = "sync_settings";

const DEFAULT_SETTINGS: SyncSettings = {
  serverUrl: null,
  email: null,
  userId: null,
  enabled: false,
  lastSyncAt: null,
  lastError: null,
};

export class SyncSettingsRepository {
  constructor(private db: SQLiteDatabase) {}

  async get(): Promise<SyncSettings> {
    const result = await this.db.getFirstAsync<{
      value: string;
    }>(`SELECT value FROM settings WHERE key = ?`, [SETTINGS_KEY]);

    if (!result) {
      return DEFAULT_SETTINGS;
    }

    try {
      const parsed = JSON.parse(result.value) as Partial<SyncSettings>;
      return { ...DEFAULT_SETTINGS, ...parsed };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  async set(settings: Partial<SyncSettings>): Promise<void> {
    const current = await this.get();
    const updated = { ...current, ...settings };
    const now = Date.now();

    await this.db.runAsync(
      `INSERT OR REPLACE INTO settings (key, value, updatedAt) VALUES (?, ?, ?)`,
      [SETTINGS_KEY, JSON.stringify(updated), now],
    );
  }

  async getServerUrl(): Promise<string | null> {
    const settings = await this.get();
    return settings.serverUrl;
  }

  async setServerUrl(url: string | null): Promise<void> {
    await this.set({ serverUrl: url });
  }

  async getEmail(): Promise<string | null> {
    const settings = await this.get();
    return settings.email;
  }

  async setUserInfo(email: string, userId: string): Promise<void> {
    await this.set({ email, userId });
  }

  async isEnabled(): Promise<boolean> {
    const settings = await this.get();
    return settings.enabled;
  }

  async setEnabled(enabled: boolean): Promise<void> {
    await this.set({ enabled });
  }

  async recordSyncSuccess(): Promise<void> {
    await this.set({ lastSyncAt: Date.now(), lastError: null });
  }

  async recordSyncError(error: string): Promise<void> {
    await this.set({ lastError: error });
  }

  async clear(): Promise<void> {
    await this.db.runAsync(`DELETE FROM settings WHERE key = ?`, [
      SETTINGS_KEY,
    ]);
  }
}

export function useSyncSettings(): {
  getSettings: () => Promise<SyncSettings>;
  setSettings: (settings: Partial<SyncSettings>) => Promise<void>;
  getServerUrl: () => Promise<string | null>;
  setServerUrl: (url: string | null) => Promise<void>;
  getEmail: () => Promise<string | null>;
  setUserInfo: (email: string, userId: string) => Promise<void>;
  isEnabled: () => Promise<boolean>;
  setEnabled: (enabled: boolean) => Promise<void>;
  recordSyncSuccess: () => Promise<void>;
  recordSyncError: (error: string) => Promise<void>;
  clear: () => Promise<void>;
} {
  const db = useDatabase();
  const repo = new SyncSettingsRepository(db);

  return {
    getSettings: () => repo.get(),
    setSettings: (settings) => repo.set(settings),
    getServerUrl: () => repo.getServerUrl(),
    setServerUrl: (url) => repo.setServerUrl(url),
    getEmail: () => repo.getEmail(),
    setUserInfo: (email, userId) => repo.setUserInfo(email, userId),
    isEnabled: () => repo.isEnabled(),
    setEnabled: (enabled) => repo.setEnabled(enabled),
    recordSyncSuccess: () => repo.recordSyncSuccess(),
    recordSyncError: (error) => repo.recordSyncError(error),
    clear: () => repo.clear(),
  };
}
