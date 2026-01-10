import { type MigrationRunner } from "../migrationTypes";

export const up: MigrationRunner = async (db) => {
  // Add parentId column for parent/child entry relationships (e.g., countdown check-ins)
  await db.execAsync(`
    ALTER TABLE entries ADD COLUMN parentId INTEGER REFERENCES entries(id) ON DELETE CASCADE;
  `);

  // Create index for efficient lookup of child entries
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_entries_parent_id ON entries(parentId);
  `);
};

export const down: MigrationRunner = async (db) => {
  // Drop the index
  await db.execAsync(`DROP INDEX IF EXISTS idx_entries_parent_id;`);

  // SQLite doesn't support DROP COLUMN directly
  // For simplicity, we'll leave the column but it won't be used
  // In production, you'd recreate the table without this column
};
