/**
 * Asset Upload Hook
 *
 * React hook for managing asset uploads from components.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useDatabase } from "../db/DatabaseProvider";
import {
  AssetUploadQueue,
  createAssetUploadQueue,
  QueuedUpload,
} from "./assetUploadQueue";
import { createUploadFunction } from "./assetUploadService";
import { useSyncAuth } from "./useSyncAuth";

export interface AssetUploadStats {
  pending: number;
  uploading: number;
  uploaded: number;
  failed: number;
  totalSize: number;
}

export interface UseAssetUploadReturn {
  isInitialized: boolean;
  stats: AssetUploadStats;
  enqueue: (
    entryId: number,
    localPath: string,
    fileSize: number,
  ) => Promise<number>;
  getUploadsForEntry: (entryId: number) => Promise<QueuedUpload[]>;
  retryFailed: () => Promise<void>;
  clearCompleted: () => Promise<void>;
  setWifiOnlyThreshold: (threshold: number) => void;
}

/**
 * Hook to manage asset uploads
 */
export function useAssetUpload(): UseAssetUploadReturn {
  const db = useDatabase();
  const { state: authState } = useSyncAuth();
  const queueRef = useRef<AssetUploadQueue | null>(null);

  const [isInitialized, setIsInitialized] = useState(false);
  const [stats, setStats] = useState<AssetUploadStats>({
    pending: 0,
    uploading: 0,
    uploaded: 0,
    failed: 0,
    totalSize: 0,
  });

  // Update stats
  const updateStats = useCallback(async () => {
    if (!queueRef.current) return;
    const newStats = await queueRef.current.getStats();
    setStats(newStats);
  }, []);

  // Initialize queue when authenticated
  useEffect(() => {
    if (
      authState.status !== "authenticated" ||
      !authState.settings?.serverUrl
    ) {
      return;
    }

    const serverUrl = authState.settings.serverUrl;

    const initQueue = async () => {
      const uploadFn = createUploadFunction(serverUrl);

      const queue = createAssetUploadQueue(db, uploadFn, {
        callbacks: {
          onUploadStarted: () => updateStats(),
          onUploadCompleted: () => updateStats(),
          onUploadFailed: () => updateStats(),
          onQueueEmpty: () => updateStats(),
        },
      });

      await queue.initialize();
      queueRef.current = queue;
      setIsInitialized(true);
      await updateStats();
    };

    initQueue();

    return () => {
      if (queueRef.current) {
        queueRef.current.shutdown();
        queueRef.current = null;
        setIsInitialized(false);
      }
    };
  }, [authState.status, authState.settings?.serverUrl, db, updateStats]);

  // Enqueue an upload
  const enqueue = useCallback(
    async (
      entryId: number,
      localPath: string,
      fileSize: number,
    ): Promise<number> => {
      if (!queueRef.current) {
        throw new Error("Upload queue not initialized");
      }
      const id = await queueRef.current.enqueue(entryId, localPath, fileSize);
      await updateStats();
      return id;
    },
    [updateStats],
  );

  // Get uploads for entry
  const getUploadsForEntry = useCallback(
    async (entryId: number): Promise<QueuedUpload[]> => {
      if (!queueRef.current) {
        return [];
      }
      return queueRef.current.getUploadsForEntry(entryId);
    },
    [],
  );

  // Retry failed uploads
  const retryFailed = useCallback(async (): Promise<void> => {
    if (!queueRef.current) return;
    await queueRef.current.retryFailed();
    await updateStats();
  }, [updateStats]);

  // Clear completed uploads
  const clearCompleted = useCallback(async (): Promise<void> => {
    if (!queueRef.current) return;
    await queueRef.current.clearCompleted();
    await updateStats();
  }, [updateStats]);

  // Set WiFi-only threshold
  const setWifiOnlyThreshold = useCallback((threshold: number): void => {
    if (!queueRef.current) return;
    queueRef.current.setWifiOnlyThreshold(threshold);
  }, []);

  return {
    isInitialized,
    stats,
    enqueue,
    getUploadsForEntry,
    retryFailed,
    clearCompleted,
    setWifiOnlyThreshold,
  };
}
