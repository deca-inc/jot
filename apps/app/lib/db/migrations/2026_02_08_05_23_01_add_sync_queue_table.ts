import { type MigrationRunner } from "../migrationTypes";

/**
 * Add sync_queue table for persistent offline sync queue.
 *
 * Features:
 * - Priority ordering: deletions > creates > updates
 * - Retry with exponential backoff
 * - Coalescing of pending updates
 */
export const up: MigrationRunner = async (db) => {
  // Create sync_queue table
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id INTEGER,
      entry_uuid TEXT NOT NULL,
      operation TEXT NOT NULL,
      priority INTEGER DEFAULT 1,
      payload TEXT,
      entry_updated_at_when_queued INTEGER,
      status TEXT DEFAULT 'pending',
      error TEXT,
      retry_count INTEGER DEFAULT 0,
      next_retry_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      processed_at INTEGER
    );
  `);
  // entry_id can be NULL for deletions (entry already removed)
  // operation values: create | update | delete
  // priority values: 3=delete, 2=create, 1=update
  // status values: pending | processing | completed | failed

  // Create indexes for efficient querying
  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
  `);

  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_sync_queue_entry_uuid ON sync_queue(entry_uuid);
  `);

  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_sync_queue_priority ON sync_queue(priority DESC, created_at ASC);
  `);

  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_sync_queue_next_retry ON sync_queue(next_retry_at);
  `);
};

export const down: MigrationRunner = async (db) => {
  // Drop indexes
  await db.execAsync(`DROP INDEX IF EXISTS idx_sync_queue_status;`);
  await db.execAsync(`DROP INDEX IF EXISTS idx_sync_queue_entry_uuid;`);
  await db.execAsync(`DROP INDEX IF EXISTS idx_sync_queue_priority;`);
  await db.execAsync(`DROP INDEX IF EXISTS idx_sync_queue_next_retry;`);

  // Drop table
  await db.execAsync(`DROP TABLE IF EXISTS sync_queue;`);
};
