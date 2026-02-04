import Database from "better-sqlite3";

export type MigrationRunner = (db: Database.Database) => void;

export interface MigrationModule {
  up: MigrationRunner;
  down: MigrationRunner;
}
