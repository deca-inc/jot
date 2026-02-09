import Database from "better-sqlite3";

export interface DocumentMetadata {
  title?: string;
  type?: string;
  updatedBy?: string;
}

export interface Document {
  id: string;
  yjsState: Buffer | null;
  metadata: DocumentMetadata | null;
  userId: string | null;
  createdAt: number;
  updatedAt: number;
}

interface DocumentRow {
  id: string;
  yjs_state: Buffer | null;
  metadata: string | null;
  user_id: string | null;
  created_at: number;
  updated_at: number;
}

/**
 * Repository for Yjs document storage
 */
export class DocumentRepository {
  constructor(private db: Database.Database) {}

  /**
   * Get a document by ID
   */
  getById(id: string): Document | null {
    const row = this.db
      .prepare("SELECT * FROM documents WHERE id = ?")
      .get(id) as DocumentRow | undefined;

    if (!row) {
      return null;
    }

    return this.mapRowToDocument(row);
  }

  /**
   * Get a document by ID for a specific user
   */
  getByIdForUser(id: string, userId: string): Document | null {
    const row = this.db
      .prepare("SELECT * FROM documents WHERE id = ? AND user_id = ?")
      .get(id, userId) as DocumentRow | undefined;

    if (!row) {
      return null;
    }

    return this.mapRowToDocument(row);
  }

  /**
   * Get all documents
   */
  getAll(): Document[] {
    const rows = this.db
      .prepare("SELECT * FROM documents ORDER BY updated_at DESC")
      .all() as DocumentRow[];

    return rows.map((row) => this.mapRowToDocument(row));
  }

  /**
   * Get all documents for a specific user
   */
  getByUserId(userId: string): Document[] {
    const rows = this.db
      .prepare("SELECT * FROM documents WHERE user_id = ? ORDER BY updated_at DESC")
      .all(userId) as DocumentRow[];

    return rows.map((row) => this.mapRowToDocument(row));
  }

  /**
   * Create or update a document
   */
  upsert(
    id: string,
    yjsState: Buffer | null,
    metadata?: DocumentMetadata,
    userId?: string,
  ): Document {
    const now = Date.now();
    const metadataJson = metadata ? JSON.stringify(metadata) : null;

    this.db
      .prepare(
        `INSERT INTO documents (id, yjs_state, metadata, user_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           yjs_state = excluded.yjs_state,
           metadata = excluded.metadata,
           updated_at = excluded.updated_at`,
      )
      .run(id, yjsState, metadataJson, userId ?? null, now, now);

    const doc = this.getById(id);
    if (!doc) {
      throw new Error("Failed to retrieve upserted document");
    }
    return doc;
  }

  /**
   * Update document metadata only
   */
  updateMetadata(id: string, metadata: DocumentMetadata): Document | null {
    const existing = this.getById(id);
    if (!existing) {
      return null;
    }

    const now = Date.now();
    const mergedMetadata = { ...existing.metadata, ...metadata };

    this.db
      .prepare("UPDATE documents SET metadata = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(mergedMetadata), now, id);

    return this.getById(id);
  }

  /**
   * Delete a document
   */
  delete(id: string): void {
    this.db.prepare("DELETE FROM documents WHERE id = ?").run(id);
  }

  /**
   * Count all documents
   */
  count(): number {
    const result = this.db
      .prepare("SELECT COUNT(*) as count FROM documents")
      .get() as { count: number };
    return result.count;
  }

  /**
   * Get manifest (lightweight list of document IDs and timestamps) for a user
   * This is used for efficient sync - client compares this with local entries
   */
  getManifestForUser(userId: string): { uuid: string; updatedAt: number }[] {
    const rows = this.db
      .prepare("SELECT id, updated_at FROM documents WHERE user_id = ?")
      .all(userId) as { id: string; updated_at: number }[];

    return rows.map((row) => ({
      uuid: row.id,
      updatedAt: row.updated_at,
    }));
  }

  private mapRowToDocument(row: DocumentRow): Document {
    return {
      id: row.id,
      yjsState: row.yjs_state,
      metadata: row.metadata ? (JSON.parse(row.metadata) as DocumentMetadata) : null,
      userId: row.user_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
