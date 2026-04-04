/**
 * Database adapter interface
 *
 * Abstracts the underlying SQLite implementation so the app can use
 * different backends depending on the platform:
 *   - expo-sqlite (React Native / mobile / macOS via RN)
 *   - @tauri-apps/plugin-sql (Tauri desktop)
 *   - better-sqlite3 (Node.js tests)
 *
 * Every method mirrors the expo-sqlite SQLiteDatabase API surface that
 * the app actually uses, keeping consuming code unchanged.
 */

/** Result returned by write operations (INSERT / UPDATE / DELETE). */
export interface RunResult {
  /** Row ID of the last inserted row (0 when not an INSERT). */
  lastInsertRowId: number;
  /** Number of rows affected by the statement. */
  changes: number;
}

/**
 * Minimal async SQLite interface used throughout the app.
 *
 * Implementations must translate their underlying driver's API to match
 * these signatures so that repository classes, migration runners, and
 * hooks can work without knowing which driver is in use.
 */
export interface DatabaseAdapter {
  /** Execute one or more SQL statements that return no rows (DDL, PRAGMA, etc.). */
  execAsync(sql: string): Promise<void>;

  /** Execute a single SQL statement that may modify data and return metadata. */
  runAsync(sql: string, params?: unknown[]): Promise<RunResult>;

  /** Execute a SELECT and return all matching rows. */
  getAllAsync<T>(sql: string, params?: unknown[]): Promise<T[]>;

  /** Execute a SELECT and return the first matching row, or null. */
  getFirstAsync<T>(sql: string, params?: unknown[]): Promise<T | null>;

  /** Close the database connection. */
  closeAsync(): Promise<void>;

  /**
   * Run a callback inside a database transaction.
   *
   * If the callback throws, the transaction is rolled back; otherwise it
   * is committed.  Implementations may use driver-level transactions or
   * manual BEGIN / COMMIT / ROLLBACK.
   */
  withTransactionAsync(fn: () => Promise<void>): Promise<void>;
}

/**
 * Value exposed through the React context by both the native and web
 * DatabaseProvider components.
 *
 * Right now it is simply the adapter itself, but wrapping it in a named
 * type makes it easy to extend later (e.g. adding a `ready` flag or
 * the database file path) without a breaking change.
 */
export type DatabaseContextValue = DatabaseAdapter;
