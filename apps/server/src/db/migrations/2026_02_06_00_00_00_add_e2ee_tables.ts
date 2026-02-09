/**
 * Migration: Add E2EE tables
 *
 * Creates tables for storing:
 * - User public keys
 * - Entry key grants (wrapped DEKs for sharing)
 */

import Database from "better-sqlite3";
import { migrationLog } from "../migrationTypes.js";

export function up(db: Database.Database): void {
  // User public keys for E2EE
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_keys (
      user_id TEXT PRIMARY KEY,
      public_key TEXT NOT NULL,
      key_type TEXT NOT NULL DEFAULT 'ECDH-P256',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Entry key grants - stores wrapped DEKs for each authorized user
  db.exec(`
    CREATE TABLE IF NOT EXISTS entry_key_grants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      wrapped_dek TEXT NOT NULL,
      ephemeral_public_key TEXT NOT NULL,
      granted_by TEXT NOT NULL,
      granted_at INTEGER NOT NULL,
      UNIQUE(document_id, user_id)
    )
  `);

  // Index for fast lookup of grants by document
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_entry_key_grants_document
    ON entry_key_grants(document_id)
  `);

  // Index for fast lookup of grants by user
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_entry_key_grants_user
    ON entry_key_grants(user_id)
  `);

  // Add encrypted content columns to documents table
  db.exec(`
    ALTER TABLE documents ADD COLUMN encrypted_content TEXT
  `);

  db.exec(`
    ALTER TABLE documents ADD COLUMN nonce TEXT
  `);

  db.exec(`
    ALTER TABLE documents ADD COLUMN auth_tag TEXT
  `);

  db.exec(`
    ALTER TABLE documents ADD COLUMN encryption_version INTEGER DEFAULT 0
  `);

  migrationLog("[Migration] E2EE tables created");
}

export function down(db: Database.Database): void {
  db.exec(`DROP TABLE IF EXISTS entry_key_grants`);
  db.exec(`DROP TABLE IF EXISTS user_keys`);
  // Note: Can't drop columns in SQLite easily, leaving encrypted columns
  migrationLog("[Migration] E2EE tables dropped");
}
