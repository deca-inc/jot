import { type MigrationRunner } from "../migrationTypes";

export const up: MigrationRunner = async (db) => {
  // Add isPinned column (for pinning entries to top)
  await db.execAsync(`
    ALTER TABLE entries ADD COLUMN isPinned INTEGER NOT NULL DEFAULT 0;
  `);

  // Add archivedAt column (NULL = not archived, timestamp = when archived)
  // Used for completed countdowns or entries user wants to hide but not delete
  await db.execAsync(`
    ALTER TABLE entries ADD COLUMN archivedAt INTEGER;
  `);

  // Create composite index optimized for the main timeline query:
  // Query pattern: WHERE archivedAt IS NULL [AND type=?] [AND isFavorite=?] ORDER BY isPinned DESC, updatedAt DESC
  // Index column order: filter columns first (archivedAt for NULL check), then sort columns, then remaining filters
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_entries_timeline
      ON entries(archivedAt, isPinned DESC, updatedAt DESC, type, isFavorite, createdAt);
  `);

  // Drop old single-column indexes that are now covered by the composite index
  await db.execAsync(`DROP INDEX IF EXISTS idx_entries_type;`);
  await db.execAsync(`DROP INDEX IF EXISTS idx_entries_updatedAt;`);
  await db.execAsync(`DROP INDEX IF EXISTS idx_entries_isFavorite;`);
  // Keep idx_entries_createdAt for queries that sort by createdAt instead of updatedAt
};

export const down: MigrationRunner = async (db) => {
  // Recreate the old single-column indexes
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_entries_type ON entries(type);
  `);
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_entries_updatedAt ON entries(updatedAt);
  `);
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_entries_isFavorite ON entries(isFavorite);
  `);

  // Drop the composite index
  await db.execAsync(`DROP INDEX IF EXISTS idx_entries_timeline;`);

  // SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
  // For simplicity, we'll leave the columns but they won't be used
  // In production, you'd recreate the table without these columns
};
