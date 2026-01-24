/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * SQLite Test Database Utilities
 *
 * Provides easy setup for testing with a real in-memory SQLite database.
 * No mocking needed - tests run against real SQLite.
 *
 * Usage in Jest tests:
 *
 * ```typescript
 * import { setupTestDatabase, TestDatabaseContext } from "../test/testDatabase";
 *
 * describe("MyRepository", () => {
 *   let ctx: TestDatabaseContext;
 *
 *   beforeEach(async () => {
 *     ctx = await setupTestDatabase();
 *   });
 *
 *   afterEach(async () => {
 *     await ctx.cleanup();
 *   });
 *
 *   it("should insert and query data", async () => {
 *     await ctx.db.runAsync("INSERT INTO entries (title, type) VALUES (?, ?)", ["Test", "journal"]);
 *     const entries = await ctx.db.getAllAsync("SELECT * FROM entries");
 *     expect(entries).toHaveLength(1);
 *   });
 * });
 * ```
 */

import Database from "better-sqlite3";
import { allMigrations } from "../migrations/index";
import { TestDatabase } from "./dbAdapter";

export interface TestDatabaseContext {
  /** The database instance with async interface matching expo-sqlite */
  db: TestDatabase;
  /** The underlying better-sqlite3 instance for advanced usage */
  rawDb: Database.Database;
  /** Clean up the database (call in afterEach) */
  cleanup: () => Promise<void>;
  /** Reset database to fresh state with migrations (call if needed mid-test) */
  reset: () => Promise<void>;
}

/**
 * Create an in-memory SQLite database with all migrations applied.
 * Call this in beforeEach for a fresh database per test.
 *
 * @param options.seeds - Include seed data (default: false)
 * @returns Database context with db instance and cleanup function
 */
export async function setupTestDatabase(options?: {
  seeds?: boolean;
}): Promise<TestDatabaseContext> {
  const rawDb = new Database(":memory:");

  // Create async adapter matching expo-sqlite interface
  const db: TestDatabase = {
    async execAsync(sql: string) {
      rawDb.exec(sql);
    },
    async runAsync(sql: string, params?: any[]) {
      const stmt = rawDb.prepare(sql);
      const result = params ? stmt.run(...params) : stmt.run();
      return result;
    },
    async getAllAsync<T = any>(sql: string, params?: any[]): Promise<T[]> {
      const stmt = rawDb.prepare(sql);
      return (params ? stmt.all(...params) : stmt.all()) as T[];
    },
    async getFirstAsync<T = any>(
      sql: string,
      params?: any[],
    ): Promise<T | null> {
      const stmt = rawDb.prepare(sql);
      const result = (params ? stmt.get(...params) : stmt.get()) as
        | T
        | undefined;
      return result ?? null;
    },
    async closeAsync() {
      rawDb.close();
    },
  };

  // Run all migrations
  await runMigrations(db, options?.seeds ?? false);

  const reset = async () => {
    // Drop all tables and re-run migrations
    const tables = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    );
    for (const { name } of tables) {
      await db.execAsync(`DROP TABLE IF EXISTS "${name}"`);
    }
    await runMigrations(db, options?.seeds ?? false);
  };

  const cleanup = async () => {
    rawDb.close();
  };

  return { db, rawDb, cleanup, reset };
}

/**
 * Run all migrations on the database
 */
async function runMigrations(
  db: TestDatabase,
  includeSeeds: boolean,
): Promise<void> {
  // Create migrations table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      batch INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    );
  `);

  // Filter out seeds unless requested
  const migrationsToRun = allMigrations.filter(({ name }) => {
    return includeSeeds || !name.startsWith("seeds/");
  });

  const batch = 1;
  for (const { name, module } of migrationsToRun) {
    // The migration's up() function expects an SQLiteDatabase, but our adapter
    // is compatible. Cast to any to satisfy TypeScript.
    await module.up(db as any);
    await db.runAsync("INSERT INTO migrations (name, batch) VALUES (?, ?)", [
      name,
      batch,
    ]);
  }
}

/**
 * Helper to create a Jest test suite with automatic database setup/teardown.
 *
 * Usage:
 * ```typescript
 * import { withTestDatabase } from "../test/testDatabase";
 *
 * withTestDatabase((getCtx) => {
 *   it("should work with database", async () => {
 *     const { db } = getCtx();
 *     // ... test code
 *   });
 * });
 * ```
 */
export function withTestDatabase(
  testFn: (getContext: () => TestDatabaseContext) => void,
  options?: { seeds?: boolean },
): void {
  let ctx: TestDatabaseContext;

  beforeEach(async () => {
    ctx = await setupTestDatabase(options);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  testFn(() => ctx);
}
