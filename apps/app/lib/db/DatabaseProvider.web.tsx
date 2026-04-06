/**
 * DatabaseProvider — Web / Tauri desktop backend
 *
 * Uses sql.js (SQLite compiled to WebAssembly) so the database works in both
 * a plain browser and inside Tauri's webview.
 *
 * Data is persisted to localStorage (serialized database) for development.
 * TODO: In production Tauri builds, switch to @tauri-apps/plugin-sql for
 * proper file-system-backed SQLite.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import initSqlJs, { type Database as SqlJsDatabase } from "sql.js-fts5";
import { migrateTo } from "./migrations";
import type {
  DatabaseAdapter,
  DatabaseContextValue,
  RunResult,
} from "./adapter";
import "./migrations/index"; // Register all migrations

const DB_STORAGE_KEY = "jot_sqljs_db";

// ---------------------------------------------------------------------------
// sql.js -> DatabaseAdapter bridge
// ---------------------------------------------------------------------------

function createSqlJsAdapter(
  db: SqlJsDatabase,
  persistFn: () => void,
): DatabaseAdapter {
  return {
    async execAsync(sql: string): Promise<void> {
      db.run(sql);
      persistFn();
    },

    async runAsync(sql: string, params?: unknown[]): Promise<RunResult> {
      db.run(sql, params as (string | number | null | Uint8Array)[]);
      const lastInsertRowId =
        (db.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0] as number) ??
        0;
      const changes = db.getRowsModified();
      persistFn();
      return { lastInsertRowId, changes };
    },

    async getAllAsync<T>(sql: string, params?: unknown[]): Promise<T[]> {
      const stmt = db.prepare(sql);
      stmt.bind(params as (string | number | null | Uint8Array)[]);
      const results: T[] = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject() as T);
      }
      stmt.free();
      return results;
    },

    async getFirstAsync<T>(sql: string, params?: unknown[]): Promise<T | null> {
      const stmt = db.prepare(sql);
      stmt.bind(params as (string | number | null | Uint8Array)[]);
      let result: T | null = null;
      if (stmt.step()) {
        result = stmt.getAsObject() as T;
      }
      stmt.free();
      return result;
    },

    async closeAsync(): Promise<void> {
      persistFn();
      db.close();
    },

    async withTransactionAsync(fn: () => Promise<void>): Promise<void> {
      db.run("BEGIN TRANSACTION");
      try {
        await fn();
        db.run("COMMIT");
        persistFn();
      } catch (error: unknown) {
        db.run("ROLLBACK");
        throw error;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Persistence helpers (IndexedDB for larger storage capacity)
// ---------------------------------------------------------------------------

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("jot_db_store", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("db");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadPersistedDb(): Promise<Uint8Array | null> {
  try {
    const idb = await openIDB();
    return new Promise((resolve) => {
      const tx = idb.transaction("db", "readonly");
      const store = tx.objectStore("db");
      const request = store.get(DB_STORAGE_KEY);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => resolve(null);
    });
  } catch {
    console.warn("[DatabaseProvider.web] Failed to load persisted database");
    return null;
  }
}

function createPersistFn(db: SqlJsDatabase): () => void {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      try {
        const data = db.export();
        const idb = await openIDB();
        const tx = idb.transaction("db", "readwrite");
        tx.objectStore("db").put(data, DB_STORAGE_KEY);
      } catch {
        console.warn("[DatabaseProvider.web] Failed to persist database");
      }
    }, 500);
  };
}

// ---------------------------------------------------------------------------
// React context
// ---------------------------------------------------------------------------

const DatabaseContext = createContext<DatabaseContextValue | null>(null);

interface DatabaseProviderProps {
  children: React.ReactNode;
  encryptionKey: string | null;
}

export const DatabaseProvider: React.FC<DatabaseProviderProps> = ({
  children,
}) => {
  const [adapter, setAdapter] = useState<DatabaseAdapter | null>(null);
  const [initError, setInitError] = useState<Error | null>(null);
  const isInitialized = useRef(false);

  useEffect(() => {
    if (isInitialized.current) {
      return;
    }

    const initialize = async () => {
      try {
        const SQL = await initSqlJs({
          locateFile: () => "/sql-wasm.wasm",
        });

        // Try to load a previously persisted database
        const existingData = await loadPersistedDb();
        const db = existingData
          ? new SQL.Database(existingData)
          : new SQL.Database();

        const persistFn = createPersistFn(db);
        const dbAdapter = createSqlJsAdapter(db, persistFn);

        // Run migrations
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrateTo currently types its parameter as SQLiteDatabase; the adapter is structurally compatible
        await migrateTo(dbAdapter as any, Number.POSITIVE_INFINITY, {
          verbose: true,
        });

        isInitialized.current = true;
        setAdapter(dbAdapter);
        console.log("Database ready (sql.js WebAssembly backend)");
      } catch (error: unknown) {
        console.error("Failed to initialize database:", error);
        setInitError(error as Error);
      }
    };

    initialize();
  }, []);

  if (initError) {
    return null;
  }

  if (!adapter) {
    return null;
  }

  return (
    <DatabaseContext.Provider value={adapter}>
      {children}
    </DatabaseContext.Provider>
  );
};

/**
 * Hook to access the database adapter.
 *
 * Matches the export name used by the native provider so that consuming code
 * can import `useDatabase` from `"./DatabaseProvider"` on both platforms.
 */
export function useDatabase(): DatabaseContextValue {
  const ctx = useContext(DatabaseContext);
  if (!ctx) {
    throw new Error("useDatabase must be used within a <DatabaseProvider>");
  }
  return ctx;
}
