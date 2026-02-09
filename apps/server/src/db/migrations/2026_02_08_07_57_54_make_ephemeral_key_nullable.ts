/**
 * Migration: Make ephemeral_public_key nullable
 *
 * With the switch from ECDH to RSA-OAEP for key wrapping,
 * we no longer need an ephemeral public key. This migration
 * makes the column nullable for backwards compatibility.
 */

import { migrationLog } from "../migrationTypes.js";
import type { MigrationRunner } from "../migrationTypes.js";

export const up: MigrationRunner = (db) => {
  // SQLite doesn't support ALTER COLUMN, so we need to recreate the table
  db.exec(`
    -- Create new table with nullable ephemeral_public_key
    CREATE TABLE entry_key_grants_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      wrapped_dek TEXT NOT NULL,
      ephemeral_public_key TEXT,
      granted_by TEXT NOT NULL,
      granted_at INTEGER NOT NULL,
      UNIQUE(document_id, user_id)
    );

    -- Copy existing data
    INSERT INTO entry_key_grants_new
      SELECT id, document_id, user_id, wrapped_dek, ephemeral_public_key, granted_by, granted_at
      FROM entry_key_grants;

    -- Drop old table
    DROP TABLE entry_key_grants;

    -- Rename new table
    ALTER TABLE entry_key_grants_new RENAME TO entry_key_grants;

    -- Recreate indexes
    CREATE INDEX IF NOT EXISTS idx_entry_key_grants_document
    ON entry_key_grants(document_id);

    CREATE INDEX IF NOT EXISTS idx_entry_key_grants_user
    ON entry_key_grants(user_id);
  `);

  // Also update default key type in user_keys to RSA-OAEP
  // (existing keys will keep their type, new keys will default to RSA-OAEP)
  migrationLog("[Migration] Made ephemeral_public_key nullable for RSA-OAEP support");
};

export const down: MigrationRunner = (db) => {
  // Revert to NOT NULL (set empty string for null values)
  db.exec(`
    -- Update null values to empty string first
    UPDATE entry_key_grants SET ephemeral_public_key = '' WHERE ephemeral_public_key IS NULL;

    -- Create table with NOT NULL constraint
    CREATE TABLE entry_key_grants_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      wrapped_dek TEXT NOT NULL,
      ephemeral_public_key TEXT NOT NULL,
      granted_by TEXT NOT NULL,
      granted_at INTEGER NOT NULL,
      UNIQUE(document_id, user_id)
    );

    -- Copy data
    INSERT INTO entry_key_grants_new
      SELECT id, document_id, user_id, wrapped_dek, ephemeral_public_key, granted_by, granted_at
      FROM entry_key_grants;

    -- Drop and rename
    DROP TABLE entry_key_grants;
    ALTER TABLE entry_key_grants_new RENAME TO entry_key_grants;

    -- Recreate indexes
    CREATE INDEX IF NOT EXISTS idx_entry_key_grants_document
    ON entry_key_grants(document_id);

    CREATE INDEX IF NOT EXISTS idx_entry_key_grants_user
    ON entry_key_grants(user_id);
  `);

  migrationLog("[Migration] Reverted ephemeral_public_key to NOT NULL");
};
