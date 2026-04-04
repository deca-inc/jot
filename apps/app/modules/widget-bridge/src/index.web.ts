/**
 * Web shim for widget-bridge module
 *
 * iOS/Android widgets are not available on web/Tauri.
 * All methods are safe no-ops that return default values.
 */

/**
 * Set widget data - no-op on web.
 */
export async function setWidgetData(_json: string): Promise<boolean> {
  return false;
}

/**
 * Reload all widget timelines (iOS) - no-op on web.
 */
export async function reloadAllTimelines(): Promise<boolean> {
  return false;
}

/**
 * Update all widgets (Android) - no-op on web.
 */
export async function updateAllWidgets(): Promise<boolean> {
  return false;
}

/**
 * Get the App Group container path - not available on web.
 */
export function getAppGroupContainerPath(): string | null {
  return null;
}

/**
 * Refresh widgets on both platforms - no-op on web.
 */
export async function refreshWidgets(): Promise<boolean> {
  return false;
}
