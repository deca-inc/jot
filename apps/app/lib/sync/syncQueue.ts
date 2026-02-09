/**
 * Sync Queue
 *
 * Persistent queue for syncing entries with the server.
 * Features:
 * - DB-backed persistence (survives app restarts)
 * - 500ms debounce for rapid edits
 * - Batch processing (10 items max per cycle)
 * - Priority ordering: deletions > creates > updates
 * - Retry with exponential backoff (5 attempts)
 * - Network-aware processing
 */

import { SQLiteDatabase } from "expo-sqlite";
import { getNetworkMonitor, NetworkStatus } from "./networkMonitor";
import type { UpdateEntryInput } from "../db/entries";

export type SyncOperation = "create" | "update" | "delete";
export type SyncQueueStatus = "pending" | "processing" | "completed" | "failed";

export interface QueuedSync {
  id: number;
  entryId: number | null;
  entryUuid: string;
  operation: SyncOperation;
  priority: number;
  payload: UpdateEntryInput | null;
  /** The entry's updatedAt when this operation was queued (for conflict detection) */
  entryUpdatedAtWhenQueued: number | null;
  status: SyncQueueStatus;
  error: string | null;
  retryCount: number;
  nextRetryAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface SyncQueueCallbacks {
  onSyncStarted?: (item: QueuedSync) => void;
  onSyncCompleted?: (item: QueuedSync) => void;
  onSyncFailed?: (item: QueuedSync, error: Error) => void;
  onQueueEmpty?: () => void;
}

// Priority values: higher = processed first
const PRIORITY_DELETE = 3;
const PRIORITY_CREATE = 2;
const PRIORITY_UPDATE = 1;

// Retry configuration
const MAX_RETRIES = 5;
const RETRY_DELAYS = [1000, 5000, 15000, 60000, 300000]; // 1s, 5s, 15s, 60s, 5min

// Debounce delay for rapid edits
const DEBOUNCE_MS = 500;

// Batch size for processing
const BATCH_SIZE = 10;

// Delay between processing batches
const BATCH_DELAY_MS = 2000;

// Processing timeout - items stuck in "processing" longer than this are recovered
const PROCESSING_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * SyncQueue manages the queue of entries to sync with the server
 */
export class SyncQueue {
  private db: SQLiteDatabase;
  private syncFn: (item: QueuedSync) => Promise<void>;
  private callbacks: SyncQueueCallbacks;
  private isProcessing = false;
  private networkUnsubscribe: (() => void) | null = null;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private pendingPayloads: Map<string, UpdateEntryInput> = new Map();
  private isInitialized = false;
  private isShutdown = false;

  constructor(
    db: SQLiteDatabase,
    syncFn: (item: QueuedSync) => Promise<void>,
    callbacks?: SyncQueueCallbacks,
  ) {
    this.db = db;
    this.syncFn = syncFn;
    this.callbacks = callbacks ?? {};
  }

  /**
   * Initialize the queue and start processing
   */
  async initialize(): Promise<void> {
    if (this.isInitialized || this.isShutdown) return;

    const monitor = getNetworkMonitor();

    // Subscribe to network changes
    this.networkUnsubscribe = monitor.subscribe((status: NetworkStatus) => {
      if (status.isConnected) {
        this.processQueue();
      }
    });

    this.isInitialized = true;

    // Recover any items stuck in "processing" state (from previous crash)
    await this.recoverStaleProcessing();

    // Start processing existing queue
    await this.processQueue();
  }

  /**
   * Recover items stuck in "processing" state
   * This can happen if the app crashes mid-sync
   */
  private async recoverStaleProcessing(): Promise<void> {
    const now = Date.now();
    const cutoff = now - PROCESSING_TIMEOUT_MS;

    // Reset items stuck in "processing" for too long back to "pending"
    await this.db.runAsync(
      `UPDATE sync_queue
       SET status = 'pending', error = 'Recovered from stale processing state', updated_at = ?
       WHERE status = 'processing' AND updated_at < ?`,
      [now, cutoff],
    );
  }

  /**
   * Shutdown the queue
   */
  shutdown(): void {
    this.isShutdown = true;

    // Clear debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.pendingPayloads.clear();

    // Unsubscribe from network
    if (this.networkUnsubscribe) {
      this.networkUnsubscribe();
      this.networkUnsubscribe = null;
    }

    this.isInitialized = false;
  }

  /**
   * Enqueue a create operation
   */
  async enqueueCreate(
    entryId: number,
    uuid: string,
    entryUpdatedAt?: number,
  ): Promise<number> {
    return this.enqueue(
      entryId,
      uuid,
      "create",
      PRIORITY_CREATE,
      null,
      entryUpdatedAt ?? null,
    );
  }

  /**
   * Enqueue an update operation
   * @param entryUpdatedAtWhenQueued - The entry's updatedAt when this update was made (for conflict detection)
   */
  async enqueueUpdate(
    entryId: number,
    uuid: string,
    payload: UpdateEntryInput,
    entryUpdatedAtWhenQueued?: number,
  ): Promise<number> {
    // Check if there's already a pending update for this entry
    const existing = await this.getPendingForEntry(uuid);
    if (existing && existing.operation === "update") {
      // Coalesce: merge payloads (keep the newer entryUpdatedAtWhenQueued)
      const existingPayload = existing.payload ?? {};
      const mergedPayload = { ...existingPayload, ...payload };
      await this.updatePayload(uuid, mergedPayload);
      return existing.id;
    }

    return this.enqueue(
      entryId,
      uuid,
      "update",
      PRIORITY_UPDATE,
      payload,
      entryUpdatedAtWhenQueued ?? null,
    );
  }

  /**
   * Enqueue an update with debouncing for rapid edits
   * @param entryUpdatedAtWhenQueued - The entry's updatedAt when this update was made (for conflict detection)
   */
  enqueueUpdateDebounced(
    entryId: number,
    uuid: string,
    payload: UpdateEntryInput,
    entryUpdatedAtWhenQueued?: number,
  ): void {
    // Merge with any pending payload for this entry
    const existingPayload = this.pendingPayloads.get(uuid) ?? {};
    const mergedPayload = { ...existingPayload, ...payload };
    this.pendingPayloads.set(uuid, mergedPayload);

    // Clear existing timer for this entry
    const existingTimer = this.debounceTimers.get(uuid);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Capture the entryUpdatedAtWhenQueued for when the timer fires
    const capturedUpdatedAt = entryUpdatedAtWhenQueued;

    // Set new timer
    const timer = setTimeout(() => {
      const finalPayload = this.pendingPayloads.get(uuid);
      this.pendingPayloads.delete(uuid);
      this.debounceTimers.delete(uuid);

      if (finalPayload) {
        this.enqueueUpdate(entryId, uuid, finalPayload, capturedUpdatedAt);
      }
    }, DEBOUNCE_MS);

    this.debounceTimers.set(uuid, timer);
  }

  /**
   * Enqueue a delete operation
   * Note: entryId is null because the entry may already be deleted
   */
  async enqueueDelete(uuid: string): Promise<number> {
    return this.enqueue(null, uuid, "delete", PRIORITY_DELETE, null, null);
  }

  /**
   * Get the next batch of items to process
   */
  async getNextBatch(limit: number = BATCH_SIZE): Promise<QueuedSync[]> {
    const now = Date.now();
    const rows = await this.db.getAllAsync<{
      id: number;
      entry_id: number | null;
      entry_uuid: string;
      operation: string;
      priority: number;
      payload: string | null;
      entry_updated_at_when_queued: number | null;
      status: string;
      error: string | null;
      retry_count: number;
      next_retry_at: number | null;
      created_at: number;
      updated_at: number;
    }>(
      `SELECT * FROM sync_queue
       WHERE status = 'pending'
       AND (next_retry_at IS NULL OR next_retry_at <= ?)
       ORDER BY priority DESC, created_at ASC
       LIMIT ?`,
      [now, limit],
    );

    return rows.map((row) => this.mapRow(row));
  }

  /**
   * Process the sync queue
   */
  async processQueue(): Promise<void> {
    if (this.isShutdown) return;
    if (this.isProcessing) return;

    const monitor = getNetworkMonitor();
    if (!monitor.isConnected()) {
      return;
    }

    this.isProcessing = true;

    try {
      while (!this.isShutdown) {
        const batch = await this.getNextBatch();
        if (batch.length === 0) {
          this.callbacks.onQueueEmpty?.();
          break;
        }

        for (const item of batch) {
          if (this.isShutdown) break;
          await this.processItem(item);
        }

        // Wait between batches
        if (batch.length === BATCH_SIZE) {
          await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  }> {
    const pending = await this.db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM sync_queue WHERE status = 'pending'`,
    );
    const failed = await this.db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM sync_queue WHERE status = 'failed'`,
    );

    return {
      pending: pending?.count ?? 0,
      processing: 0, // Not tracked separately
      completed: 0, // Completed items are typically cleared
      failed: failed?.count ?? 0,
    };
  }

  /**
   * Retry all failed items
   */
  async retryFailed(): Promise<void> {
    const now = Date.now();
    await this.db.runAsync(
      `UPDATE sync_queue
       SET status = 'pending', retry_count = 0, error = NULL, next_retry_at = NULL, updated_at = ?
       WHERE status = 'failed'`,
      [now],
    );

    this.processQueue();
  }

  /**
   * Clear completed items
   */
  async clearCompleted(): Promise<void> {
    await this.db.runAsync(`DELETE FROM sync_queue WHERE status = 'completed'`);
  }

  /**
   * Get retry delay for a given attempt number
   */
  static getRetryDelay(attempt: number): number {
    const index = Math.min(attempt - 1, RETRY_DELAYS.length - 1);
    return RETRY_DELAYS[index];
  }

  // Private methods

  private async enqueue(
    entryId: number | null,
    uuid: string,
    operation: SyncOperation,
    priority: number,
    payload: UpdateEntryInput | null,
    entryUpdatedAtWhenQueued: number | null,
  ): Promise<number> {
    const now = Date.now();
    const payloadStr = payload ? JSON.stringify(payload) : null;

    const result = await this.db.runAsync(
      `INSERT INTO sync_queue (entry_id, entry_uuid, operation, priority, payload, entry_updated_at_when_queued, status, retry_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)`,
      [
        entryId,
        uuid,
        operation,
        priority,
        payloadStr,
        entryUpdatedAtWhenQueued,
        now,
        now,
      ],
    );

    // Trigger queue processing
    if (this.isInitialized) {
      this.processQueue();
    }

    return result.lastInsertRowId;
  }

  private async getPendingForEntry(uuid: string): Promise<QueuedSync | null> {
    const row = await this.db.getFirstAsync<{
      id: number;
      entry_id: number | null;
      entry_uuid: string;
      operation: string;
      priority: number;
      payload: string | null;
      entry_updated_at_when_queued: number | null;
      status: string;
      error: string | null;
      retry_count: number;
      next_retry_at: number | null;
      created_at: number;
      updated_at: number;
    }>(
      `SELECT * FROM sync_queue WHERE entry_uuid = ? AND status = 'pending' AND operation = 'update'`,
      [uuid],
    );

    return row ? this.mapRow(row) : null;
  }

  private async updatePayload(
    uuid: string,
    payload: UpdateEntryInput,
  ): Promise<void> {
    const now = Date.now();
    await this.db.runAsync(
      `UPDATE sync_queue SET payload = ?, updated_at = ? WHERE entry_uuid = ? AND status = 'pending' AND operation = 'update'`,
      [JSON.stringify(payload), now, uuid],
    );
  }

  private async processItem(item: QueuedSync): Promise<void> {
    // Mark as processing
    await this.markProcessing(item.id);
    this.callbacks.onSyncStarted?.({ ...item, status: "processing" });

    try {
      await this.syncFn(item);

      // Mark as completed
      await this.markCompleted(item.id);
      this.callbacks.onSyncCompleted?.({ ...item, status: "completed" });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      await this.handleFailure(item, err);
      this.callbacks.onSyncFailed?.(
        { ...item, status: "failed", error: err.message },
        err,
      );
    }
  }

  private async markProcessing(id: number): Promise<void> {
    const now = Date.now();
    await this.db.runAsync(
      `UPDATE sync_queue SET status = 'processing', updated_at = ? WHERE id = ?`,
      [now, id],
    );
  }

  private async markCompleted(id: number): Promise<void> {
    const now = Date.now();
    await this.db.runAsync(
      `UPDATE sync_queue SET status = 'completed', processed_at = ?, updated_at = ? WHERE id = ?`,
      [now, now, id],
    );
  }

  private async handleFailure(item: QueuedSync, error: Error): Promise<void> {
    const newRetryCount = item.retryCount + 1;
    const now = Date.now();

    if (newRetryCount >= MAX_RETRIES) {
      // Mark as failed permanently
      await this.db.runAsync(
        `UPDATE sync_queue SET status = 'failed', error = ?, retry_count = ?, updated_at = ? WHERE id = ?`,
        [error.message, newRetryCount, now, item.id],
      );
    } else {
      // Schedule retry
      const delay = SyncQueue.getRetryDelay(newRetryCount);
      const nextRetryAt = now + delay;

      await this.db.runAsync(
        `UPDATE sync_queue SET status = 'pending', error = ?, retry_count = ?, next_retry_at = ?, updated_at = ? WHERE id = ?`,
        [error.message, newRetryCount, nextRetryAt, now, item.id],
      );
    }
  }

  private mapRow(row: {
    id: number;
    entry_id: number | null;
    entry_uuid: string;
    operation: string;
    priority: number;
    payload: string | null;
    entry_updated_at_when_queued: number | null;
    status: string;
    error: string | null;
    retry_count: number;
    next_retry_at: number | null;
    created_at: number;
    updated_at: number;
  }): QueuedSync {
    return {
      id: row.id,
      entryId: row.entry_id,
      entryUuid: row.entry_uuid,
      operation: row.operation as SyncOperation,
      priority: row.priority,
      payload: row.payload ? JSON.parse(row.payload) : null,
      entryUpdatedAtWhenQueued: row.entry_updated_at_when_queued,
      status: row.status as SyncQueueStatus,
      error: row.error,
      retryCount: row.retry_count,
      nextRetryAt: row.next_retry_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

/**
 * Create a new SyncQueue instance
 */
export function createSyncQueue(
  db: SQLiteDatabase,
  syncFn: (item: QueuedSync) => Promise<void>,
  callbacks?: SyncQueueCallbacks,
): SyncQueue {
  return new SyncQueue(db, syncFn, callbacks);
}
