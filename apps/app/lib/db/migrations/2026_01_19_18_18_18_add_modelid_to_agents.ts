import { type MigrationRunner } from "../migrationTypes";

export const up: MigrationRunner = async (db) => {
  console.log("[Migration] Adding modelId to agents table...");

  // Add modelId column to agents table
  // This links each agent to a specific LLM model
  await db.execAsync(`
    ALTER TABLE agents ADD COLUMN modelId TEXT;
  `);

  console.log("[Migration] modelId column added to agents table");
};

export const down: MigrationRunner = async (_db) => {
  // Note: SQLite doesn't support dropping columns directly
  console.warn("[Migration] Down migration for modelId not fully implemented");
};
