import { type MigrationRunner } from "../migrationTypes";

export const up: MigrationRunner = async (db) => {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      entryId INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('audio', 'image', 'video', 'document')),
      mimeType TEXT NOT NULL,
      filename TEXT,
      size INTEGER,
      duration REAL,
      createdAt INTEGER NOT NULL,
      FOREIGN KEY (entryId) REFERENCES entries(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_attachments_entryId ON attachments(entryId);
  `);
};

export const down: MigrationRunner = async (db) => {
  await db.execAsync(`
    DROP INDEX IF EXISTS idx_attachments_entryId;
    DROP TABLE IF EXISTS attachments;
  `);
};
