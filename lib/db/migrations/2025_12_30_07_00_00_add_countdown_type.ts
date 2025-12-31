import { type MigrationRunner } from "../migrationTypes";

export const up: MigrationRunner = async (db) => {
  // SQLite doesn't support modifying CHECK constraints, so we need to recreate the table
  // This migration adds 'countdown' to the allowed entry types

  // 1. Drop triggers that reference the entries table
  await db.execAsync(`DROP TRIGGER IF EXISTS entries_fts_update;`);
  await db.execAsync(`DROP TRIGGER IF EXISTS entries_fts_delete;`);
  await db.execAsync(`DROP TRIGGER IF EXISTS entries_fts_insert;`);

  // 2. Create new table with updated CHECK constraint
  await db.execAsync(`
    CREATE TABLE entries_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('journal', 'ai_chat', 'countdown')),
      title TEXT NOT NULL,
      blocks TEXT NOT NULL,
      tags TEXT,
      attachments TEXT,
      isFavorite INTEGER NOT NULL DEFAULT 0,
      embedding BLOB,
      embeddingModel TEXT,
      embeddingCreatedAt INTEGER,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      isPinned INTEGER NOT NULL DEFAULT 0,
      archivedAt INTEGER
    );
  `);

  // 3. Copy all data from old table
  await db.execAsync(`
    INSERT INTO entries_new (
      id, type, title, blocks, tags, attachments, isFavorite,
      embedding, embeddingModel, embeddingCreatedAt,
      createdAt, updatedAt, isPinned, archivedAt
    )
    SELECT
      id, type, title, blocks, tags, attachments, isFavorite,
      embedding, embeddingModel, embeddingCreatedAt,
      createdAt, updatedAt, isPinned, archivedAt
    FROM entries;
  `);

  // 4. Drop old table
  await db.execAsync(`DROP TABLE entries;`);

  // 5. Rename new table to entries
  await db.execAsync(`ALTER TABLE entries_new RENAME TO entries;`);

  // 6. Recreate the composite index
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_entries_timeline
      ON entries(archivedAt, isPinned DESC, updatedAt DESC, type, isFavorite, createdAt);
  `);

  // 7. Recreate idx_entries_createdAt (was kept from original schema)
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_entries_createdAt ON entries(createdAt);
  `);

  // 8. Recreate FTS triggers
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
            WHEN json_extract(value, '$.title') IS NOT NULL
            THEN json_extract(value, '$.title')
            WHEN json_extract(value, '$.items') IS NOT NULL
            THEN (SELECT GROUP_CONCAT(json_extract(item.value, '$')) FROM json_each(json_extract(value, '$.items')) as item)
            ELSE ''
          END,
          ' '
        ) FROM json_each(new.blocks))
      );
    END;
  `);

  await db.execAsync(`
    CREATE TRIGGER IF NOT EXISTS entries_fts_delete AFTER DELETE ON entries BEGIN
      DELETE FROM entries_fts WHERE rowid = old.id;
    END;
  `);

  await db.execAsync(`
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
            WHEN json_extract(value, '$.title') IS NOT NULL
            THEN json_extract(value, '$.title')
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
  // Revert to original CHECK constraint (without 'countdown')
  // This will fail if any countdown entries exist

  await db.execAsync(`DROP TRIGGER IF EXISTS entries_fts_update;`);
  await db.execAsync(`DROP TRIGGER IF EXISTS entries_fts_delete;`);
  await db.execAsync(`DROP TRIGGER IF EXISTS entries_fts_insert;`);

  await db.execAsync(`
    CREATE TABLE entries_old (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('journal', 'ai_chat')),
      title TEXT NOT NULL,
      blocks TEXT NOT NULL,
      tags TEXT,
      attachments TEXT,
      isFavorite INTEGER NOT NULL DEFAULT 0,
      embedding BLOB,
      embeddingModel TEXT,
      embeddingCreatedAt INTEGER,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      isPinned INTEGER NOT NULL DEFAULT 0,
      archivedAt INTEGER
    );
  `);

  await db.execAsync(`
    INSERT INTO entries_old (
      id, type, title, blocks, tags, attachments, isFavorite,
      embedding, embeddingModel, embeddingCreatedAt,
      createdAt, updatedAt, isPinned, archivedAt
    )
    SELECT
      id, type, title, blocks, tags, attachments, isFavorite,
      embedding, embeddingModel, embeddingCreatedAt,
      createdAt, updatedAt, isPinned, archivedAt
    FROM entries
    WHERE type != 'countdown';
  `);

  await db.execAsync(`DROP TABLE entries;`);
  await db.execAsync(`ALTER TABLE entries_old RENAME TO entries;`);

  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_entries_timeline
      ON entries(archivedAt, isPinned DESC, updatedAt DESC, type, isFavorite, createdAt);
  `);

  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_entries_createdAt ON entries(createdAt);
  `);

  // Recreate original FTS triggers
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
  `);

  await db.execAsync(`
    CREATE TRIGGER IF NOT EXISTS entries_fts_delete AFTER DELETE ON entries BEGIN
      DELETE FROM entries_fts WHERE rowid = old.id;
    END;
  `);

  await db.execAsync(`
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
