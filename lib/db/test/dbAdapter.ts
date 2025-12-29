/**
 * Database adapter for testing
 *
 * Allows migration tests to work with both expo-sqlite (in app)
 * and better-sqlite3 (in Node.js test scripts)
 */

import Database from "better-sqlite3";
import { SQLiteDatabase } from "expo-sqlite";

export type TestDatabase = {
  execAsync: (sql: string) => Promise<void>;
  runAsync: (sql: string, params?: any[]) => Promise<any>;
  getAllAsync: <T = any>(sql: string, params?: any[]) => Promise<T[]>;
  getFirstAsync: <T = any>(sql: string, params?: any[]) => Promise<T | null>;
  closeAsync: () => Promise<void>;
};

/**
 * Create a test database adapter using better-sqlite3
 */
export function createTestDatabase(path: string): TestDatabase {
  const db = new Database(path);

  return {
    async execAsync(sql: string) {
      db.exec(sql);
    },
    async runAsync(sql: string, params?: any[]) {
      const stmt = db.prepare(sql);
      const result = params ? stmt.run(...params) : stmt.run();
      return result;
    },
    async getAllAsync<T = any>(sql: string, params?: any[]): Promise<T[]> {
      const stmt = db.prepare(sql);
      return (params ? stmt.all(...params) : stmt.all()) as T[];
    },
    async getFirstAsync<T = any>(
      sql: string,
      params?: any[],
    ): Promise<T | null> {
      const stmt = db.prepare(sql);
      const result = (params ? stmt.get(...params) : stmt.get()) as
        | T
        | undefined;
      return result ?? null;
    },
    async closeAsync() {
      db.close();
    },
  };
}

/**
 * Adapter for expo-sqlite database (used in app)
 */
export function adaptExpoDatabase(db: SQLiteDatabase): TestDatabase {
  return {
    execAsync: (sql: string) => db.execAsync(sql),
    runAsync: (sql: string, params?: any[]) =>
      params ? db.runAsync(sql, params) : db.runAsync(sql),
    getAllAsync: <T = any>(sql: string, params?: any[]) =>
      params ? db.getAllAsync<T>(sql, params) : db.getAllAsync<T>(sql),
    getFirstAsync: <T = any>(sql: string, params?: any[]) =>
      params ? db.getFirstAsync<T>(sql, params) : db.getFirstAsync<T>(sql),
    closeAsync: () => db.closeAsync(),
  };
}
