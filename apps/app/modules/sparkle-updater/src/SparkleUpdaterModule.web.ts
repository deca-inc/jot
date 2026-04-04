/**
 * Web shim for SparkleUpdaterModule
 *
 * Sparkle is a macOS-only update framework. On web/Tauri,
 * updates are handled differently (Tauri updater plugin).
 * All methods return safe no-op/default values.
 */

export interface VersionInfo {
  currentVersion: string;
  currentBuild: string;
}

export interface SparkleUpdaterModuleType {
  checkForUpdates(): Promise<void>;
  checkForUpdatesInBackground(): Promise<boolean>;
  getVersionInfo(): VersionInfo;
  isAutomaticCheckEnabled(): boolean;
  setAutomaticCheckEnabled(enabled: boolean): void;
  getLastUpdateCheckDate(): string | null;
}

const webModule: SparkleUpdaterModuleType | null = null;

export default webModule;
