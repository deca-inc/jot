import type { MigrationRunner } from "../migrationTypes.js";

/**
 * Add encryption columns to assets table for E2EE
 *
 * Each asset is encrypted with a unique DEK (Data Encryption Key).
 * The DEK is wrapped with the user's UEK (User Encryption Key).
 *
 * Note: The assets table may be created dynamically by AssetRepository.ensureTable(),
 * so we need to handle both cases:
 * 1. Table doesn't exist - create it with all columns
 * 2. Table exists - add encryption columns
 */
export const up: MigrationRunner = (db) => {
  // Check if assets table exists
  const tableExists = db.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' AND name='assets'
  `).get();

  if (!tableExists) {
    // Create assets table with encryption columns
    db.exec(`
      CREATE TABLE assets (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        entry_id TEXT NOT NULL,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        storage_path TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        is_encrypted INTEGER DEFAULT 0,
        wrapped_dek TEXT,
        dek_nonce TEXT,
        dek_auth_tag TEXT,
        content_nonce TEXT,
        content_auth_tag TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX idx_assets_user_id ON assets(user_id);
      CREATE INDEX idx_assets_entry_id ON assets(entry_id);
    `);
  } else {
    // Add encryption columns to existing table
    db.exec(`
      ALTER TABLE assets ADD COLUMN wrapped_dek TEXT;
      ALTER TABLE assets ADD COLUMN dek_nonce TEXT;
      ALTER TABLE assets ADD COLUMN dek_auth_tag TEXT;
      ALTER TABLE assets ADD COLUMN is_encrypted INTEGER DEFAULT 0;
      ALTER TABLE assets ADD COLUMN content_nonce TEXT;
      ALTER TABLE assets ADD COLUMN content_auth_tag TEXT;
    `);
  }
};

export const down: MigrationRunner = (db) => {
  // SQLite doesn't support DROP COLUMN in older versions
  // Create new table without the columns and migrate data
  db.exec(`
    CREATE TABLE assets_backup AS SELECT
      id, user_id, entry_id, filename, mime_type, size, storage_path, created_at
    FROM assets;

    DROP TABLE assets;

    CREATE TABLE assets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      entry_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      storage_path TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    INSERT INTO assets SELECT * FROM assets_backup;
    DROP TABLE assets_backup;

    CREATE INDEX idx_assets_user_id ON assets(user_id);
    CREATE INDEX idx_assets_entry_id ON assets(entry_id);
  `);
};
