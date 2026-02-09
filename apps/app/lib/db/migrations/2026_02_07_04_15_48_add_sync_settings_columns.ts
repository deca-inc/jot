import { type MigrationRunner } from "../migrationTypes";

/**
 * This migration adds network preference settings for sync.
 * These settings are stored in the sync_settings JSON in the settings table,
 * not as separate columns. This migration ensures the settings table exists.
 */
export const up: MigrationRunner = async (db) => {
  // The settings table already exists from initial schema.
  // We'll just ensure the sync_settings key has default network preferences
  // This is handled by the SyncSettingsRepository with default values
  // No schema changes needed - the JSON in settings table is flexible

  // Create a sync_preferences key with default values if it doesn't exist
  const now = Date.now();
  await db.runAsync(
    `INSERT OR IGNORE INTO settings (key, value, updatedAt) VALUES (?, ?, ?)`,
    [
      "sync_preferences",
      JSON.stringify({
        wifiOnlyThreshold: 5242880, // 5MB default
        autoSyncEnabled: true,
      }),
      now,
    ],
  );
};

export const down: MigrationRunner = async (db) => {
  await db.runAsync(`DELETE FROM settings WHERE key = ?`, ["sync_preferences"]);
};
