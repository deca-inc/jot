import type { MigrationRunner } from "../migrationTypes.js";

export const up: MigrationRunner = (db) => {
  // Create documents table (Yjs state storage)
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      yjs_state BLOB,
      metadata JSON,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // Create sessions table (connected devices)
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      display_name TEXT,
      device_type TEXT DEFAULT 'guest',
      last_seen_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  // Create settings table (server config)
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value JSON,
      updated_at INTEGER NOT NULL
    );
  `);

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON documents(updated_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_last_seen_at ON sessions(last_seen_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_device_type ON sessions(device_type);
  `);
};

export const down: MigrationRunner = (db) => {
  db.exec(`DROP INDEX IF EXISTS idx_sessions_device_type;`);
  db.exec(`DROP INDEX IF EXISTS idx_sessions_last_seen_at;`);
  db.exec(`DROP INDEX IF EXISTS idx_documents_updated_at;`);
  db.exec(`DROP TABLE IF EXISTS settings;`);
  db.exec(`DROP TABLE IF EXISTS sessions;`);
  db.exec(`DROP TABLE IF EXISTS documents;`);
};
