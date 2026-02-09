import type { MigrationRunner } from "../migrationTypes.js";

/**
 * Migration: Add Per-User Encryption Key (UEK) columns to users table
 *
 * UEK replaces per-device RSA keys with a single per-user symmetric key:
 * - wrapped_uek: The UEK encrypted with the user's KEK (derived from password)
 * - uek_salt: Salt used for PBKDF2 key derivation
 * - uek_nonce: Nonce/IV for AES-GCM wrapping
 * - uek_auth_tag: Authentication tag from AES-GCM
 * - uek_version: Version for key rotation
 */
export const up: MigrationRunner = (db) => {
  // Add UEK columns to users table
  db.exec(`
    ALTER TABLE users ADD COLUMN wrapped_uek TEXT;
  `);
  db.exec(`
    ALTER TABLE users ADD COLUMN uek_salt TEXT;
  `);
  db.exec(`
    ALTER TABLE users ADD COLUMN uek_nonce TEXT;
  `);
  db.exec(`
    ALTER TABLE users ADD COLUMN uek_auth_tag TEXT;
  `);
  db.exec(`
    ALTER TABLE users ADD COLUMN uek_version INTEGER DEFAULT 0;
  `);
};

export const down: MigrationRunner = (db) => {
  // SQLite doesn't support DROP COLUMN directly in older versions,
  // so we need to recreate the table
  db.exec(`
    CREATE TABLE users_backup AS SELECT
      id, email, password_hash, created_at, updated_at
    FROM users;
  `);
  db.exec(`DROP TABLE users;`);
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  db.exec(`
    INSERT INTO users SELECT * FROM users_backup;
  `);
  db.exec(`DROP TABLE users_backup;`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`);
};
