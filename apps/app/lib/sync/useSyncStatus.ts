/**
 * Sync Status Hook
 *
 * Provides real-time sync connection status.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useSyncSettings } from "../db/syncSettings";
import * as authService from "./syncAuthService";

export type SyncConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error"
  | "session_expired";

export interface SyncStatusState {
  connectionStatus: SyncConnectionStatus;
  lastChecked: number | null;
  errorMessage: string | null;
}

export interface UseSyncStatusReturn {
  status: SyncStatusState;
  checkConnection: () => Promise<void>;
  isConnected: boolean;
  isSessionExpired: boolean;
}

const CHECK_INTERVAL_MS = 30 * 1000; // 30 seconds

/**
 * Hook for monitoring sync connection status
 */
export function useSyncStatus(): UseSyncStatusReturn {
  const syncSettings = useSyncSettings();
  const syncSettingsRef = useRef(syncSettings);
  syncSettingsRef.current = syncSettings;

  const [status, setStatus] = useState<SyncStatusState>({
    connectionStatus: "disconnected",
    lastChecked: null,
    errorMessage: null,
  });

  const checkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isCheckingRef = useRef(false);
  const hasCheckedOnceRef = useRef(false);

  // Check connection - stable callback using refs
  const checkConnection = useCallback(async (): Promise<void> => {
    if (isCheckingRef.current) return;
    isCheckingRef.current = true;

    try {
      const settings = await syncSettingsRef.current.getSettings();

      if (!settings.serverUrl || !settings.enabled) {
        setStatus((prev) => {
          // Only update if actually changed
          if (prev.connectionStatus === "disconnected") return prev;
          return {
            connectionStatus: "disconnected",
            lastChecked: Date.now(),
            errorMessage: null,
          };
        });
        return;
      }

      // Only show "connecting" on first check
      if (!hasCheckedOnceRef.current) {
        setStatus((prev) => ({
          ...prev,
          connectionStatus: "connecting",
        }));
      }

      const serverStatus = await authService.checkServerStatus(
        settings.serverUrl,
      );

      if (serverStatus.ok) {
        setStatus((prev) => {
          // Only update if actually changed
          if (prev.connectionStatus === "connected" && !prev.errorMessage) {
            return prev;
          }
          return {
            connectionStatus: "connected",
            lastChecked: Date.now(),
            errorMessage: null,
          };
        });
        // Don't await - fire and forget to avoid blocking
        syncSettingsRef.current.recordSyncSuccess().catch(() => {});
      } else {
        setStatus({
          connectionStatus: "error",
          lastChecked: Date.now(),
          errorMessage: "Server is not responding correctly",
        });
        syncSettingsRef.current
          .recordSyncError("Server is not responding correctly")
          .catch(() => {});
      }
    } catch (error) {
      const err = error as { message?: string };
      const errorMessage = err.message || "Failed to connect to server";

      setStatus({
        connectionStatus: "error",
        lastChecked: Date.now(),
        errorMessage,
      });
      syncSettingsRef.current.recordSyncError(errorMessage).catch(() => {});
    } finally {
      isCheckingRef.current = false;
      hasCheckedOnceRef.current = true;
    }
  }, []); // No dependencies - uses refs

  // Set up periodic checking and app state handling
  useEffect(() => {
    // Initial check
    checkConnection();

    // Set up periodic checking with fixed interval
    checkIntervalRef.current = setInterval(() => {
      checkConnection();
    }, CHECK_INTERVAL_MS);

    // Handle app state changes
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === "active") {
        // Check immediately when app comes to foreground
        checkConnection();
      }
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
      subscription.remove();
    };
  }, [checkConnection]);

  return {
    status,
    checkConnection,
    isConnected: status.connectionStatus === "connected",
    isSessionExpired: status.connectionStatus === "session_expired",
  };
}
