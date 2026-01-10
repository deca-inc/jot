import { useEffect, useRef, useCallback } from "react";
import { AppState, AppStateStatus } from "react-native";
import { Entry } from "../db/entries";
import { syncCountdownsToWidgets } from "./widgetDataBridge";

/**
 * Hook to sync countdown entries to widgets
 * Syncs on mount, app foreground, and when entries change
 */
export function useWidgetSync(countdownEntries: Entry[] | undefined): void {
  const previousEntriesRef = useRef<string>("");

  const syncWidgets = useCallback(async () => {
    if (!countdownEntries) return;

    // Create a hash of entry IDs and updatedAt to detect changes
    const entriesHash = countdownEntries
      .filter((e) => e.type === "countdown" && !e.archivedAt)
      .map((e) => `${e.id}:${e.updatedAt}`)
      .join(",");

    // Skip if no changes
    if (entriesHash === previousEntriesRef.current) return;
    previousEntriesRef.current = entriesHash;

    await syncCountdownsToWidgets(countdownEntries);
  }, [countdownEntries]);

  // Sync when entries change
  useEffect(() => {
    syncWidgets();
  }, [syncWidgets]);

  // Sync on app foreground
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === "active") {
        syncWidgets();
      }
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );
    return () => subscription.remove();
  }, [syncWidgets]);
}
