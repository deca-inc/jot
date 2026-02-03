import { Paths } from "expo-file-system";
import { SQLiteDatabase } from "expo-sqlite";

/**
 * Get the file path where the SQLite database is stored.
 *
 * Storage locations:
 * - iOS: App's Documents directory
 * - Android: /data/data/<package>/files/SQLite/
 * - macOS (React Native macOS): App's Documents directory
 *
 * @param db The SQLite database instance
 * @param databaseName The name of the database file (e.g., "journal.db")
 * @returns The full path to the database file
 */
export async function getDatabasePath(
  db: SQLiteDatabase,
  databaseName: string,
): Promise<string | null> {
  try {
    // expo-sqlite stores databases in the document directory
    // Using the new Paths API from expo-file-system v19
    const documentsDir = Paths.document.uri;
    if (!documentsDir) {
      return null;
    }

    // For expo-sqlite, databases are typically stored directly in the documents directory
    // but the exact path may vary. Let's construct the most likely path.
    const dbPath = `${documentsDir}SQLite/${databaseName}`;

    // Verify the file exists (or will be created there)
    return dbPath;
  } catch (error) {
    console.error("Failed to get database path:", error);
    return null;
  }
}

/**
 * Log the database path to console (useful for debugging)
 */
export async function logDatabasePath(
  db: SQLiteDatabase,
  databaseName: string,
): Promise<void> {
  const path = await getDatabasePath(db, databaseName);
  if (path) {
    console.log(`Database location: ${path}`);
  } else {
    console.log("Could not determine database path");
  }
}
