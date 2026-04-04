/**
 * Web shim for expo-sqlite
 *
 * Re-exports useDatabase from the web DatabaseProvider as useSQLiteContext
 * so code importing directly from expo-sqlite works on web.
 */

import React from "react";

// Import useDatabase from the web provider (webpack resolves .web.tsx)
import { useDatabase } from "../db/DatabaseProvider.web";

// Re-export as useSQLiteContext to match expo-sqlite's API
export const useSQLiteContext = useDatabase;

// Stub SQLiteProvider — not used on web (our DatabaseProvider.web handles init)
export function SQLiteProvider({ children }: { children: React.ReactNode }) {
  return children;
}

// Stub openDatabaseSync for any code that uses it
export function openDatabaseSync() {
  throw new Error("openDatabaseSync is not available on web");
}
