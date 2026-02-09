/**
 * Sync Engine Hook
 *
 * React hook to access sync state and trigger sync operations.
 * The actual sync lifecycle is managed by SyncInitializer component.
 */

import { useState, useEffect, useCallback } from "react";
import { useDatabase } from "../db/DatabaseProvider";
import {
  getSyncManager,
  getSyncStatus,
  getPendingCount,
  subscribeSyncStatus,
  subscribePendingCount,
} from "./SyncInitializer";
import { SyncStatus } from "./syncManager";
import type { Entry, UpdateEntryInput } from "../db/entries";

export interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
}

export interface UseSyncEngineReturn {
  status: SyncStatus;
  isInitialized: boolean;
  pendingCount: number;
  queueStats: QueueStats | null;
  syncEntry: (entry: Entry) => Promise<void>;
  syncOnOpen: (entryId: number) => Promise<void>;
  disconnectOnClose: (entryId: number) => Promise<void>;
  onEntryCreated: (entry: Entry) => Promise<void>;
  onEntryUpdated: (entryId: number, updates: UpdateEntryInput) => Promise<void>;
  onEntryDeleted: (entryId: number, uuid?: string) => Promise<void>;
  forceSync: () => Promise<void>;
  retryFailed: () => Promise<void>;
  refreshQueueStats: () => Promise<void>;
}

/**
 * Hook to access sync state and trigger operations
 */
export function useSyncEngine(): UseSyncEngineReturn {
  const db = useDatabase();
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus);
  const [pendingCount, setPendingCount] = useState<number>(getPendingCount);
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);

  // Subscribe to sync status changes
  useEffect(() => {
    const unsubStatus = subscribeSyncStatus(setStatus);
    const unsubPending = subscribePendingCount(setPendingCount);

    // Sync with current values
    setStatus(getSyncStatus());
    setPendingCount(getPendingCount());

    return () => {
      unsubStatus();
      unsubPending();
    };
  }, []);

  const updatePendingCount = useCallback(async () => {
    try {
      const result = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM entries WHERE sync_status = 'pending' OR sync_status = 'modified' OR sync_status IS NULL`,
      );
      setPendingCount(result?.count ?? 0);
    } catch {
      // Ignore errors
    }
  }, [db]);

  // Refresh queue stats from sync manager
  const refreshQueueStats = useCallback(async () => {
    const manager = getSyncManager();
    if (!manager) {
      setQueueStats(null);
      return;
    }
    const stats = await manager.getQueueStats();
    setQueueStats(stats);
  }, []);

  // Retry failed sync items
  const retryFailed = useCallback(async () => {
    const manager = getSyncManager();
    if (!manager) {
      console.warn("[useSyncEngine] Cannot retry - sync not initialized");
      return;
    }
    await manager.retryFailedSyncs();
    await refreshQueueStats();
  }, [refreshQueueStats]);

  // Sync a single entry
  const syncEntry = useCallback(async (entry: Entry) => {
    const manager = getSyncManager();
    if (!manager) {
      console.warn("[useSyncEngine] Sync not initialized");
      return;
    }
    await manager.syncEntry(entry);
  }, []);

  // Sync when opening an entry for viewing/editing
  const syncOnOpen = useCallback(async (entryId: number) => {
    const manager = getSyncManager();
    if (manager) {
      await manager.syncOnOpen(entryId);
    }
  }, []);

  // Disconnect when closing an entry
  const disconnectOnClose = useCallback(async (entryId: number) => {
    const manager = getSyncManager();
    if (manager) {
      await manager.disconnectOnClose(entryId);
    }
  }, []);

  // Handle entry creation
  const onEntryCreated = useCallback(
    async (entry: Entry) => {
      const manager = getSyncManager();
      if (!manager) {
        // Mark as pending if sync not available
        await db.runAsync(
          `UPDATE entries SET sync_status = 'pending' WHERE id = ?`,
          [entry.id],
        );
        await updatePendingCount();
        return;
      }
      await manager.onEntryCreated(entry);
      await updatePendingCount();
    },
    [db, updatePendingCount],
  );

  // Handle entry update
  const onEntryUpdated = useCallback(
    async (entryId: number, updates: UpdateEntryInput) => {
      const manager = getSyncManager();
      if (!manager) {
        await db.runAsync(
          `UPDATE entries SET sync_status = 'modified' WHERE id = ?`,
          [entryId],
        );
        await updatePendingCount();
        return;
      }
      await manager.onEntryUpdated(entryId, updates);
      await updatePendingCount();
    },
    [db, updatePendingCount],
  );

  // Handle entry deletion
  // Note: uuid should be provided before the entry is deleted from DB
  const onEntryDeleted = useCallback(async (entryId: number, uuid?: string) => {
    const manager = getSyncManager();
    if (!manager) {
      return;
    }
    await manager.onEntryDeleted(entryId, uuid);
  }, []);

  // Force sync all pending entries
  const forceSync = useCallback(async () => {
    const manager = getSyncManager();
    if (!manager) {
      console.warn("[useSyncEngine] Cannot force sync - not initialized");
      return;
    }
    await manager.performInitialSync();
    await updatePendingCount();
  }, [updatePendingCount]);

  return {
    status,
    isInitialized: getSyncManager() !== null,
    pendingCount,
    queueStats,
    syncEntry,
    syncOnOpen,
    disconnectOnClose,
    onEntryCreated,
    onEntryUpdated,
    onEntryDeleted,
    forceSync,
    retryFailed,
    refreshQueueStats,
  };
}
