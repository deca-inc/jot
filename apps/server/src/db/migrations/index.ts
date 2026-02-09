// Migration registry
// Import all migrations here and register them
import { registerMigration } from "../migrations.js";
import * as initialSchema from "./2026_02_02_00_00_00_initial_schema.js";
import * as addUsersTable from "./2026_02_03_00_00_00_add_users_table.js";
import * as addUserIdToDocuments from "./2026_02_03_00_00_01_add_user_id_to_documents.js";
import * as add_uek_to_users from "./2026_02_09_01_00_00_add_uek_to_users.js";
import type { MigrationModule } from "../migrationTypes.js";

/**
 * All migrations in order. Add new migrations to the end of this array.
 */
export const allMigrations: Array<{ name: string; module: MigrationModule }> = [
  { name: "2026_02_02_00_00_00_initial_schema.ts", module: initialSchema },
  { name: "2026_02_03_00_00_00_add_users_table.ts", module: addUsersTable },
  { name: "2026_02_03_00_00_01_add_user_id_to_documents.ts", module: addUserIdToDocuments },
  { name: "2026_02_09_01_00_00_add_uek_to_users.ts", module: add_uek_to_users },
];

// Register all migrations
for (const { name, module } of allMigrations) {
  registerMigration(name, () => module);
}
