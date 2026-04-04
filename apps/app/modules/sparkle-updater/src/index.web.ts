/**
 * Web shim for SparkleUpdater module
 *
 * Sparkle is a macOS-only update framework.
 * On web/Tauri, updates are handled by the Tauri updater plugin.
 * All methods are safe no-ops that return default values.
 */

export interface VersionInfo {
  currentVersion: string;
  currentBuild: string;
}

/**
 * Check if the Sparkle updater is available.
 * Always returns false on web.
 */
export function isSparkleAvailable(): boolean {
  return false;
}

/**
 * Check for updates - no-op on web.
 */
export async function checkForUpdates(): Promise<void> {
  // No-op on web
}

/**
 * Check for updates in background - no-op on web.
 */
export async function checkForUpdatesInBackground(): Promise<boolean> {
  return false;
}

/**
 * Get version info.
 * Returns placeholder values on web.
 */
export function getVersionInfo(): VersionInfo {
  return {
    currentVersion: "0.0.0",
    currentBuild: "0",
  };
}

/**
 * Check if automatic update checks are enabled.
 * Always returns false on web.
 */
export function isAutomaticCheckEnabled(): boolean {
  return false;
}

/**
 * Enable or disable automatic update checks - no-op on web.
 */
export function setAutomaticCheckEnabled(_enabled: boolean): void {
  // No-op on web
}

/**
 * Get the last update check date.
 * Always returns null on web.
 */
export function getLastUpdateCheckDate(): Date | null {
  return null;
}
