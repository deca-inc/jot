import { type MigrationRunner } from "../migrationTypes";

/**
 * Add title_pinned column to entries table.
 *
 * When true (1), the title was explicitly set by the user and should NOT
 * be overwritten by auto-generation (content preview, first-message
 * truncation, etc.).
 */
export const up: MigrationRunner = async (db) => {
  await db.execAsync(`
    ALTER TABLE entries ADD COLUMN title_pinned INTEGER DEFAULT 0;
  `);
};

export const down: MigrationRunner = async (db) => {
  await db.execAsync(`
    ALTER TABLE entries DROP COLUMN title_pinned;
  `);
};
