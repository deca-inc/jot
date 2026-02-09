/**
 * Sync Initializer
 *
 * Component that automatically starts sync when authenticated.
 * Should be mounted at the app level to ensure sync runs regardless
 * of which screen the user is on.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useCallback } from "react";
import { AppState, AppStateStatus } from "react-native";
import { useDatabase } from "../db/DatabaseProvider";
import { SyncManager, createSyncManager, SyncStatus } from "./syncManager";
import { useSyncAuth, getValidAccessToken } from "./useSyncAuth";

// Global sync state that can be accessed from useSyncEngine
let globalSyncManager: SyncManager | null = null;
let globalSyncStatus: SyncStatus = "idle";
let globalPendingCount = 0;
const globalStatusListeners: Set<(status: SyncStatus) => void> = new Set();
const globalPendingCountListeners: Set<(count: number) => void> = new Set();

export function getSyncManager(): SyncManager | null {
  return globalSyncManager;
}

export function getSyncStatus(): SyncStatus {
  return globalSyncStatus;
}

export function getPendingCount(): number {
  return globalPendingCount;
}

export function subscribeSyncStatus(
  listener: (status: SyncStatus) => void,
): () => void {
  globalStatusListeners.add(listener);
  return () => globalStatusListeners.delete(listener);
}

export function subscribePendingCount(
  listener: (count: number) => void,
): () => void {
  globalPendingCountListeners.add(listener);
  return () => globalPendingCountListeners.delete(listener);
}

function notifyStatusChange(status: SyncStatus) {
  globalSyncStatus = status;
  globalStatusListeners.forEach((listener) => listener(status));
}

function notifyPendingCountChange(count: number) {
  globalPendingCount = count;
  globalPendingCountListeners.forEach((listener) => listener(count));
}

/**
 * Component that initializes and manages sync lifecycle
 */
export function SyncInitializer() {
  const db = useDatabase();
  const queryClient = useQueryClient();
  const { state: authState } = useSyncAuth();
  const isInitializingRef = useRef(false);

  const updatePendingCount = useCallback(async () => {
    try {
      const result = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM entries WHERE sync_status = 'pending' OR sync_status = 'modified' OR sync_status IS NULL`,
      );
      notifyPendingCountChange(result?.count ?? 0);
    } catch {
      // Ignore errors
    }
  }, [db]);

  useEffect(() => {
    console.log(
      "[SyncInitializer] Auth state:",
      authState.status,
      "serverUrl:",
      authState.settings?.serverUrl,
    );

    // Clean up existing manager on auth state change
    if (authState.status !== "authenticated" && globalSyncManager) {
      console.log("[SyncInitializer] Shutting down sync (not authenticated)");
      globalSyncManager.shutdown();
      globalSyncManager = null;
      notifyStatusChange("idle");
      return;
    }

    if (
      authState.status !== "authenticated" ||
      !authState.settings?.serverUrl ||
      isInitializingRef.current
    ) {
      return;
    }

    // Don't reinitialize if already initialized with same URL
    if (globalSyncManager) {
      console.log("[SyncInitializer] Sync already initialized");
      return;
    }

    const serverUrl = authState.settings.serverUrl;

    const initSync = async () => {
      isInitializingRef.current = true;
      console.log("[SyncInitializer] Starting sync initialization...");

      try {
        // Update pending count first
        await updatePendingCount();

        // Create sync manager
        const manager = createSyncManager(db, getValidAccessToken, {
          onStatusChange: (newStatus) => {
            console.log("[SyncInitializer] Status:", newStatus);
            notifyStatusChange(newStatus);
          },
          onEntryUpdated: (entryId) => {
            queryClient.invalidateQueries({ queryKey: ["entries"] });
            queryClient.invalidateQueries({ queryKey: ["entry", entryId] });
            updatePendingCount();
          },
          onEntryDeleted: (entryId) => {
            queryClient.invalidateQueries({ queryKey: ["entries"] });
            queryClient.invalidateQueries({ queryKey: ["entry", entryId] });
            updatePendingCount();
          },
          onError: (error) => {
            console.error("[SyncInitializer] Error:", error);
          },
        });

        // Set user ID for E2EE
        const userId = authState.settings?.userId;
        if (userId) {
          manager.setUserId(userId);
        } else {
          console.warn(
            "[SyncInitializer] No userId available - E2EE may not work",
          );
        }

        // Initialize
        console.log("[SyncInitializer] Connecting to:", serverUrl);
        await manager.initialize(serverUrl);
        globalSyncManager = manager;

        // Start initial sync
        console.log("[SyncInitializer] Starting initial sync...");
        notifyStatusChange("syncing");
        await manager.performInitialSync();
        console.log("[SyncInitializer] Initial sync complete");
        await updatePendingCount();
        // Invalidate cache to refresh UI with any pulled entries
        queryClient.invalidateQueries({ queryKey: ["entries"] });
      } catch (error) {
        console.error("[SyncInitializer] Failed:", error);
        notifyStatusChange("error");
      } finally {
        isInitializingRef.current = false;
      }
    };

    initSync();

    return () => {
      // Don't shut down on unmount - keep sync running
      // Only shut down on auth state change (handled above)
    };
  }, [
    authState.status,
    authState.settings?.serverUrl,
    db,
    queryClient,
    updatePendingCount,
  ]);

  // Handle app resume - sync when app comes back to foreground
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === "active" && globalSyncManager) {
        console.log("[SyncInitializer] App resumed, checking for updates...");
        globalSyncManager
          .performInitialSync()
          .then(() => {
            console.log("[SyncInitializer] Resume sync complete");
            updatePendingCount();
            // Invalidate queries to refresh UI with any new data
            queryClient.invalidateQueries({ queryKey: ["entries"] });
          })
          .catch((error) => {
            console.warn("[SyncInitializer] Resume sync failed:", error);
          });
      }
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );
    return () => subscription.remove();
  }, [queryClient, updatePendingCount]);

  // This component doesn't render anything
  return null;
}
