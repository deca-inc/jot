import { type MigrationRunner, migrationLog } from "../migrationTypes";

export const up: MigrationRunner = async (db) => {
  migrationLog("[Migration] Adding generation state tracking fields...");

  // Add generation state tracking fields
  await db.execAsync(`
    ALTER TABLE entries ADD COLUMN generationStatus TEXT 
    CHECK(generationStatus IN ('idle', 'generating', 'completed', 'failed'));
  `);

  await db.execAsync(`
    ALTER TABLE entries ADD COLUMN generationStartedAt INTEGER;
  `);

  await db.execAsync(`
    ALTER TABLE entries ADD COLUMN generationModelId TEXT;
  `);

  // Create index for finding incomplete generations
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_entries_generation_status 
    ON entries(generationStatus, generationStartedAt);
  `);

  migrationLog(
    "[Migration] Generation state tracking fields added successfully",
  );
};

export const down: MigrationRunner = async (_db) => {
  // Note: SQLite doesn't support DROP COLUMN directly
  // We would need to recreate the table without these columns
  // For now, just log a warning
  migrationLog(
    "[Migration] Down migration not implemented - SQLite doesn't support DROP COLUMN",
  );
};
