import {
  SQLiteProvider,
  useSQLiteContext,
  type SQLiteDatabase,
} from "expo-sqlite";
import React, { Suspense, useCallback } from "react";
import { logDatabasePath } from "./databasePath";
import { migrateTo } from "./migrations";
import "./migrations/index"; // Register all migrations

const DATABASE_NAME = "journal.db";

interface DatabaseProviderProps {
  children: React.ReactNode;
  encryptionKey: string | null;
}

export const DatabaseProvider: React.FC<DatabaseProviderProps> = ({
  children,
  encryptionKey,
}) => {
  if (!encryptionKey) {
    throw new Error("Encryption key is required for SQLCipher");
  }

  // Stable callback — encryptionKey is set once and never changes.
  // Using useSuspense mode avoids the useEffect-based teardown in the
  // default SQLiteProvider, which closes the DB during React strict-mode
  // cleanup and causes "Access to closed resource" errors.
  const onInit = useCallback(
    async (db: SQLiteDatabase) => {
      // Set encryption key (must be the first operation)
      console.log("Setting encryption key, length:", encryptionKey.length);
      await db.execAsync(`PRAGMA key = '${encryptionKey}';`);
      console.log("Database encryption key set");

      // Verify database can be decrypted with this key
      try {
        await db.getFirstAsync("SELECT count(*) FROM sqlite_master");
        console.log("Database decryption successful");
      } catch (decryptError) {
        console.error(
          "Database decryption failed - key mismatch detected:",
          decryptError,
        );
        console.log(
          "Continuing with existing encryption key on fresh database",
        );
      }

      // Log database path for debugging
      await logDatabasePath(db, DATABASE_NAME);

      // Run migrations
      await migrateTo(db, Number.POSITIVE_INFINITY, { verbose: true });
      console.log("Database ready");
    },
    [encryptionKey],
  );

  return (
    <Suspense fallback={null}>
      <SQLiteProvider databaseName={DATABASE_NAME} useSuspense onInit={onInit}>
        {children}
      </SQLiteProvider>
    </Suspense>
  );
};

// Re-export the hook for convenience
export { useSQLiteContext as useDatabase };
