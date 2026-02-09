import Database from "better-sqlite3";

export interface Asset {
  id: string;
  userId: string;
  entryId: string;
  filename: string;
  mimeType: string;
  size: number;
  storagePath: string;
  createdAt: number;
}

/**
 * Repository for managing uploaded assets
 */
export class AssetRepository {
  constructor(private db: Database.Database) {
    this.ensureTable();
  }

  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        entry_id TEXT NOT NULL,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        storage_path TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_assets_user_id ON assets(user_id);
      CREATE INDEX IF NOT EXISTS idx_assets_entry_id ON assets(entry_id);
    `);
  }

  /**
   * Create a new asset record
   */
  create(asset: Asset): void {
    const stmt = this.db.prepare(`
      INSERT INTO assets (id, user_id, entry_id, filename, mime_type, size, storage_path, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      asset.id,
      asset.userId,
      asset.entryId,
      asset.filename,
      asset.mimeType,
      asset.size,
      asset.storagePath,
      asset.createdAt,
    );
  }

  /**
   * Get an asset by ID
   */
  getById(id: string): Asset | null {
    const stmt = this.db.prepare(`
      SELECT id, user_id, entry_id, filename, mime_type, size, storage_path, created_at
      FROM assets WHERE id = ?
    `);

    const row = stmt.get(id) as {
      id: string;
      user_id: string;
      entry_id: string;
      filename: string;
      mime_type: string;
      size: number;
      storage_path: string;
      created_at: number;
    } | undefined;

    if (!row) return null;

    return this.mapRow(row);
  }

  /**
   * Get an asset by ID for a specific user
   */
  getByIdForUser(id: string, userId: string): Asset | null {
    const stmt = this.db.prepare(`
      SELECT id, user_id, entry_id, filename, mime_type, size, storage_path, created_at
      FROM assets WHERE id = ? AND user_id = ?
    `);

    const row = stmt.get(id, userId) as {
      id: string;
      user_id: string;
      entry_id: string;
      filename: string;
      mime_type: string;
      size: number;
      storage_path: string;
      created_at: number;
    } | undefined;

    if (!row) return null;

    return this.mapRow(row);
  }

  /**
   * Get all assets for an entry
   */
  getByEntryId(entryId: string, userId: string): Asset[] {
    const stmt = this.db.prepare(`
      SELECT id, user_id, entry_id, filename, mime_type, size, storage_path, created_at
      FROM assets WHERE entry_id = ? AND user_id = ?
      ORDER BY created_at DESC
    `);

    const rows = stmt.all(entryId, userId) as Array<{
      id: string;
      user_id: string;
      entry_id: string;
      filename: string;
      mime_type: string;
      size: number;
      storage_path: string;
      created_at: number;
    }>;

    return rows.map(this.mapRow);
  }

  /**
   * Get all assets for a user
   */
  getByUserId(userId: string, limit = 100, offset = 0): Asset[] {
    const stmt = this.db.prepare(`
      SELECT id, user_id, entry_id, filename, mime_type, size, storage_path, created_at
      FROM assets WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `);

    const rows = stmt.all(userId, limit, offset) as Array<{
      id: string;
      user_id: string;
      entry_id: string;
      filename: string;
      mime_type: string;
      size: number;
      storage_path: string;
      created_at: number;
    }>;

    return rows.map(this.mapRow);
  }

  /**
   * Get total storage used by a user
   */
  getTotalStorageByUser(userId: string): number {
    const stmt = this.db.prepare(`
      SELECT COALESCE(SUM(size), 0) as total FROM assets WHERE user_id = ?
    `);

    const result = stmt.get(userId) as { total: number } | undefined;
    return result?.total ?? 0;
  }

  /**
   * Delete an asset
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare(`DELETE FROM assets WHERE id = ?`);
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Delete an asset for a specific user
   */
  deleteForUser(id: string, userId: string): boolean {
    const stmt = this.db.prepare(`DELETE FROM assets WHERE id = ? AND user_id = ?`);
    const result = stmt.run(id, userId);
    return result.changes > 0;
  }

  /**
   * Delete all assets for an entry
   */
  deleteByEntryId(entryId: string, userId: string): number {
    const stmt = this.db.prepare(`DELETE FROM assets WHERE entry_id = ? AND user_id = ?`);
    const result = stmt.run(entryId, userId);
    return result.changes;
  }

  private mapRow(row: {
    id: string;
    user_id: string;
    entry_id: string;
    filename: string;
    mime_type: string;
    size: number;
    storage_path: string;
    created_at: number;
  }): Asset {
    return {
      id: row.id,
      userId: row.user_id,
      entryId: row.entry_id,
      filename: row.filename,
      mimeType: row.mime_type,
      size: row.size,
      storagePath: row.storage_path,
      createdAt: row.created_at,
    };
  }
}
