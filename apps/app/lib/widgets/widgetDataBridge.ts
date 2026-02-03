import {
  refreshWidgets,
  setWidgetData,
} from "../../modules/widget-bridge/src/index";
import { Entry } from "../db/entries";
import { extractCountdownData } from "../utils/countdown";

/**
 * Data structure for countdown widgets
 * This is the minimal data needed for widget display
 */
export interface WidgetCountdownData {
  entryId: number;
  title: string;
  targetDate: number;
  isCountUp: boolean;
  isPinned: boolean;
  updatedAt: number;
}

/**
 * Convert entries to widget data format
 */
function entriesToWidgetData(entries: Entry[]): WidgetCountdownData[] {
  const countdowns: WidgetCountdownData[] = [];

  for (const entry of entries) {
    // Skip non-countdown entries and archived entries
    if (entry.type !== "countdown" || entry.archivedAt !== null) continue;

    const data = extractCountdownData(entry.blocks);
    if (!data) continue;

    countdowns.push({
      entryId: entry.id,
      title: data.title,
      targetDate: data.targetDate,
      isCountUp: data.isCountUp ?? false,
      isPinned: entry.isPinned,
      updatedAt: entry.updatedAt,
    });
  }

  // Sort by pinned first, then by updated
  countdowns.sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });

  return countdowns;
}

/**
 * Sync countdown entries to widget data store
 * Call this whenever countdowns are created, updated, or deleted
 */
export async function syncCountdownsToWidgets(
  entries: Entry[],
): Promise<boolean> {
  try {
    const widgetData = entriesToWidgetData(entries);
    const json = JSON.stringify(widgetData);

    // Write data to shared storage
    const writeSuccess = await setWidgetData(json);
    if (!writeSuccess) {
      console.warn("[WidgetBridge] Failed to write widget data");
      return false;
    }

    // Request widget refresh
    const refreshSuccess = await refreshWidgets();
    if (!refreshSuccess) {
      // This is ok - widgets may not exist yet
      console.log(
        "[WidgetBridge] Widget refresh returned false (ok if no widgets exist)",
      );
    }

    return true;
  } catch (error) {
    console.error("[WidgetBridge] Error syncing to widgets:", error);
    return false;
  }
}

/**
 * Sync a single countdown entry
 * Utility function when only one entry changed
 */
export async function syncSingleCountdownToWidgets(
  entry: Entry,
  allEntries: Entry[],
): Promise<boolean> {
  // Just sync all entries - the native side handles merging
  return syncCountdownsToWidgets(allEntries);
}
