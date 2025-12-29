import { SQLiteDatabase } from "expo-sqlite";
import { MigrationModule } from "./migrationTypes";

interface MigrationOptions {
  verbose: boolean;
  includeSeeds?: boolean;
}
const defaultOptions: MigrationOptions = { verbose: true, includeSeeds: false };

// Helper for conditional logging
function log(options: MigrationOptions, ...args: unknown[]) {
  if (options.verbose) {
    console.log(...args);
  }
}

// Client-side lock to prevent concurrent migrations
let isMigrating = false;

async function createTablesIfNotExists(db: SQLiteDatabase) {
  // Check if migrations table exists
  const tables = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name = 'migrations'",
  );

  if (tables.length > 0) {
    return;
  }

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      batch INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );
  `);
}

const isRejected = <T>(
  p: PromiseSettledResult<T>,
): p is PromiseRejectedResult => p.status === "rejected";

// Migration registry - populated by migrations/index.ts
const migrationModules: Record<string, () => Promise<MigrationModule>> = {};

export function registerMigration(
  name: string,
  module: () => Promise<MigrationModule>,
) {
  migrationModules[name] = module;
}

export async function migrateTo(
  db: SQLiteDatabase,
  migrationLimit: number = Number.POSITIVE_INFINITY,
  options: MigrationOptions = defaultOptions,
) {
  log(options, "Running Migrations");

  // Check if migrations are already running (client-side lock)
  if (isMigrating) {
    console.error(
      "Migrations are already running - please wait for them to complete",
    );
    return;
  }

  // Acquire client-side lock
  isMigrating = true;

  try {
    await createTablesIfNotExists(db);

    // Get existing migrations
    const existing = await db.getAllAsync<{
      id: number;
      name: string;
      batch: number;
    }>("SELECT * FROM migrations ORDER BY id DESC");

    const existingNames = new Set(existing.map((m) => m.name));
    const allMigrations = Object.keys(migrationModules).sort();

    // Filter out seeds (migrations in seeds/ directory) unless includeSeeds is true
    const migrationsToConsider = allMigrations.filter((name) => {
      return options.includeSeeds || !name.startsWith("seeds/");
    });

    const pendingMigrations = migrationsToConsider.filter(
      (name) => !existingNames.has(name),
    );

    if (pendingMigrations.length === 0) {
      log(options, "No pending migrations");
      return;
    }

    const migrationsToRun = pendingMigrations.slice(0, migrationLimit);
    const lastBatch = existing.length > 0 ? existing[0].batch : 0;
    const newBatch = lastBatch + 1;

    log(
      options,
      `- Found ${pendingMigrations.length} pending migration(s), running ${migrationsToRun.length}`,
    );

    // Load all migration modules
    const resolvedModules = await Promise.allSettled<MigrationModule>(
      migrationsToRun.map((name) => migrationModules[name]()),
    );

    // Wrap all migrations in a transaction
    await db.execAsync("BEGIN TRANSACTION");

    try {
      for (let i = 0; i < migrationsToRun.length; i++) {
        const mod = resolvedModules[i];
        if (isRejected(mod)) {
          throw new Error(`[Module Load Error] ${mod.reason}`);
        }
        if (typeof mod.value.up !== "function") {
          throw new Error(
            `[Migration Malformed Error] ${migrationsToRun[i]} does not have "up" method`,
          );
        }

        const runStart = Date.now();
        await mod.value.up(db);
        const runEnd = Date.now();

        // Record migration
        await db.runAsync("INSERT INTO migrations (name, batch) VALUES (?, ?)", [
          migrationsToRun[i],
          newBatch,
        ]);

        log(options, `- ▲ ${migrationsToRun[i]} [${runEnd - runStart}ms]`);
      }

      // Commit transaction if all migrations succeeded
      await db.execAsync("COMMIT");
    } catch (error) {
      // Rollback transaction on any error
      await db.execAsync("ROLLBACK");
      throw error;
    }
  } finally {
    // Always release the client-side lock
    isMigrating = false;
  }
}

export async function migrateBack(
  db: SQLiteDatabase,
  migrationLimit: number | "batch" = "batch",
  options: MigrationOptions = defaultOptions,
) {
  log(options, "Rolling Back Migrations");

  // Check if migrations are already running (client-side lock)
  if (isMigrating) {
    console.error(
      "Migrations are already running - please wait for them to complete",
    );
    return;
  }

  // Acquire client-side lock
  isMigrating = true;

  try {
    await createTablesIfNotExists(db);

    const existing = await db.getAllAsync<{
      id: number;
      name: string;
      batch: number;
    }>("SELECT * FROM migrations ORDER BY id DESC");

    if (existing.length === 0) {
      log(options, "No migrations to roll back");
      return;
    }

    const lastBatch = existing[0].batch;
    const migrationsToRollback =
      typeof migrationLimit === "number"
        ? existing.slice(0, migrationLimit ?? existing.length)
        : existing.filter((migration) => migration.batch === lastBatch);

    // Filter migrations to rollback - include seeds since we're rolling back
    // Only rollback migrations that actually exist in the registry
    const validMigrationsToRollback = migrationsToRollback.filter((migration) =>
      Object.prototype.hasOwnProperty.call(migrationModules, migration.name),
    );

    const resolvedModules = await Promise.allSettled<MigrationModule>(
      validMigrationsToRollback.map((migration) =>
        migrationModules[migration.name](),
      ),
    );

    if (typeof migrationLimit === "number") {
      log(options, "- Mode: rolling back individual migrations");
      log(options, `- Rollback limit: ${migrationLimit}`);
    } else {
      log(options, "- Mode: rolling back by batch");
      log(options, `- Batch number: ${lastBatch}`);
    }
    log(options, `- Including seeds (always included in rollback)`);

    let rollbackCount = 0;

    // Wrap all rollbacks in a transaction
    await db.execAsync("BEGIN TRANSACTION");

    try {
      for (let i = 0; i < validMigrationsToRollback.length; i++) {
        const mod = resolvedModules[i];
        if (isRejected(mod)) {
          throw new Error(`[Module Load Error] ${mod.reason}`);
        }
        if (typeof mod.value.down !== "function") {
          throw new Error(
            `[Migration Malformed Error] ${validMigrationsToRollback[i].name} does not have "down" method`,
          );
        }

        const runStart = Date.now();
        await mod.value.down(db);
        const runEnd = Date.now();

        await db.runAsync("DELETE FROM migrations WHERE name = ?", [
          validMigrationsToRollback[i].name,
        ]);

        rollbackCount += 1;
        log(
          options,
          `- ▼ ${validMigrationsToRollback[i].name} [${runEnd - runStart}ms]`,
        );
      }

      // Commit transaction if all rollbacks succeeded
      await db.execAsync("COMMIT");
    } catch (error) {
      // Rollback transaction on any error
      await db.execAsync("ROLLBACK");
      throw error;
    }

    log(
      options,
      `\nRan ${rollbackCount} ${
        rollbackCount === 1 ? "migration" : "migrations"
      } rollback`,
    );
  } finally {
    // Always release the client-side lock
    isMigrating = false;
  }
}
