import type { MigrationRunner } from "../migrationTypes.js";

export const up: MigrationRunner = (db) => {
  // Add user_id column to documents table
  db.exec(`
    ALTER TABLE documents ADD COLUMN user_id TEXT REFERENCES users(id);
  `);

  // Create index for user_id
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
  `);
};

export const down: MigrationRunner = (db) => {
  db.exec(`DROP INDEX IF EXISTS idx_documents_user_id;`);
  // SQLite doesn't support DROP COLUMN, so we need to recreate the table
  db.exec(`
    CREATE TABLE documents_backup AS SELECT id, yjs_state, metadata, created_at, updated_at FROM documents;
    DROP TABLE documents;
    CREATE TABLE documents (
      id TEXT PRIMARY KEY,
      yjs_state BLOB,
      metadata JSON,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    INSERT INTO documents SELECT * FROM documents_backup;
    DROP TABLE documents_backup;
    CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON documents(updated_at);
  `);
};
