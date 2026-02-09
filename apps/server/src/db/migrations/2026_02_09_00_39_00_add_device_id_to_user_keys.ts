import type { MigrationRunner } from "../migrationTypes.js";

/**
 * Migration: Add device_id to user_keys for multi-device E2EE support
 *
 * Changes:
 * - Add device_id column to user_keys
 * - Change primary key from user_id to (user_id, device_id)
 * - This allows each user to have multiple device keys
 */
export const up: MigrationRunner = (db) => {
  // SQLite doesn't support ALTER PRIMARY KEY, so we recreate the table
  db.exec(`
    -- Create new table with device_id
    CREATE TABLE user_keys_new (
      user_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      public_key TEXT NOT NULL,
      key_type TEXT NOT NULL DEFAULT 'RSA-OAEP',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, device_id)
    );

    -- Copy existing data (use 'default' as device_id for existing keys)
    INSERT INTO user_keys_new (user_id, device_id, public_key, key_type, created_at, updated_at)
    SELECT user_id, 'legacy-device', public_key, key_type, created_at, updated_at
    FROM user_keys;

    -- Drop old table
    DROP TABLE user_keys;

    -- Rename new table
    ALTER TABLE user_keys_new RENAME TO user_keys;

    -- Create index for fast lookup by user_id
    CREATE INDEX idx_user_keys_user_id ON user_keys(user_id);
  `);
};

export const down: MigrationRunner = (db) => {
  // Revert to single-key-per-user (keeps only the most recent key per user)
  db.exec(`
    -- Create old schema
    CREATE TABLE user_keys_old (
      user_id TEXT PRIMARY KEY,
      public_key TEXT NOT NULL,
      key_type TEXT NOT NULL DEFAULT 'RSA-OAEP',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Copy data (keep most recent device key per user)
    INSERT INTO user_keys_old (user_id, public_key, key_type, created_at, updated_at)
    SELECT user_id, public_key, key_type, created_at, updated_at
    FROM user_keys
    WHERE (user_id, updated_at) IN (
      SELECT user_id, MAX(updated_at) FROM user_keys GROUP BY user_id
    );

    -- Drop new table
    DROP TABLE user_keys;

    -- Rename old table
    ALTER TABLE user_keys_old RENAME TO user_keys;
  `);
};
