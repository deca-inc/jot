import type { MigrationRunner } from "../migrationTypes.js";

export const up: MigrationRunner = (db) => {
  // Create users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // Create refresh_tokens table
  db.exec(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
  `);
};

export const down: MigrationRunner = (db) => {
  db.exec(`DROP INDEX IF EXISTS idx_refresh_tokens_expires_at;`);
  db.exec(`DROP INDEX IF EXISTS idx_refresh_tokens_user_id;`);
  db.exec(`DROP INDEX IF EXISTS idx_users_email;`);
  db.exec(`DROP TABLE IF EXISTS refresh_tokens;`);
  db.exec(`DROP TABLE IF EXISTS users;`);
};
