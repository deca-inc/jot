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
  // E2EE fields
  isEncrypted: boolean;
  wrappedDek: string | null;
  dekNonce: string | null;
  dekAuthTag: string | null;
  contentNonce: string | null;
  contentAuthTag: string | null;
}

export interface CreateAssetInput {
  id: string;
  userId: string;
  entryId: string;
  filename: string;
  mimeType: string;
  size: number;
  storagePath: string;
  createdAt: number;
  // E2EE fields (optional for backwards compatibility)
  isEncrypted?: boolean;
  wrappedDek?: string;
  dekNonce?: string;
  dekAuthTag?: string;
  contentNonce?: string;
  contentAuthTag?: string;
}

/**
 * Repository for managing uploaded assets
 */
export class AssetRepository {
  constructor(private db: Database.Database) {
    this.ensureTable();
  }

  private ensureTable(): void {
    // Check if table exists first (it may be created by migrations with encryption columns)
    const tableExists = this.db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='assets'
    `).get();

    if (!tableExists) {
      // Create table with all columns including encryption
      this.db.exec(`
        CREATE TABLE assets (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          entry_id TEXT NOT NULL,
          filename TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          size INTEGER NOT NULL,
          storage_path TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          is_encrypted INTEGER DEFAULT 0,
          wrapped_dek TEXT,
          dek_nonce TEXT,
          dek_auth_tag TEXT,
          content_nonce TEXT,
          content_auth_tag TEXT,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);

      // Create indexes
      this.db.exec(`
        CREATE INDEX idx_assets_user_id ON assets(user_id);
        CREATE INDEX idx_assets_entry_id ON assets(entry_id);
      `);
    }
  }

  /**
   * Create a new asset record
   */
  create(asset: CreateAssetInput): void {
    const stmt = this.db.prepare(`
      INSERT INTO assets (
        id, user_id, entry_id, filename, mime_type, size, storage_path, created_at,
        is_encrypted, wrapped_dek, dek_nonce, dek_auth_tag, content_nonce, content_auth_tag
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      asset.isEncrypted ? 1 : 0,
      asset.wrappedDek ?? null,
      asset.dekNonce ?? null,
      asset.dekAuthTag ?? null,
      asset.contentNonce ?? null,
      asset.contentAuthTag ?? null,
    );
  }

  /**
   * Get an asset by ID
   */
  getById(id: string): Asset | null {
    const stmt = this.db.prepare(`
      SELECT id, user_id, entry_id, filename, mime_type, size, storage_path, created_at,
             is_encrypted, wrapped_dek, dek_nonce, dek_auth_tag, content_nonce, content_auth_tag
      FROM assets WHERE id = ?
    `);

    const row = stmt.get(id) as AssetRow | undefined;

    if (!row) return null;

    return this.mapRow(row);
  }

  /**
   * Get an asset by ID for a specific user
   */
  getByIdForUser(id: string, userId: string): Asset | null {
    const stmt = this.db.prepare(`
      SELECT id, user_id, entry_id, filename, mime_type, size, storage_path, created_at,
             is_encrypted, wrapped_dek, dek_nonce, dek_auth_tag, content_nonce, content_auth_tag
      FROM assets WHERE id = ? AND user_id = ?
    `);

    const row = stmt.get(id, userId) as AssetRow | undefined;

    if (!row) return null;

    return this.mapRow(row);
  }

  /**
   * Get all assets for an entry
   */
  getByEntryId(entryId: string, userId: string): Asset[] {
    const stmt = this.db.prepare(`
      SELECT id, user_id, entry_id, filename, mime_type, size, storage_path, created_at,
             is_encrypted, wrapped_dek, dek_nonce, dek_auth_tag, content_nonce, content_auth_tag
      FROM assets WHERE entry_id = ? AND user_id = ?
      ORDER BY created_at DESC
    `);

    const rows = stmt.all(entryId, userId) as AssetRow[];

    return rows.map((row) => this.mapRow(row));
  }

  /**
   * Get all assets for a user
   */
  getByUserId(userId: string, limit = 100, offset = 0): Asset[] {
    const stmt = this.db.prepare(`
      SELECT id, user_id, entry_id, filename, mime_type, size, storage_path, created_at,
             is_encrypted, wrapped_dek, dek_nonce, dek_auth_tag, content_nonce, content_auth_tag
      FROM assets WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `);

    const rows = stmt.all(userId, limit, offset) as AssetRow[];

    return rows.map((row) => this.mapRow(row));
  }

  /**
   * Get all encrypted assets for a user (for key rotation)
   */
  getEncryptedAssetsByUserId(userId: string): Asset[] {
    const stmt = this.db.prepare(`
      SELECT id, user_id, entry_id, filename, mime_type, size, storage_path, created_at,
             is_encrypted, wrapped_dek, dek_nonce, dek_auth_tag, content_nonce, content_auth_tag
      FROM assets WHERE user_id = ? AND is_encrypted = 1
    `);

    const rows = stmt.all(userId) as AssetRow[];

    return rows.map((row) => this.mapRow(row));
  }

  /**
   * Update encryption keys for an asset (for key rotation)
   */
  updateEncryptionKeys(
    id: string,
    wrappedDek: string,
    dekNonce: string,
    dekAuthTag: string,
  ): boolean {
    const stmt = this.db.prepare(`
      UPDATE assets
      SET wrapped_dek = ?, dek_nonce = ?, dek_auth_tag = ?
      WHERE id = ?
    `);
    const result = stmt.run(wrappedDek, dekNonce, dekAuthTag, id);
    return result.changes > 0;
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

  private mapRow(row: AssetRow): Asset {
    return {
      id: row.id,
      userId: row.user_id,
      entryId: row.entry_id,
      filename: row.filename,
      mimeType: row.mime_type,
      size: row.size,
      storagePath: row.storage_path,
      createdAt: row.created_at,
      isEncrypted: row.is_encrypted === 1,
      wrappedDek: row.wrapped_dek,
      dekNonce: row.dek_nonce,
      dekAuthTag: row.dek_auth_tag,
      contentNonce: row.content_nonce,
      contentAuthTag: row.content_auth_tag,
    };
  }
}

// Internal row type for database queries
interface AssetRow {
  id: string;
  user_id: string;
  entry_id: string;
  filename: string;
  mime_type: string;
  size: number;
  storage_path: string;
  created_at: number;
  is_encrypted: number | null;
  wrapped_dek: string | null;
  dek_nonce: string | null;
  dek_auth_tag: string | null;
  content_nonce: string | null;
  content_auth_tag: string | null;
}
