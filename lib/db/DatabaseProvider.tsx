import React, { useEffect, useRef } from "react";
import { SQLiteProvider, useSQLiteContext } from "expo-sqlite";
import { migrateTo } from "./migrations";
import { logDatabasePath } from "./databasePath";
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
  const isInitialized = useRef(false);

  useEffect(() => {
    // Prevent multiple initializations
    if (isInitialized.current) {
      return;
    }

    const initializeDatabase = async () => {
      try {
        // Set encryption key if provided
        if (encryptionKey) {
          await db.execAsync(`PRAGMA key = '${encryptionKey}'`);
          console.log("Database encryption key set");
        }

        // Log database path for debugging
        await logDatabasePath(db, DATABASE_NAME);

        await migrateTo(db, Number.POSITIVE_INFINITY, { verbose: true });
        isInitialized.current = true;
      } catch (error) {
        console.error("Failed to initialize database:", error);
        throw error; // Re-throw to allow error handling upstream
      }
    };

    initializeDatabase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  return <>{children}</>;
};

export const DatabaseProvider: React.FC<DatabaseProviderProps> = ({
  children,
  encryptionKey,
}) => {
  return (
    <SQLiteProvider
      databaseName={DATABASE_NAME}
      onInit={async () => {
        console.log(`Database initialized: ${DATABASE_NAME}`);
      }}
    >
      <DatabaseInitializer encryptionKey={encryptionKey}>
        {children}
      </DatabaseInitializer>
    </SQLiteProvider>
  );
};

// Re-export the hook for convenience
export { useSQLiteContext as useDatabase };
