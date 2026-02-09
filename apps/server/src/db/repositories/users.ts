import { randomUUID } from "crypto";
import Database from "better-sqlite3";

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: number;
  updatedAt: number;
  // UEK (User Encryption Key) fields
  wrappedUek: string | null;
  uekSalt: string | null;
  uekNonce: string | null;
  uekAuthTag: string | null;
  uekVersion: number;
}

export interface UEKData {
  wrappedUek: string;
  salt: string;
  nonce: string;
  authTag: string;
  version: number;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: number;
  updated_at: number;
  wrapped_uek: string | null;
  uek_salt: string | null;
  uek_nonce: string | null;
  uek_auth_tag: string | null;
  uek_version: number | null;
}

/**
 * Repository for user management
 */
export class UserRepository {
  constructor(private db: Database.Database) {}

  /**
   * Get a user by ID
   */
  getById(id: string): User | null {
    const row = this.db
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(id) as UserRow | undefined;

    if (!row) {
      return null;
    }

    return this.mapRowToUser(row);
  }

  /**
   * Get a user by email
   */
  getByEmail(email: string): User | null {
    const row = this.db
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(email.toLowerCase()) as UserRow | undefined;

    if (!row) {
      return null;
    }

    return this.mapRowToUser(row);
  }

  /**
   * Create a new user
   */
  create(email: string, passwordHash: string): User {
    const id = randomUUID();
    const now = Date.now();

    this.db
      .prepare(
        `INSERT INTO users (id, email, password_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(id, email.toLowerCase(), passwordHash, now, now);

    const user = this.getById(id);
    if (!user) {
      throw new Error("Failed to retrieve created user");
    }
    return user;
  }

  /**
   * Update user password
   */
  updatePassword(id: string, passwordHash: string): User | null {
    const now = Date.now();

    const result = this.db
      .prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
      .run(passwordHash, now, id);

    if (result.changes === 0) {
      return null;
    }

    return this.getById(id);
  }

  /**
   * Delete a user
   */
  delete(id: string): boolean {
    const result = this.db.prepare("DELETE FROM users WHERE id = ?").run(id);
    return result.changes > 0;
  }

  /**
   * Check if email already exists
   */
  emailExists(email: string): boolean {
    const row = this.db
      .prepare("SELECT 1 FROM users WHERE email = ?")
      .get(email.toLowerCase());
    return !!row;
  }

  /**
   * Count all users
   */
  count(): number {
    const result = this.db
      .prepare("SELECT COUNT(*) as count FROM users")
      .get() as { count: number };
    return result.count;
  }

  /**
   * Get UEK data for a user
   */
  getUEK(userId: string): UEKData | null {
    const row = this.db
      .prepare(
        `SELECT wrapped_uek, uek_salt, uek_nonce, uek_auth_tag, uek_version
         FROM users WHERE id = ?`,
      )
      .get(userId) as Pick<UserRow, "wrapped_uek" | "uek_salt" | "uek_nonce" | "uek_auth_tag" | "uek_version"> | undefined;

    if (!row || !row.wrapped_uek || !row.uek_salt || !row.uek_nonce || !row.uek_auth_tag) {
      return null;
    }

    return {
      wrappedUek: row.wrapped_uek,
      salt: row.uek_salt,
      nonce: row.uek_nonce,
      authTag: row.uek_auth_tag,
      version: row.uek_version ?? 0,
    };
  }

  /**
   * Set UEK data for a user
   */
  setUEK(
    userId: string,
    wrappedUek: string,
    salt: string,
    nonce: string,
    authTag: string,
  ): boolean {
    const now = Date.now();

    // Get current version and increment
    const current = this.db
      .prepare("SELECT uek_version FROM users WHERE id = ?")
      .get(userId) as { uek_version: number | null } | undefined;

    const newVersion = (current?.uek_version ?? 0) + 1;

    const result = this.db
      .prepare(
        `UPDATE users
         SET wrapped_uek = ?, uek_salt = ?, uek_nonce = ?, uek_auth_tag = ?,
             uek_version = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(wrappedUek, salt, nonce, authTag, newVersion, now, userId);

    return result.changes > 0;
  }

  private mapRowToUser(row: UserRow): User {
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.password_hash,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      wrappedUek: row.wrapped_uek,
      uekSalt: row.uek_salt,
      uekNonce: row.uek_nonce,
      uekAuthTag: row.uek_auth_tag,
      uekVersion: row.uek_version ?? 0,
    };
  }
}
