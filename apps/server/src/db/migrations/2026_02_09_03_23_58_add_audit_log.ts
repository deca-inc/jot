import type { MigrationRunner } from "../migrationTypes.js";

/**
 * Add audit log table for security tracking
 *
 * Logs security-relevant events like document access, login, logout, key rotation.
 */
export const up: MigrationRunner = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      resource_type TEXT,
      resource_id TEXT,
      ip_address TEXT,
      timestamp INTEGER NOT NULL,
      metadata JSON
    );

    CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp);
    CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
  `);
};

export const down: MigrationRunner = (db) => {
  db.exec(`
    DROP TABLE IF EXISTS audit_log;
  `);
};
