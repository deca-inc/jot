import Database from "better-sqlite3";

export interface Setting<T = unknown> {
  key: string;
  value: T;
  updatedAt: number;
}

interface SettingRow {
  key: string;
  value: string;
  updated_at: number;
}

/**
 * Repository for server settings (key-value store)
 */
export class SettingsRepository {
  constructor(private db: Database.Database) {}

  /**
   * Get a setting by key
   */
  get<T = unknown>(key: string): T | null {
    const row = this.db
      .prepare("SELECT * FROM settings WHERE key = ?")
      .get(key) as SettingRow | undefined;

    if (!row) {
      return null;
    }

    return JSON.parse(row.value) as T;
  }

  /**
   * Get a setting with metadata
   */
  getWithMetadata<T = unknown>(key: string): Setting<T> | null {
    const row = this.db
      .prepare("SELECT * FROM settings WHERE key = ?")
      .get(key) as SettingRow | undefined;

    if (!row) {
      return null;
    }

    return {
      key: row.key,
      value: JSON.parse(row.value) as T,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Get all settings
   */
  getAll(): Setting[] {
    const rows = this.db
      .prepare("SELECT * FROM settings ORDER BY key")
      .all() as SettingRow[];

    return rows.map((row) => ({
      key: row.key,
      value: JSON.parse(row.value),
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Set a setting value
   */
  set<T>(key: string, value: T): Setting<T> {
    const now = Date.now();
    const valueJson = JSON.stringify(value);

    this.db
      .prepare(
        `INSERT INTO settings (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           updated_at = excluded.updated_at`,
      )
      .run(key, valueJson, now);

    return {
      key,
      value,
      updatedAt: now,
    };
  }

  /**
   * Delete a setting
   */
  delete(key: string): void {
    this.db.prepare("DELETE FROM settings WHERE key = ?").run(key);
  }

  /**
   * Check if a setting exists
   */
  has(key: string): boolean {
    const result = this.db
      .prepare("SELECT 1 FROM settings WHERE key = ? LIMIT 1")
      .get(key);
    return result !== undefined;
  }
}
