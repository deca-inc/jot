import { randomUUID, createHash } from "crypto";
import Database from "better-sqlite3";

export interface RefreshToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: number;
  createdAt: number;
}

interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: number;
  created_at: number;
}

/**
 * Repository for refresh token management
 */
export class RefreshTokenRepository {
  constructor(private db: Database.Database) {}

  /**
   * Hash a token for storage
   */
  static hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  /**
   * Get a refresh token by its hash
   */
  getByTokenHash(tokenHash: string): RefreshToken | null {
    const row = this.db
      .prepare("SELECT * FROM refresh_tokens WHERE token_hash = ?")
      .get(tokenHash) as RefreshTokenRow | undefined;

    if (!row) {
      return null;
    }

    return this.mapRowToRefreshToken(row);
  }

  /**
   * Get all refresh tokens for a user
   */
  getByUserId(userId: string): RefreshToken[] {
    const rows = this.db
      .prepare("SELECT * FROM refresh_tokens WHERE user_id = ? ORDER BY created_at DESC")
      .all(userId) as RefreshTokenRow[];

    return rows.map((row) => this.mapRowToRefreshToken(row));
  }

  /**
   * Create a new refresh token
   * Returns the raw token (to be sent to client) and the stored record
   */
  create(userId: string, expiresInMs: number): { token: string; record: RefreshToken } {
    const id = randomUUID();
    const token = randomUUID() + randomUUID(); // Longer random token
    const tokenHash = RefreshTokenRepository.hashToken(token);
    const now = Date.now();
    const expiresAt = now + expiresInMs;

    this.db
      .prepare(
        `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(id, userId, tokenHash, expiresAt, now);

    const record: RefreshToken = {
      id,
      userId,
      tokenHash,
      expiresAt,
      createdAt: now,
    };

    return { token, record };
  }

  /**
   * Verify a refresh token and return it if valid
   */
  verify(token: string): RefreshToken | null {
    const tokenHash = RefreshTokenRepository.hashToken(token);
    const record = this.getByTokenHash(tokenHash);

    if (!record) {
      return null;
    }

    // Check if expired
    if (record.expiresAt < Date.now()) {
      // Delete expired token
      this.deleteById(record.id);
      return null;
    }

    return record;
  }

  /**
   * Delete a refresh token by ID
   */
  deleteById(id: string): boolean {
    const result = this.db.prepare("DELETE FROM refresh_tokens WHERE id = ?").run(id);
    return result.changes > 0;
  }

  /**
   * Delete a refresh token by its raw token value
   */
  deleteByToken(token: string): boolean {
    const tokenHash = RefreshTokenRepository.hashToken(token);
    const result = this.db
      .prepare("DELETE FROM refresh_tokens WHERE token_hash = ?")
      .run(tokenHash);
    return result.changes > 0;
  }

  /**
   * Delete all refresh tokens for a user
   */
  deleteAllForUser(userId: string): number {
    const result = this.db
      .prepare("DELETE FROM refresh_tokens WHERE user_id = ?")
      .run(userId);
    return result.changes;
  }

  /**
   * Delete all expired tokens (cleanup)
   */
  deleteExpired(): number {
    const result = this.db
      .prepare("DELETE FROM refresh_tokens WHERE expires_at < ?")
      .run(Date.now());
    return result.changes;
  }

  /**
   * Count all refresh tokens
   */
  count(): number {
    const result = this.db
      .prepare("SELECT COUNT(*) as count FROM refresh_tokens")
      .get() as { count: number };
    return result.count;
  }

  private mapRowToRefreshToken(row: RefreshTokenRow): RefreshToken {
    return {
      id: row.id,
      userId: row.user_id,
      tokenHash: row.token_hash,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    };
  }
}
