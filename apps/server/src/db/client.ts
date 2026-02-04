import * as fs from "fs";
import * as path from "path";
import Database from "better-sqlite3";
import { migrateTo } from "./migrations.js";
// Import migrations to register them
import "./migrations/index.js";

let db: Database.Database | null = null;

export interface DatabaseOptions {
  dataDir?: string;
  verbose?: boolean;
}

/**
 * Get or create the database connection
 */
export function getDatabase(options: DatabaseOptions = {}): Database.Database {
  if (db) {
    return db;
  }

  const dataDir = options.dataDir || "./data";
  const dbPath = path.join(dataDir, "jot-server.db");

  // Ensure data directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  db = new Database(dbPath);

  // Enable WAL mode for better concurrency
  db.pragma("journal_mode = WAL");

  // Run migrations
  migrateTo(db, Number.POSITIVE_INFINITY, {
    verbose: options.verbose ?? false,
  });

  return db;
}

/**
 * Create an in-memory database for testing
 */
export function createTestDatabase(options: { verbose?: boolean } = {}): Database.Database {
  const testDb = new Database(":memory:");

  // Run migrations
  migrateTo(testDb, Number.POSITIVE_INFINITY, {
    verbose: options.verbose ?? false,
  });

  return testDb;
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Get the current database instance (throws if not initialized)
 */
export function requireDatabase(): Database.Database {
  if (!db) {
    throw new Error("Database not initialized. Call getDatabase() first.");
  }
  return db;
}
