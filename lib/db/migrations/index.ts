// Migration registry
// Import all migrations here and register them
import { registerMigration } from "../migrations";
import * as initialSchema from "./2025_01_13_16_25_00_initial_schema";
import * as add_generation_state from "./2025_11_19_05_42_50_add_generation_state";

// Seeds (optional - enable with --seeds flag)
import * as initialSeed from "./seeds/2025_01_13_16_25_00_initial_seed";

// Register all migrations
registerMigration(
  "2025_01_13_16_25_00_initial_schema.ts",
  async () => initialSchema
);

registerMigration(
  "2025_11_19_05_42_50_add_generation_state.ts",
  async () => add_generation_state
);

// Register seeds (optional migrations - only run when --seeds flag is enabled)
registerMigration(
  "seeds/2025_01_13_16_25_00_initial_seed.ts",
  async () => initialSeed
);

// Add new migrations here:
// registerMigration("YYYY_MM_DD_HH:MM:SS_migration_name.ts", async () => await import("./YYYY_MM_DD_HH:MM:SS_migration_name"));
