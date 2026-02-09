import { type MigrationRunner, migrationLog } from "../migrationTypes";

export const up: MigrationRunner = async (db) => {
  migrationLog("[Migration] Adding modelId to agents table...");

  // Add modelId column to agents table
  // This links each agent to a specific LLM model
  await db.execAsync(`
    ALTER TABLE agents ADD COLUMN modelId TEXT;
  `);

  migrationLog("[Migration] modelId column added to agents table");
};

export const down: MigrationRunner = async (_db) => {
  // Note: SQLite doesn't support dropping columns directly
  migrationLog("[Migration] Down migration for modelId not fully implemented");
};
