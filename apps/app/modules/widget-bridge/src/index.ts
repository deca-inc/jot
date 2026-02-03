import { Platform } from "react-native";
import WidgetBridgeModule from "./WidgetBridgeModule";

// Get the native module (may be null if not available)
function getWidgetBridgeModule() {
  return WidgetBridgeModule;
}

/**
 * Set the countdown data for widgets to display.
 * @param json - JSON string containing array of WidgetCountdownData
 */
export async function setWidgetData(json: string): Promise<boolean> {
  const module = getWidgetBridgeModule();
  if (!module) return false;
  try {
    return await module.setWidgetData(json);
  } catch {
    return false;
  }
}

/**
 * Reload all widget timelines (iOS).
 * On Android, use updateAllWidgets() instead.
 */
export async function reloadAllTimelines(): Promise<boolean> {
  if (Platform.OS !== "ios") return false;
  const module = getWidgetBridgeModule();
  if (!module) return false;
  try {
    return await module.reloadAllTimelines();
  } catch {
    return false;
  }
}

/**
 * Update all widgets with latest data (Android).
 * On iOS, use reloadAllTimelines() instead.
 */
export async function updateAllWidgets(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  const module = getWidgetBridgeModule();
  if (!module) return false;
  try {
    return await module.updateAllWidgets();
  } catch {
    return false;
  }
}

/**
 * Get the App Group container path for shared data (iOS only).
 */
export function getAppGroupContainerPath(): string | null {
  if (Platform.OS !== "ios") return null;
  const module = getWidgetBridgeModule();
  if (!module) return null;
  return module.getAppGroupContainerPath();
}

/**
 * Refresh widgets on both platforms.
 * Calls the appropriate method based on platform.
 */
export async function refreshWidgets(): Promise<boolean> {
  if (Platform.OS === "ios") {
    return reloadAllTimelines();
  } else if (Platform.OS === "android") {
    return updateAllWidgets();
  }
  return false;
}
