// Migration registry
// Import all migrations here and register them
import { registerMigration } from "../migrations";
import { MigrationModule } from "../migrationTypes";
import * as initialSchema from "./2025_01_13_16_25_00_initial_schema";
import * as add_generation_state from "./2025_11_19_05_42_50_add_generation_state";
import * as add_countdown_pinned_archive from "./2025_12_30_06_41_26_add_countdown_pinned_archive";
import * as add_countdown_type from "./2025_12_30_07_00_00_add_countdown_type";
import * as add_parent_id from "./2026_01_10_00_00_00_add_parent_id";
import * as add_agents from "./2026_01_16_06_09_18_add_agents";
import * as add_attachments_table from "./2026_01_16_21_35_46_add_attachments_table";
import * as add_modelid_to_agents from "./2026_01_19_18_18_18_add_modelid_to_agents";
import * as repair_missing_columns from "./2026_01_19_19_21_20_repair_missing_columns";
import * as add_custom_models from "./2026_01_24_21_13_05_add_custom_models";
import * as initialSeed from "./seeds/2025_01_13_16_25_00_initial_seed";

/**
 * All migrations in order. Add new migrations to the end of this array.
 * Seeds should be prefixed with "seeds/" in the name.
 */
export const allMigrations: Array<{ name: string; module: MigrationModule }> = [
  { name: "2025_01_13_16_25_00_initial_schema.ts", module: initialSchema },
  {
    name: "2025_11_19_05_42_50_add_generation_state.ts",
    module: add_generation_state,
  },
  {
    name: "2025_12_30_06_41_26_add_countdown_pinned_archive.ts",
    module: add_countdown_pinned_archive,
  },
  {
    name: "2025_12_30_07_00_00_add_countdown_type.ts",
    module: add_countdown_type,
  },
  { name: "2026_01_10_00_00_00_add_parent_id.ts", module: add_parent_id },
  { name: "2026_01_16_06_09_18_add_agents.ts", module: add_agents },
  {
    name: "2026_01_16_21_35_46_add_attachments_table.ts",
    module: add_attachments_table,
  },
  {
    name: "2026_01_19_18_18_18_add_modelid_to_agents.ts",
    module: add_modelid_to_agents,
  },
  {
    name: "2026_01_19_19_21_20_repair_missing_columns.ts",
    module: repair_missing_columns,
  },
  {
    name: "2026_01_24_21_13_05_add_custom_models.ts",
    module: add_custom_models,
  },
  // Seeds (optional - only run when --seeds flag is enabled)
  { name: "seeds/2025_01_13_16_25_00_initial_seed.ts", module: initialSeed },
];

// Register all migrations
for (const { name, module } of allMigrations) {
  registerMigration(name, async () => module);
}
