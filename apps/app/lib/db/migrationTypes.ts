import { SQLiteDatabase } from "expo-sqlite";

export type MigrationRunner = (db: SQLiteDatabase) => Promise<void>;

export interface MigrationModule {
  up: MigrationRunner;
  down: MigrationRunner;
}

/**
 * Logger for migrations that respects test environment.
 * Suppresses logs during Jest tests to keep output clean.
 */
export function migrationLog(...args: unknown[]): void {
  // Suppress logs in test environment
  if (typeof process !== "undefined" && process.env.NODE_ENV === "test") {
    return;
  }
  console.log(...args);
}
