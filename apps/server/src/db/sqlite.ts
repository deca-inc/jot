/**
 * SQLite adapter using Bun's built-in SQLite
 */

import { Database as BunDatabase } from "bun:sqlite";

// Extend Bun's Database to add better-sqlite3 compatible pragma() method
class Database extends BunDatabase {
  pragma(sql: string): unknown {
    const result = this.query(`PRAGMA ${sql}`).all();
    // Return single value for simple pragmas
    if (result.length === 1 && typeof result[0] === "object") {
      const values = Object.values(result[0] as Record<string, unknown>);
      if (values.length === 1) return values[0];
    }
    return result;
  }
}

// Type alias for backwards compatibility with better-sqlite3 style
// eslint-disable-next-line @typescript-eslint/no-namespace
namespace Database {
  export type Database = InstanceType<typeof import("./sqlite.js").default>;
}

export default Database;
export { Database };
