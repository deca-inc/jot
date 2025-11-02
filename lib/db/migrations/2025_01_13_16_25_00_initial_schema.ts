import { type MigrationRunner } from "../migrationTypes";

export const up: MigrationRunner = async (db) => {
  // Create entries table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('journal', 'ai_chat')),
      title TEXT NOT NULL,
      blocks TEXT NOT NULL, -- JSON array of blocks
      tags TEXT, -- JSON array of tag strings
      attachments TEXT, -- JSON array of attachment paths
      isFavorite INTEGER NOT NULL DEFAULT 0,
      embedding BLOB, -- BLOB for float32 array
      embeddingModel TEXT,
      embeddingCreatedAt INTEGER,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );
  `);

  // Create FTS5 virtual table for full-text search
  await db.execAsync(`
    CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
      id UNINDEXED,
      title,
      content,
      content_rowid='id'
    );
  `);

  // Create settings table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updatedAt INTEGER NOT NULL
    );
  `);

  // Create indexes
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_entries_type ON entries(type);
    CREATE INDEX IF NOT EXISTS idx_entries_createdAt ON entries(createdAt);
    CREATE INDEX IF NOT EXISTS idx_entries_updatedAt ON entries(updatedAt);
    CREATE INDEX IF NOT EXISTS idx_entries_isFavorite ON entries(isFavorite);
  `);

  // Create triggers to keep FTS5 index in sync with entries table
  await db.execAsync(`
    CREATE TRIGGER IF NOT EXISTS entries_fts_insert AFTER INSERT ON entries BEGIN
      INSERT INTO entries_fts(rowid, title, content)
      VALUES (
        new.id, 
        new.title, 
        (SELECT GROUP_CONCAT(
          CASE 
            WHEN json_extract(value, '$.content') IS NOT NULL 
            THEN json_extract(value, '$.content')
            WHEN json_extract(value, '$.items') IS NOT NULL
            THEN (SELECT GROUP_CONCAT(json_extract(item.value, '$')) FROM json_each(json_extract(value, '$.items')) as item)
            ELSE ''
          END, 
          ' '
        ) FROM json_each(new.blocks))
      );
    END;

    CREATE TRIGGER IF NOT EXISTS entries_fts_delete AFTER DELETE ON entries BEGIN
      DELETE FROM entries_fts WHERE rowid = old.id;
    END;

    CREATE TRIGGER IF NOT EXISTS entries_fts_update AFTER UPDATE ON entries BEGIN
      DELETE FROM entries_fts WHERE rowid = old.id;
      INSERT INTO entries_fts(rowid, title, content)
      VALUES (
        new.id, 
        new.title, 
        (SELECT GROUP_CONCAT(
          CASE 
            WHEN json_extract(value, '$.content') IS NOT NULL 
            THEN json_extract(value, '$.content')
            WHEN json_extract(value, '$.items') IS NOT NULL
            THEN (SELECT GROUP_CONCAT(json_extract(item.value, '$')) FROM json_each(json_extract(value, '$.items')) as item)
            ELSE ''
          END, 
          ' '
        ) FROM json_each(new.blocks))
      );
    END;
  `);
};

export const down: MigrationRunner = async (db) => {
  await db.execAsync(`DROP TRIGGER IF EXISTS entries_fts_update;`);
  await db.execAsync(`DROP TRIGGER IF EXISTS entries_fts_delete;`);
  await db.execAsync(`DROP TRIGGER IF EXISTS entries_fts_insert;`);
  await db.execAsync(`DROP INDEX IF EXISTS idx_entries_isFavorite;`);
  await db.execAsync(`DROP INDEX IF EXISTS idx_entries_updatedAt;`);
  await db.execAsync(`DROP INDEX IF EXISTS idx_entries_createdAt;`);
  await db.execAsync(`DROP INDEX IF EXISTS idx_entries_type;`);
  await db.execAsync(`DROP TABLE IF EXISTS entries_fts;`);
  await db.execAsync(`DROP TABLE IF EXISTS settings;`);
  await db.execAsync(`DROP TABLE IF EXISTS entries;`);
};
