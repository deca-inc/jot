import { requireNativeModule } from "expo-modules-core";

export interface VersionInfo {
  currentVersion: string;
  currentBuild: string;
}

export interface SparkleUpdaterModuleType {
  /**
   * Check for updates and show the Sparkle update UI if available
   */
  checkForUpdates(): Promise<void>;

  /**
   * Check for updates in the background (silent check)
   * @returns true if an update is available
   */
  checkForUpdatesInBackground(): Promise<boolean>;

  /**
   * Get the current app version info
   */
  getVersionInfo(): VersionInfo;

  /**
   * Check if automatic update checks are enabled
   */
  isAutomaticCheckEnabled(): boolean;

  /**
   * Enable or disable automatic update checks
   */
  setAutomaticCheckEnabled(enabled: boolean): void;

  /**
   * Get the last time the app checked for updates
   * @returns ISO date string or null if never checked
   */
  getLastUpdateCheckDate(): string | null;
}

// Try to load the native module
let nativeModule: SparkleUpdaterModuleType | null = null;
try {
  nativeModule =
    requireNativeModule<SparkleUpdaterModuleType>("SparkleUpdater");
} catch {
  console.warn("[SparkleUpdater] Native module not available");
}

export default nativeModule;
