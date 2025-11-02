import { SQLiteDatabase } from "expo-sqlite";

export type MigrationRunner = (db: SQLiteDatabase) => Promise<void>;

export interface MigrationModule {
  up: MigrationRunner;
  down: MigrationRunner;
}
