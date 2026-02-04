// Migration registry
// Import all migrations here and register them
import { registerMigration } from "../migrations.js";
import * as initialSchema from "./2026_02_02_00_00_00_initial_schema.js";
import type { MigrationModule } from "../migrationTypes.js";

/**
 * All migrations in order. Add new migrations to the end of this array.
 */
export const allMigrations: Array<{ name: string; module: MigrationModule }> = [
  { name: "2026_02_02_00_00_00_initial_schema.ts", module: initialSchema },
];

// Register all migrations
for (const { name, module } of allMigrations) {
  registerMigration(name, () => module);
}
