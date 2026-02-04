import Database from "better-sqlite3";
import { MigrationModule } from "./migrationTypes.js";

interface MigrationOptions {
  verbose: boolean;
}
const defaultOptions: MigrationOptions = { verbose: true };

// Helper for conditional logging
function log(options: MigrationOptions, ...args: unknown[]) {
  if (options.verbose) {
    console.log(...args);
  }
}

// Client-side lock to prevent concurrent migrations
let isMigrating = false;

function createTablesIfNotExists(db: Database.Database) {
  // Check if migrations table exists
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name = 'migrations'",
    )
    .all() as { name: string }[];

  if (tables.length > 0) {
    return;
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      batch INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );
  `);
}

// Migration registry - populated by migrations/index.ts
const migrationModules: Record<string, () => MigrationModule> = {};

export function registerMigration(
  name: string,
  module: () => MigrationModule,
) {
  migrationModules[name] = module;
}

export function migrateTo(
  db: Database.Database,
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
    createTablesIfNotExists(db);

    // Get existing migrations
    const existing = db
      .prepare("SELECT * FROM migrations ORDER BY id DESC")
      .all() as {
      id: number;
      name: string;
      batch: number;
    }[];

    const existingNames = new Set(existing.map((m) => m.name));
    const allMigrations = Object.keys(migrationModules).sort();

    const pendingMigrations = allMigrations.filter(
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
    const resolvedModules = migrationsToRun.map((name) => migrationModules[name]());

    // Wrap all migrations in a transaction
    const runMigrations = db.transaction(() => {
      for (let i = 0; i < migrationsToRun.length; i++) {
        const mod = resolvedModules[i];
        if (typeof mod.up !== "function") {
          throw new Error(
            `[Migration Malformed Error] ${migrationsToRun[i]} does not have "up" method`,
          );
        }

        const runStart = Date.now();
        mod.up(db);
        const runEnd = Date.now();

        // Record migration
        db.prepare(
          "INSERT INTO migrations (name, batch) VALUES (?, ?)",
        ).run(migrationsToRun[i], newBatch);

        log(options, `- ▲ ${migrationsToRun[i]} [${runEnd - runStart}ms]`);
      }
    });

    runMigrations();
  } finally {
    // Always release the client-side lock
    isMigrating = false;
  }
}

export function migrateBack(
  db: Database.Database,
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
    createTablesIfNotExists(db);

    const existing = db
      .prepare("SELECT * FROM migrations ORDER BY id DESC")
      .all() as {
      id: number;
      name: string;
      batch: number;
    }[];

    if (existing.length === 0) {
      log(options, "No migrations to roll back");
      return;
    }

    const lastBatch = existing[0].batch;
    const migrationsToRollback =
      typeof migrationLimit === "number"
        ? existing.slice(0, migrationLimit ?? existing.length)
        : existing.filter((migration) => migration.batch === lastBatch);

    // Filter migrations to rollback - only rollback migrations that exist in the registry
    const validMigrationsToRollback = migrationsToRollback.filter((migration) =>
      Object.prototype.hasOwnProperty.call(migrationModules, migration.name),
    );

    const resolvedModules = validMigrationsToRollback.map((migration) =>
      migrationModules[migration.name](),
    );

    if (typeof migrationLimit === "number") {
      log(options, "- Mode: rolling back individual migrations");
      log(options, `- Rollback limit: ${migrationLimit}`);
    } else {
      log(options, "- Mode: rolling back by batch");
      log(options, `- Batch number: ${lastBatch}`);
    }

    let rollbackCount = 0;

    // Wrap all rollbacks in a transaction
    const runRollbacks = db.transaction(() => {
      for (let i = 0; i < validMigrationsToRollback.length; i++) {
        const mod = resolvedModules[i];
        if (typeof mod.down !== "function") {
          throw new Error(
            `[Migration Malformed Error] ${validMigrationsToRollback[i].name} does not have "down" method`,
          );
        }

        const runStart = Date.now();
        mod.down(db);
        const runEnd = Date.now();

        db.prepare("DELETE FROM migrations WHERE name = ?").run(
          validMigrationsToRollback[i].name,
        );

        rollbackCount += 1;
        log(
          options,
          `- ▼ ${validMigrationsToRollback[i].name} [${runEnd - runStart}ms]`,
        );
      }
    });

    runRollbacks();

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
