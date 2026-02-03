import { type MigrationRunner } from "../migrationTypes";

/**
 * Repair migration that adds any missing columns that should have been
 * added by previous migrations. This handles cases where migrations
 * were registered after a database was already created.
 */
export const up: MigrationRunner = async (db) => {
  console.log("[Migration] Checking for missing columns...");

  // Get current columns in entries table
  const tableInfo = await db.getAllAsync<{ name: string }>(
    `PRAGMA table_info(entries)`,
  );
  const existingColumns = new Set(tableInfo.map((col) => col.name));

  // Columns that should exist on entries table
  const requiredColumns = [
    {
      name: "generationStatus",
      sql: `ALTER TABLE entries ADD COLUMN generationStatus TEXT CHECK(generationStatus IN ('idle', 'generating', 'completed', 'failed'))`,
    },
    {
      name: "generationStartedAt",
      sql: `ALTER TABLE entries ADD COLUMN generationStartedAt INTEGER`,
    },
    {
      name: "generationModelId",
      sql: `ALTER TABLE entries ADD COLUMN generationModelId TEXT`,
    },
    {
      name: "agentId",
      sql: `ALTER TABLE entries ADD COLUMN agentId INTEGER REFERENCES agents(id)`,
    },
  ];

  for (const column of requiredColumns) {
    if (!existingColumns.has(column.name)) {
      console.log(`[Migration] Adding missing column: ${column.name}`);
      try {
        await db.execAsync(column.sql);
      } catch (err) {
        console.warn(`[Migration] Could not add column ${column.name}:`, err);
      }
    }
  }

  // Also check for missing indexes
  try {
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_entries_generation_status
      ON entries(generationStatus, generationStartedAt)
    `);
  } catch {
    // Ignore if already exists
  }

  console.log("[Migration] Missing columns check complete");
};

export const down: MigrationRunner = async (_db) => {
  // No-op - this is a repair migration
  console.log("[Migration] Repair migration down - no action needed");
};
