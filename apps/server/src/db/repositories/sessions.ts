import Database from "better-sqlite3";

export type DeviceType = "owner" | "guest" | "authenticated";

export interface Session {
  id: string;
  displayName: string | null;
  deviceType: DeviceType;
  lastSeenAt: number;
  createdAt: number;
}

interface SessionRow {
  id: string;
  display_name: string | null;
  device_type: string;
  last_seen_at: number;
  created_at: number;
}

/**
 * Repository for session/device tracking
 */
export class SessionRepository {
  constructor(private db: Database.Database) {}

  /**
   * Get a session by ID
   */
  getById(id: string): Session | null {
    const row = this.db
      .prepare("SELECT * FROM sessions WHERE id = ?")
      .get(id) as SessionRow | undefined;

    if (!row) {
      return null;
    }

    return this.mapRowToSession(row);
  }

  /**
   * Get all sessions
   */
  getAll(): Session[] {
    const rows = this.db
      .prepare("SELECT * FROM sessions ORDER BY last_seen_at DESC")
      .all() as SessionRow[];

    return rows.map((row) => this.mapRowToSession(row));
  }

  /**
   * Get active sessions (seen within the last N milliseconds)
   */
  getActive(withinMs: number = 5 * 60 * 1000): Session[] {
    const cutoff = Date.now() - withinMs;
    const rows = this.db
      .prepare(
        "SELECT * FROM sessions WHERE last_seen_at > ? ORDER BY last_seen_at DESC",
      )
      .all(cutoff) as SessionRow[];

    return rows.map((row) => this.mapRowToSession(row));
  }

  /**
   * Create or update a session (touch)
   */
  upsert(
    id: string,
    data?: { displayName?: string; deviceType?: DeviceType },
  ): Session {
    const now = Date.now();
    const existing = this.getById(id);

    if (existing) {
      // Update last_seen_at and optional fields
      const displayName = data?.displayName ?? existing.displayName;
      const deviceType = data?.deviceType ?? existing.deviceType;

      this.db
        .prepare(
          `UPDATE sessions SET
             display_name = ?,
             device_type = ?,
             last_seen_at = ?
           WHERE id = ?`,
        )
        .run(displayName, deviceType, now, id);
    } else {
      // Create new session
      this.db
        .prepare(
          `INSERT INTO sessions (id, display_name, device_type, last_seen_at, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(id, data?.displayName ?? null, data?.deviceType ?? "guest", now, now);
    }

    const session = this.getById(id);
    if (!session) {
      throw new Error("Failed to retrieve upserted session");
    }
    return session;
  }

  /**
   * Update session's last seen time
   */
  touch(id: string): Session | null {
    const existing = this.getById(id);
    if (!existing) {
      return null;
    }

    const now = Date.now();
    this.db
      .prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?")
      .run(now, id);

    return this.getById(id);
  }

  /**
   * Delete a session
   */
  delete(id: string): void {
    this.db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
  }

  /**
   * Delete inactive sessions (not seen within the last N milliseconds)
   */
  deleteInactive(olderThanMs: number = 24 * 60 * 60 * 1000): number {
    const cutoff = Date.now() - olderThanMs;
    const result = this.db
      .prepare("DELETE FROM sessions WHERE last_seen_at < ?")
      .run(cutoff);
    return result.changes;
  }

  /**
   * Count all sessions
   */
  count(): number {
    const result = this.db
      .prepare("SELECT COUNT(*) as count FROM sessions")
      .get() as { count: number };
    return result.count;
  }

  /**
   * Count active sessions
   */
  countActive(withinMs: number = 5 * 60 * 1000): number {
    const cutoff = Date.now() - withinMs;
    const result = this.db
      .prepare("SELECT COUNT(*) as count FROM sessions WHERE last_seen_at > ?")
      .get(cutoff) as { count: number };
    return result.count;
  }

  private mapRowToSession(row: SessionRow): Session {
    return {
      id: row.id,
      displayName: row.display_name,
      deviceType: row.device_type as DeviceType,
      lastSeenAt: row.last_seen_at,
      createdAt: row.created_at,
    };
  }
}
