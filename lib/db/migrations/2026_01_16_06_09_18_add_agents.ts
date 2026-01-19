import { type MigrationRunner } from "../migrationTypes";

export const up: MigrationRunner = async (db) => {
  console.log("[Migration] Adding agents table...");

  // Create agents table for custom AI personas
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      systemPrompt TEXT NOT NULL,
      thinkMode TEXT CHECK(thinkMode IN ('no-think', 'think', 'none')) DEFAULT 'no-think',
      isDefault INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );
  `);

  // Add index for default agent lookup
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_agents_isDefault ON agents(isDefault);
  `);

  // Add agentId column to entries table
  await db.execAsync(`
    ALTER TABLE entries ADD COLUMN agentId INTEGER REFERENCES agents(id);
  `);

  // Insert default agent with the current system prompt
  const now = Date.now();
  await db.execAsync(`
    INSERT INTO agents (name, systemPrompt, thinkMode, isDefault, createdAt, updatedAt)
    VALUES (
      'Default Assistant',
      'You''re a thoughtful, AI assistant that is both concise and thorough. When unsure about the user''s intentions you should clarify. When unsure about a fact, you should indicate so. You should not present bias in your answers politically. Your answers should be well balanced, truthful, and informative.',
      'no-think',
      1,
      ${now},
      ${now}
    );
  `);

  console.log("[Migration] Agents table created successfully");
};

export const down: MigrationRunner = async (_db) => {
  // Note: SQLite doesn't support dropping columns directly
  // We would need to recreate the table without the column
  console.warn("[Migration] Down migration for agents not fully implemented");
};
