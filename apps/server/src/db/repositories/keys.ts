/**
 * Keys Repository
 *
 * Manages user public keys and entry key grants for E2EE.
 */

import Database from "better-sqlite3";

export interface UserKey {
  userId: string;
  deviceId: string;
  publicKey: string;
  keyType: string;
  createdAt: number;
  updatedAt: number;
}

export interface EntryKeyGrant {
  id: number;
  documentId: string;
  userId: string;
  wrappedDek: string;
  ephemeralPublicKey: string | null; // Null for RSA-OAEP, present for ECDH (legacy)
  grantedBy: string;
  grantedAt: number;
}

interface UserKeyRow {
  user_id: string;
  device_id: string;
  public_key: string;
  key_type: string;
  created_at: number;
  updated_at: number;
}

interface EntryKeyGrantRow {
  id: number;
  document_id: string;
  user_id: string;
  wrapped_dek: string;
  ephemeral_public_key: string | null;
  granted_by: string;
  granted_at: number;
}

export class KeysRepository {
  constructor(private db: Database.Database) {}

  // ===== User Public Keys =====

  /**
   * Get all device keys for a user (for multi-device E2EE)
   */
  getUserKeys(userId: string): UserKey[] {
    const rows = this.db
      .prepare("SELECT * FROM user_keys WHERE user_id = ?")
      .all(userId) as UserKeyRow[];

    return rows.map((row) => ({
      userId: row.user_id,
      deviceId: row.device_id,
      publicKey: row.public_key,
      keyType: row.key_type,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Get a specific device key
   */
  getDeviceKey(userId: string, deviceId: string): UserKey | null {
    const row = this.db
      .prepare("SELECT * FROM user_keys WHERE user_id = ? AND device_id = ?")
      .get(userId, deviceId) as UserKeyRow | undefined;

    if (!row) return null;

    return {
      userId: row.user_id,
      deviceId: row.device_id,
      publicKey: row.public_key,
      keyType: row.key_type,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Get a user's public key (legacy - returns first key found)
   * @deprecated Use getUserKeys() for multi-device support
   */
  getUserKey(userId: string): UserKey | null {
    const keys = this.getUserKeys(userId);
    return keys.length > 0 ? keys[0] : null;
  }

  /**
   * Store or update a device's public key
   */
  upsertUserKey(userId: string, deviceId: string, publicKey: string, keyType: string = "RSA-OAEP"): UserKey {
    const now = Date.now();

    this.db
      .prepare(
        `INSERT INTO user_keys (user_id, device_id, public_key, key_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, device_id) DO UPDATE SET
           public_key = excluded.public_key,
           key_type = excluded.key_type,
           updated_at = excluded.updated_at`,
      )
      .run(userId, deviceId, publicKey, keyType, now, now);

    return this.getDeviceKey(userId, deviceId)!;
  }

  /**
   * Delete a specific device key
   */
  deleteDeviceKey(userId: string, deviceId: string): void {
    this.db.prepare("DELETE FROM user_keys WHERE user_id = ? AND device_id = ?").run(userId, deviceId);
  }

  /**
   * Delete all device keys for a user
   */
  deleteUserKeys(userId: string): void {
    this.db.prepare("DELETE FROM user_keys WHERE user_id = ?").run(userId);
  }

  /**
   * Delete a user's public key (legacy - deletes all device keys)
   * @deprecated Use deleteDeviceKey() or deleteUserKeys()
   */
  deleteUserKey(userId: string): void {
    this.deleteUserKeys(userId);
  }

  // ===== Entry Key Grants =====

  /**
   * Get all key grants for a document
   */
  getGrantsForDocument(documentId: string): EntryKeyGrant[] {
    const rows = this.db
      .prepare("SELECT * FROM entry_key_grants WHERE document_id = ?")
      .all(documentId) as EntryKeyGrantRow[];

    return rows.map((row) => this.mapGrantRow(row));
  }

  /**
   * Get a specific grant for a user on a document
   */
  getGrant(documentId: string, userId: string): EntryKeyGrant | null {
    const row = this.db
      .prepare("SELECT * FROM entry_key_grants WHERE document_id = ? AND user_id = ?")
      .get(documentId, userId) as EntryKeyGrantRow | undefined;

    if (!row) return null;
    return this.mapGrantRow(row);
  }

  /**
   * Get all documents a user has access to
   */
  getDocumentsForUser(userId: string): string[] {
    const rows = this.db
      .prepare("SELECT DISTINCT document_id FROM entry_key_grants WHERE user_id = ?")
      .all(userId) as { document_id: string }[];

    return rows.map((r) => r.document_id);
  }

  /**
   * Add or update a key grant
   */
  upsertGrant(
    documentId: string,
    userId: string,
    wrappedDek: string,
    ephemeralPublicKey: string | null, // Null for RSA-OAEP
    grantedBy: string,
  ): EntryKeyGrant {
    const now = Date.now();

    this.db
      .prepare(
        `INSERT INTO entry_key_grants
         (document_id, user_id, wrapped_dek, ephemeral_public_key, granted_by, granted_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(document_id, user_id) DO UPDATE SET
           wrapped_dek = excluded.wrapped_dek,
           ephemeral_public_key = excluded.ephemeral_public_key,
           granted_by = excluded.granted_by,
           granted_at = excluded.granted_at`,
      )
      .run(documentId, userId, wrappedDek, ephemeralPublicKey, grantedBy, now);

    return this.getGrant(documentId, userId)!;
  }

  /**
   * Remove a key grant (revoke access)
   */
  deleteGrant(documentId: string, userId: string): void {
    this.db
      .prepare("DELETE FROM entry_key_grants WHERE document_id = ? AND user_id = ?")
      .run(documentId, userId);
  }

  /**
   * Remove all grants for a document
   */
  deleteAllGrantsForDocument(documentId: string): void {
    this.db.prepare("DELETE FROM entry_key_grants WHERE document_id = ?").run(documentId);
  }

  /**
   * Bulk upsert grants (efficient for initial sync)
   */
  bulkUpsertGrants(
    grants: Array<{
      documentId: string;
      userId: string;
      wrappedDek: string;
      ephemeralPublicKey: string | null; // Null for RSA-OAEP
      grantedBy: string;
    }>,
  ): void {
    const now = Date.now();
    const stmt = this.db.prepare(
      `INSERT INTO entry_key_grants
       (document_id, user_id, wrapped_dek, ephemeral_public_key, granted_by, granted_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(document_id, user_id) DO UPDATE SET
         wrapped_dek = excluded.wrapped_dek,
         ephemeral_public_key = excluded.ephemeral_public_key,
         granted_by = excluded.granted_by,
         granted_at = excluded.granted_at`,
    );

    const insertMany = this.db.transaction((grantList: typeof grants) => {
      for (const g of grantList) {
        stmt.run(g.documentId, g.userId, g.wrappedDek, g.ephemeralPublicKey, g.grantedBy, now);
      }
    });

    insertMany(grants);
  }

  private mapGrantRow(row: EntryKeyGrantRow): EntryKeyGrant {
    return {
      id: row.id,
      documentId: row.document_id,
      userId: row.user_id,
      wrappedDek: row.wrapped_dek,
      ephemeralPublicKey: row.ephemeral_public_key,
      grantedBy: row.granted_by,
      grantedAt: row.granted_at,
    };
  }
}
