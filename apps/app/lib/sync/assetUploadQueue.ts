/**
 * Asset Upload Queue
 *
 * Background queue for uploading attachments to the sync server.
 * Respects network preferences (WiFi-only for large files).
 */

import { SQLiteDatabase } from "expo-sqlite";
import { getNetworkMonitor, NetworkStatus } from "./networkMonitor";

export type UploadStatus = "pending" | "uploading" | "uploaded" | "failed";

export interface QueuedUpload {
  id: number;
  entryId: number;
  localPath: string;
  remoteUrl: string | null;
  fileSize: number;
  status: UploadStatus;
  error: string | null;
  retryCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface AssetUploadQueueCallbacks {
  onUploadStarted?: (upload: QueuedUpload) => void;
  onUploadCompleted?: (upload: QueuedUpload) => void;
  onUploadFailed?: (upload: QueuedUpload, error: Error) => void;
  onQueueEmpty?: () => void;
}

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 5000, 15000]; // Exponential backoff

/**
 * AssetUploadQueue manages background asset uploads
 */
export class AssetUploadQueue {
  private db: SQLiteDatabase;
  private uploadFn: (localPath: string, entryId: number) => Promise<string>;
  private wifiOnlyThreshold: number;
  private callbacks: AssetUploadQueueCallbacks;
  private isProcessing = false;
  private networkUnsubscribe: (() => void) | null = null;
  private currentNetworkStatus: NetworkStatus | null = null;
  private processingPromise: Promise<void> | null = null;

  constructor(
    db: SQLiteDatabase,
    uploadFn: (localPath: string, entryId: number) => Promise<string>,
    options?: {
      wifiOnlyThreshold?: number;
      callbacks?: AssetUploadQueueCallbacks;
    },
  ) {
    this.db = db;
    this.uploadFn = uploadFn;
    this.wifiOnlyThreshold = options?.wifiOnlyThreshold ?? 5 * 1024 * 1024; // 5MB default
    this.callbacks = options?.callbacks ?? {};
  }

  /**
   * Initialize the queue and start processing
   */
  async initialize(): Promise<void> {
    const monitor = getNetworkMonitor();

    // Subscribe to network changes
    this.networkUnsubscribe = monitor.subscribe((status) => {
      const wasDisconnected = !this.currentNetworkStatus?.isConnected;
      this.currentNetworkStatus = status;

      // If we just connected, try processing the queue
      if (status.isConnected && wasDisconnected) {
        this.processQueue();
      }
    });

    // Start processing existing queue
    await this.processQueue();
  }

  /**
   * Shutdown the queue
   */
  shutdown(): void {
    if (this.networkUnsubscribe) {
      this.networkUnsubscribe();
      this.networkUnsubscribe = null;
    }
  }

  /**
   * Add an asset to the upload queue
   */
  async enqueue(
    entryId: number,
    localPath: string,
    fileSize: number,
  ): Promise<number> {
    const now = Date.now();

    const result = await this.db.runAsync(
      `INSERT INTO asset_uploads (entry_id, local_path, file_size, status, retry_count, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', 0, ?, ?)`,
      [entryId, localPath, fileSize, now, now],
    );

    // Trigger queue processing
    this.processQueue();

    return result.lastInsertRowId;
  }

  /**
   * Get all pending uploads
   */
  async getPendingUploads(): Promise<QueuedUpload[]> {
    const rows = await this.db.getAllAsync<{
      id: number;
      entry_id: number;
      local_path: string;
      remote_url: string | null;
      file_size: number;
      status: string;
      error: string | null;
      retry_count: number;
      created_at: number;
      updated_at: number;
    }>(
      `SELECT * FROM asset_uploads WHERE status = 'pending' ORDER BY created_at ASC`,
    );

    return rows.map(this.mapRow);
  }

  /**
   * Get upload status for an entry
   */
  async getUploadsForEntry(entryId: number): Promise<QueuedUpload[]> {
    const rows = await this.db.getAllAsync<{
      id: number;
      entry_id: number;
      local_path: string;
      remote_url: string | null;
      file_size: number;
      status: string;
      error: string | null;
      retry_count: number;
      created_at: number;
      updated_at: number;
    }>(
      `SELECT * FROM asset_uploads WHERE entry_id = ? ORDER BY created_at ASC`,
      [entryId],
    );

    return rows.map(this.mapRow);
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<{
    pending: number;
    uploading: number;
    uploaded: number;
    failed: number;
    totalSize: number;
  }> {
    const result = await this.db.getFirstAsync<{
      pending: number;
      uploading: number;
      uploaded: number;
      failed: number;
      total_size: number;
    }>(`
      SELECT
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'uploading' THEN 1 ELSE 0 END) as uploading,
        SUM(CASE WHEN status = 'uploaded' THEN 1 ELSE 0 END) as uploaded,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status IN ('pending', 'uploading') THEN file_size ELSE 0 END) as total_size
      FROM asset_uploads
    `);

    return {
      pending: result?.pending ?? 0,
      uploading: result?.uploading ?? 0,
      uploaded: result?.uploaded ?? 0,
      failed: result?.failed ?? 0,
      totalSize: result?.total_size ?? 0,
    };
  }

  /**
   * Retry failed uploads
   */
  async retryFailed(): Promise<void> {
    await this.db.runAsync(
      `UPDATE asset_uploads SET status = 'pending', retry_count = 0, error = NULL, updated_at = ?
       WHERE status = 'failed'`,
      [Date.now()],
    );

    this.processQueue();
  }

  /**
   * Clear completed uploads
   */
  async clearCompleted(): Promise<void> {
    await this.db.runAsync(
      `DELETE FROM asset_uploads WHERE status = 'uploaded'`,
    );
  }

  /**
   * Update WiFi-only threshold
   */
  setWifiOnlyThreshold(threshold: number): void {
    this.wifiOnlyThreshold = threshold;
    // Trigger queue processing in case some files can now upload
    this.processQueue();
  }

  /**
   * Process the upload queue
   */
  private async processQueue(): Promise<void> {
    // If already processing, queue will be processed when current batch finishes
    if (this.isProcessing) {
      return;
    }

    // Check network connectivity
    const monitor = getNetworkMonitor();
    if (!monitor.isConnected()) {
      return;
    }

    this.isProcessing = true;

    try {
      while (true) {
        const pending = await this.getPendingUploads();
        if (pending.length === 0) {
          this.callbacks.onQueueEmpty?.();
          break;
        }

        // Find first upload that can proceed given current network
        const upload = pending.find((u) =>
          monitor.shouldUploadFile(u.fileSize, this.wifiOnlyThreshold),
        );

        if (!upload) {
          // No uploads can proceed on current network
          break;
        }

        await this.processUpload(upload);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async processUpload(upload: QueuedUpload): Promise<void> {
    // Mark as uploading
    await this.db.runAsync(
      `UPDATE asset_uploads SET status = 'uploading', updated_at = ? WHERE id = ?`,
      [Date.now(), upload.id],
    );

    this.callbacks.onUploadStarted?.({ ...upload, status: "uploading" });

    try {
      const remoteUrl = await this.uploadFn(upload.localPath, upload.entryId);

      // Mark as completed
      await this.db.runAsync(
        `UPDATE asset_uploads SET status = 'uploaded', remote_url = ?, error = NULL, updated_at = ?
         WHERE id = ?`,
        [remoteUrl, Date.now(), upload.id],
      );

      this.callbacks.onUploadCompleted?.({
        ...upload,
        status: "uploaded",
        remoteUrl,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const newRetryCount = upload.retryCount + 1;

      if (newRetryCount >= MAX_RETRIES) {
        // Mark as failed
        await this.db.runAsync(
          `UPDATE asset_uploads SET status = 'failed', error = ?, retry_count = ?, updated_at = ?
           WHERE id = ?`,
          [err.message, newRetryCount, Date.now(), upload.id],
        );

        this.callbacks.onUploadFailed?.(
          {
            ...upload,
            status: "failed",
            error: err.message,
            retryCount: newRetryCount,
          },
          err,
        );
      } else {
        // Schedule retry
        await this.db.runAsync(
          `UPDATE asset_uploads SET status = 'pending', error = ?, retry_count = ?, updated_at = ?
           WHERE id = ?`,
          [err.message, newRetryCount, Date.now(), upload.id],
        );

        // Wait before retrying
        const delay =
          RETRY_DELAYS[newRetryCount - 1] ??
          RETRY_DELAYS[RETRY_DELAYS.length - 1];
        setTimeout(() => this.processQueue(), delay);
      }
    }
  }

  private mapRow(row: {
    id: number;
    entry_id: number;
    local_path: string;
    remote_url: string | null;
    file_size: number;
    status: string;
    error: string | null;
    retry_count: number;
    created_at: number;
    updated_at: number;
  }): QueuedUpload {
    return {
      id: row.id,
      entryId: row.entry_id,
      localPath: row.local_path,
      remoteUrl: row.remote_url,
      fileSize: row.file_size,
      status: row.status as UploadStatus,
      error: row.error,
      retryCount: row.retry_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

/**
 * Create a new AssetUploadQueue instance
 */
export function createAssetUploadQueue(
  db: SQLiteDatabase,
  uploadFn: (localPath: string, entryId: number) => Promise<string>,
  options?: {
    wifiOnlyThreshold?: number;
    callbacks?: AssetUploadQueueCallbacks;
  },
): AssetUploadQueue {
  return new AssetUploadQueue(db, uploadFn, options);
}
