/**
 * Jest setup file for database tests.
 * Mocks expo modules so Jest doesn't try to parse ESM.
 * Actual database operations use better-sqlite3 via testDatabase.ts
 */

// Mock expo-sqlite - we use better-sqlite3 for testing
jest.mock("expo-sqlite", () => ({
  SQLiteDatabase: class {},
  SQLiteProvider: ({ children }: { children: unknown }) => children,
  useSQLiteContext: () => ({}),
}));

// Mock expo-file-system
jest.mock("expo-file-system", () => ({
  Paths: {
    document: "/mock/documents",
    cache: "/mock/cache",
  },
  documentDirectory: "/mock/documents/",
  cacheDirectory: "/mock/cache/",
}));

// Mock DatabaseProvider - we use testDatabase.ts instead
jest.mock("../DatabaseProvider", () => ({
  useDatabase: () => ({}),
  DatabaseProvider: ({ children }: { children: unknown }) => children,
}));
