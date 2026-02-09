import { type MigrationRunner } from "../migrationTypes";

/**
 * Generate a UUID-like string using SQLite's random functions.
 * This is used for backfilling existing entries during migration.
 * New entries will use proper UUIDv7 from the app.
 */
function generateSqliteUuidExpression(): string {
  // Generate a UUID v4-like string using SQLite's hex and random functions
  // Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  return `
    lower(
      hex(randomblob(4)) || '-' ||
      hex(randomblob(2)) || '-' ||
      '4' || substr(hex(randomblob(2)), 2) || '-' ||
      substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' ||
      hex(randomblob(6))
    )
  `;
}

export const up: MigrationRunner = async (db) => {
  // Add UUID for cross-device identification
  await db.execAsync(`
    ALTER TABLE entries ADD COLUMN uuid TEXT;
  `);

  // Backfill existing entries with UUIDs
  // Note: These are generated UUIDs, not UUIDv7 (which requires app-level crypto)
  // New entries created after this migration will use proper UUIDv7
  const uuidExpr = generateSqliteUuidExpression();
  await db.execAsync(`
    UPDATE entries SET uuid = ${uuidExpr} WHERE uuid IS NULL;
  `);

  // Create unique index for UUID
  await db.execAsync(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_entries_uuid ON entries(uuid);
  `);

  // Add sync tracking columns
  await db.execAsync(`
    ALTER TABLE entries ADD COLUMN sync_status TEXT DEFAULT 'pending';
  `);
  // sync_status values: pending | synced | modified | conflict

  await db.execAsync(`
    ALTER TABLE entries ADD COLUMN server_updated_at INTEGER;
  `);

  await db.execAsync(`
    ALTER TABLE entries ADD COLUMN last_synced_at INTEGER;
  `);

  // Asset upload tracking table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS asset_uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
      local_path TEXT NOT NULL,
      remote_url TEXT,
      file_size INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      error TEXT,
      retry_count INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  // status values: pending | uploading | uploaded | failed

  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_asset_uploads_status ON asset_uploads(status);
  `);

  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_asset_uploads_entry_id ON asset_uploads(entry_id);
  `);
};

export const down: MigrationRunner = async (db) => {
  // Drop asset_uploads table and indexes
  await db.execAsync(`DROP TABLE IF EXISTS asset_uploads;`);

  // Drop sync indexes
  await db.execAsync(`DROP INDEX IF EXISTS idx_entries_uuid;`);

  // Note: SQLite doesn't support DROP COLUMN directly
  // For simplicity, we leave the columns but they won't be used
  // In production, you'd recreate the table without these columns
};
