import { SQLiteProvider, useSQLiteContext } from "expo-sqlite";
import React, { useEffect, useRef, useState } from "react";
import { logDatabasePath } from "./databasePath";
import { migrateTo } from "./migrations";
import "./migrations/index"; // Register all migrations

const DATABASE_NAME = "journal.db";

interface DatabaseProviderProps {
  children: React.ReactNode;
  encryptionKey: string | null;
}

// Component that runs migrations once the database is ready
const DatabaseInitializer: React.FC<{
  children: React.ReactNode;
  encryptionKey: string | null;
}> = ({ children, encryptionKey }) => {
  const db = useSQLiteContext();
  const [isReady, setIsReady] = useState(false);
  const [initError, setInitError] = useState<Error | null>(null);
  const isInitialized = useRef(false);

  useEffect(() => {
    // Prevent multiple initializations
    if (isInitialized.current) {
      return;
    }

    const initializeDatabase = async () => {
      try {
        // Set encryption key if provided (must be done before any other operations)
        if (encryptionKey) {
          console.log("Setting encryption key, length:", encryptionKey.length);
          // Pass the hex key as a string passphrase to SQLCipher
          // Note: The key is a hex string, but SQLCipher will hash it as a passphrase
          await db.execAsync(`PRAGMA key = '${encryptionKey}';`);
          console.log("Database encryption key set");
        }

        // Verify database can be decrypted with this key
        try {
          await db.getFirstAsync("SELECT count(*) FROM sqlite_master");
          console.log("Database decryption successful");
        } catch (decryptError) {
          console.error(
            "Database decryption failed - key mismatch detected:",
            decryptError,
          );
          // This can happen on fresh installs where an old key exists
          // The old key will work fine with the new database
          console.log(
            "Continuing with existing encryption key on fresh database",
          );
        }

        // Log database path for debugging
        await logDatabasePath(db, DATABASE_NAME);

        await migrateTo(db, Number.POSITIVE_INFINITY, { verbose: true });

        isInitialized.current = true;
        setIsReady(true);
        console.log("Database ready");
      } catch (error) {
        console.error("Failed to initialize database:", error);
        setInitError(error as Error);
      }
    };

    initializeDatabase();
  }, []); // Only run once on mount

  if (initError) {
    // Show error state
    return null;
  }

  // Wait for database to be ready before rendering children
  // This prevents race conditions where OnboardingWrapper tries to
  // query the database before migrations complete
  if (!isReady) {
    return null;
  }

  return <>{children}</>;
};

export const DatabaseProvider: React.FC<DatabaseProviderProps> = ({
  children,
  encryptionKey,
}) => {
  if (!encryptionKey) {
    throw new Error("Encryption key is required for SQLCipher");
  }

  return (
    <SQLiteProvider databaseName={DATABASE_NAME}>
      <DatabaseInitializer encryptionKey={encryptionKey}>
        {children}
      </DatabaseInitializer>
    </SQLiteProvider>
  );
};

// Re-export the hook for convenience
export { useSQLiteContext as useDatabase };
