import { SQLiteDatabase } from "expo-sqlite";
import { MigrationModule, MigrationRunner } from "./migrationTypes";

interface MigrationOptions {
  verbose: boolean;
  includeSeeds?: boolean;
}
const defaultOptions: MigrationOptions = { verbose: true, includeSeeds: false };

async function createTablesIfNotExists(db: SQLiteDatabase) {
  // Check if migrations table exists
  const tables = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('migrations', 'migration_lock')"
  );

  const willCreateTables = tables.length < 2;
  if (!willCreateTables) {
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

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS migration_lock (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      is_locked INTEGER NOT NULL DEFAULT 0
    );
  `);

  // Initialize lock if it doesn't exist
  const lock = await db.getAllAsync("SELECT * FROM migration_lock");
  if (lock.length === 0) {
    await db.runAsync("INSERT INTO migration_lock (is_locked) VALUES (0)");
  }
}

const isRejected = <T>(
  p: PromiseSettledResult<T>
): p is PromiseRejectedResult => p.status === "rejected";

// Migration registry - populated by migrations/index.ts
const migrationModules: Record<string, () => Promise<MigrationModule>> = {};

export function registerMigration(
  name: string,
  module: () => Promise<MigrationModule>
) {
  migrationModules[name] = module;
}

export async function migrateTo(
  db: SQLiteDatabase,
  migrationLimit: number = Number.POSITIVE_INFINITY,
  options: MigrationOptions = defaultOptions
) {
  options.verbose && console.log("Running Migrations");

  await createTablesIfNotExists(db);

  // Check if migrations are locked
  const isLocked = await db.getAllAsync<{ is_locked: number }>(
    "SELECT * FROM migration_lock WHERE is_locked = 1"
  );
  if (isLocked.length > 0) {
    console.error(
      "Migrations are locked - you need to wait or manually unlock them"
    );
    return;
  }

  let thisRunInitiatedTheLock = false;

  try {
    // Lock migrations
    await db.runAsync("UPDATE migration_lock SET is_locked = 1");
    thisRunInitiatedTheLock = true;

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
      (name) => !existingNames.has(name)
    );

    if (pendingMigrations.length === 0) {
      options.verbose && console.log("No pending migrations");
      return;
    }

    const migrationsToRun = pendingMigrations.slice(0, migrationLimit);
    const lastBatch = existing.length > 0 ? existing[0].batch : 0;
    const newBatch = lastBatch + 1;

    options.verbose &&
      console.log(
        `- Found ${pendingMigrations.length} pending migration(s), running ${migrationsToRun.length}`
      );

    // Load all migration modules
    const resolvedModules = await Promise.allSettled<MigrationModule>(
      migrationsToRun.map((name) => migrationModules[name]())
    );

    // Run migrations in a transaction
    for (let i = 0; i < migrationsToRun.length; i++) {
      const mod = resolvedModules[i];
      if (isRejected(mod)) {
        throw new Error(`[Module Load Error] ${mod.reason}`);
      }
      if (typeof mod.value.up !== "function") {
        throw new Error(
          `[Migration Malformed Error] ${migrationsToRun[i]} does not have "up" method`
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

      options.verbose &&
        console.log(`- ▲ ${migrationsToRun[i]} [${runEnd - runStart}ms]`);
    }
  } finally {
    if (thisRunInitiatedTheLock) {
      try {
        await db.runAsync("UPDATE migration_lock SET is_locked = 0");
      } catch (e: any) {
        throw new Error(
          `[Migration Unlock Error] Could not unlock migrations - ${e.toString()}`
        );
      }
    }
  }
}

export async function migrateBack(
  db: SQLiteDatabase,
  migrationLimit: number | "batch" = "batch",
  options: MigrationOptions = defaultOptions
) {
  options.verbose && console.log("Rolling Back Migrations");

  await createTablesIfNotExists(db);

  // Always include seeds when rolling back
  const rollbackOptions = { ...options, includeSeeds: true };

  const isLocked = await db.getAllAsync<{ is_locked: number }>(
    "SELECT * FROM migration_lock WHERE is_locked = 1"
  );
  if (isLocked.length > 0) {
    console.error(
      "Migrations are locked - you need to wait or manually unlock them"
    );
    return;
  }

  let thisRunInitiatedTheLock = false;
  let rollbackCount = 0;

  try {
    await db.runAsync("UPDATE migration_lock SET is_locked = 1");
    thisRunInitiatedTheLock = true;

    const existing = await db.getAllAsync<{
      id: number;
      name: string;
      batch: number;
    }>("SELECT * FROM migrations ORDER BY id DESC");

    if (existing.length === 0) {
      options.verbose && console.log("No migrations to roll back");
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
      migrationModules.hasOwnProperty(migration.name)
    );

    const resolvedModules = await Promise.allSettled<MigrationModule>(
      validMigrationsToRollback.map((migration) =>
        migrationModules[migration.name]()
      )
    );

    if (typeof migrationLimit === "number") {
      options.verbose &&
        console.log("- Mode: rolling back individual migrations");
      options.verbose && console.log(`- Rollback limit: ${migrationLimit}`);
    } else {
      options.verbose && console.log("- Mode: rolling back by batch");
      options.verbose && console.log(`- Batch number: ${lastBatch}`);
    }
    options.verbose &&
      console.log(`- Including seeds (always included in rollback)`);

    for (let i = 0; i < validMigrationsToRollback.length; i++) {
      const mod = resolvedModules[i];
      if (isRejected(mod)) {
        throw new Error(`[Module Load Error] ${mod.reason}`);
      }
      if (typeof mod.value.down !== "function") {
        throw new Error(
          `[Migration Malformed Error] ${validMigrationsToRollback[i].name} does not have "down" method`
        );
      }

      const runStart = Date.now();
      await mod.value.down(db);
      const runEnd = Date.now();

      await db.runAsync("DELETE FROM migrations WHERE name = ?", [
        validMigrationsToRollback[i].name,
      ]);

      rollbackCount += 1;
      options.verbose &&
        console.log(
          `- ▼ ${validMigrationsToRollback[i].name} [${runEnd - runStart}ms]`
        );
    }
  } finally {
    if (thisRunInitiatedTheLock) {
      try {
        await db.runAsync("UPDATE migration_lock SET is_locked = 0");
      } catch (e: any) {
        throw new Error(
          `[Migration Unlock Error] Could not unlock migrations - ${e.toString()}`
        );
      }
    }
  }

  options.verbose &&
    console.log(
      `\nRan ${rollbackCount} ${
        rollbackCount === 1 ? "migration" : "migrations"
      } rollback`
    );
}
