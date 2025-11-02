import React, { useEffect } from "react";
import { SQLiteProvider, useSQLiteContext } from "expo-sqlite";
import { migrateTo } from "./migrations";
import { logDatabasePath } from "./databasePath";
import "./migrations/index"; // Register all migrations

const DATABASE_NAME = "journal.db";

interface DatabaseProviderProps {
  children: React.ReactNode;
}

// Component that runs migrations once the database is ready
const DatabaseInitializer: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const db = useSQLiteContext();

  useEffect(() => {
    const runMigrations = async () => {
      try {
        // Log database path for debugging
        await logDatabasePath(db, DATABASE_NAME);

        await migrateTo(db, Number.POSITIVE_INFINITY, { verbose: true });
      } catch (error) {
        console.error("Failed to run migrations:", error);
      }
    };

    runMigrations();
  }, [db]);

  return <>{children}</>;
};

export const DatabaseProvider: React.FC<DatabaseProviderProps> = ({
  children,
}) => {
  return (
    <SQLiteProvider
      databaseName={DATABASE_NAME}
      onInit={async () => {
        console.log(`Database initialized: ${DATABASE_NAME}`);
      }}
    >
      <DatabaseInitializer>{children}</DatabaseInitializer>
    </SQLiteProvider>
  );
};

// Re-export the hook for convenience
export { useSQLiteContext as useDatabase };
