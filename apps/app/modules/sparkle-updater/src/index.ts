import { Platform } from "react-native";
import SparkleUpdaterModule, { type VersionInfo } from "./SparkleUpdaterModule";

// Re-export types
export type { VersionInfo };

function getModule() {
  return SparkleUpdaterModule;
}

/**
 * Check if the Sparkle updater is available (macOS only)
 */
export function isSparkleAvailable(): boolean {
  return Platform.OS === "macos" && getModule() !== null;
}

/**
 * Check for updates and show the Sparkle update UI if available.
 * Opens the standard Sparkle update dialog showing release notes,
 * download progress, and install options.
 */
export async function checkForUpdates(): Promise<void> {
  if (Platform.OS !== "macos") {
    console.warn("[SparkleUpdater] checkForUpdates is only available on macOS");
    return;
  }

  const module = getModule();
  if (!module) {
    console.warn("[SparkleUpdater] Native module not available");
    return;
  }

  return module.checkForUpdates();
}

/**
 * Check for updates silently in the background.
 * Does not show any UI - useful for checking on app launch
 * and then showing a custom UI or notification.
 *
 * @returns true if an update is available
 */
export async function checkForUpdatesInBackground(): Promise<boolean> {
  if (Platform.OS !== "macos") {
    return false;
  }

  const module = getModule();
  if (!module) {
    return false;
  }

  try {
    return await module.checkForUpdatesInBackground();
  } catch {
    return false;
  }
}

/**
 * Get the current app version information.
 *
 * @returns Object containing currentVersion (CFBundleShortVersionString) and currentBuild (CFBundleVersion)
 */
export function getVersionInfo(): VersionInfo {
  if (Platform.OS !== "macos") {
    return {
      currentVersion: "0.0.0",
      currentBuild: "0",
    };
  }

  const module = getModule();
  if (!module) {
    return {
      currentVersion: "0.0.0",
      currentBuild: "0",
    };
  }

  return module.getVersionInfo();
}

/**
 * Check if automatic update checks are enabled.
 * When enabled, Sparkle will periodically check for updates automatically.
 */
export function isAutomaticCheckEnabled(): boolean {
  if (Platform.OS !== "macos") {
    return false;
  }

  const module = getModule();
  if (!module) {
    return false;
  }

  return module.isAutomaticCheckEnabled();
}

/**
 * Enable or disable automatic update checks.
 *
 * @param enabled - true to enable automatic checks, false to disable
 */
export function setAutomaticCheckEnabled(enabled: boolean): void {
  if (Platform.OS !== "macos") {
    return;
  }

  const module = getModule();
  if (!module) {
    return;
  }

  module.setAutomaticCheckEnabled(enabled);
}

/**
 * Get the last time the app checked for updates.
 *
 * @returns Date object representing the last check time, or null if never checked
 */
export function getLastUpdateCheckDate(): Date | null {
  if (Platform.OS !== "macos") {
    return null;
  }

  const module = getModule();
  if (!module) {
    return null;
  }

  const dateString = module.getLastUpdateCheckDate();
  if (!dateString) {
    return null;
  }

  return new Date(dateString);
}
