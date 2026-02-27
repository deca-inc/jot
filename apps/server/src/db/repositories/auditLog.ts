import { randomUUID } from "crypto";
import Database from "better-sqlite3";

/**
 * Audit action types for security logging
 */
export type AuditAction =
  | "document_load"
  | "document_store"
  | "asset_upload"
  | "asset_download"
  | "key_rotation"
  | "login"
  | "login_failed"
  | "logout"
  | "logout_all"
  | "register"
  | "token_refresh"
  | "rate_limit_exceeded";

/**
 * Audit log entry
 */
export interface AuditEntry {
  id: string;
  userId: string;
  action: AuditAction;
  resourceType: string | null;
  resourceId: string | null;
  ipAddress: string | null;
  timestamp: number;
  metadata: Record<string, unknown> | null;
}

/**
 * Repository for audit log entries
 */
export class AuditLogRepository {
  constructor(private db: Database.Database) {
    this.ensureTable();
  }

  private ensureTable(): void {
    // Table is created by migration, but ensure it exists for safety
    const tableExists = this.db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='audit_log'
    `).get();

    if (!tableExists) {
      this.db.exec(`
        CREATE TABLE audit_log (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          action TEXT NOT NULL,
          resource_type TEXT,
          resource_id TEXT,
          ip_address TEXT,
          timestamp INTEGER NOT NULL,
          metadata JSON
        );
        CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
        CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp);
        CREATE INDEX idx_audit_log_action ON audit_log(action);
      `);
    }
  }

  /**
   * Log an audit event
   */
  log(
    userId: string,
    action: AuditAction,
    resourceType?: string,
    resourceId?: string,
    ipAddress?: string,
    metadata?: Record<string, unknown>,
  ): string {
    const id = randomUUID();
    const stmt = this.db.prepare(`
      INSERT INTO audit_log (id, user_id, action, resource_type, resource_id, ip_address, timestamp, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      userId,
      action,
      resourceType ?? null,
      resourceId ?? null,
      ipAddress ?? null,
      Date.now(),
      metadata ? JSON.stringify(metadata) : null,
    );

    return id;
  }

  /**
   * Get audit logs for a user
   */
  getByUser(userId: string, limit = 100, offset = 0): AuditEntry[] {
    const stmt = this.db.prepare(`
      SELECT id, user_id, action, resource_type, resource_id, ip_address, timestamp, metadata
      FROM audit_log
      WHERE user_id = ?
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `);

    const rows = stmt.all(userId, limit, offset) as AuditRow[];
    return rows.map(this.mapRow);
  }

  /**
   * Get audit logs by action type
   */
  getByAction(action: AuditAction, limit = 100, offset = 0): AuditEntry[] {
    const stmt = this.db.prepare(`
      SELECT id, user_id, action, resource_type, resource_id, ip_address, timestamp, metadata
      FROM audit_log
      WHERE action = ?
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `);

    const rows = stmt.all(action, limit, offset) as AuditRow[];
    return rows.map(this.mapRow);
  }

  /**
   * Get recent audit logs
   */
  getRecent(limit = 100): AuditEntry[] {
    const stmt = this.db.prepare(`
      SELECT id, user_id, action, resource_type, resource_id, ip_address, timestamp, metadata
      FROM audit_log
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    const rows = stmt.all(limit) as AuditRow[];
    return rows.map(this.mapRow);
  }

  /**
   * Get audit logs for a specific resource
   */
  getByResource(resourceType: string, resourceId: string, limit = 100): AuditEntry[] {
    const stmt = this.db.prepare(`
      SELECT id, user_id, action, resource_type, resource_id, ip_address, timestamp, metadata
      FROM audit_log
      WHERE resource_type = ? AND resource_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    const rows = stmt.all(resourceType, resourceId, limit) as AuditRow[];
    return rows.map(this.mapRow);
  }

  /**
   * Get count of actions in time window (for rate limiting analysis)
   */
  getActionCount(userId: string, action: AuditAction, sinceMs: number): number {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM audit_log
      WHERE user_id = ? AND action = ? AND timestamp > ?
    `);

    const result = stmt.get(userId, action, Date.now() - sinceMs) as { count: number };
    return result.count;
  }

  /**
   * Clean up old audit logs (for maintenance)
   */
  cleanupOlderThan(daysOld: number): number {
    const cutoff = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
    const stmt = this.db.prepare(`DELETE FROM audit_log WHERE timestamp < ?`);
    const result = stmt.run(cutoff);
    return result.changes;
  }

  private mapRow(row: AuditRow): AuditEntry {
    return {
      id: row.id,
      userId: row.user_id,
      action: row.action as AuditAction,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      ipAddress: row.ip_address,
      timestamp: row.timestamp,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
    };
  }
}

// Internal row type for database queries
interface AuditRow {
  id: string;
  user_id: string;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  ip_address: string | null;
  timestamp: number;
  metadata: string | null;
}
