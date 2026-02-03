/**
 * Global model download status tracking
 * Allows components to subscribe to download progress for any model
 * Persists download state to survive app restarts
 */

import * as SecureStore from "expo-secure-store";

const DOWNLOAD_STATUS_KEY = "model_download_status";

export interface DownloadStatus {
  modelId: string;
  modelName: string;
  progress: number; // 0-100
  isDownloading: boolean;
  error?: string;
}

type Listener = (status: DownloadStatus | null) => void;

class ModelDownloadStatusManager {
  private currentDownload: DownloadStatus | null = null;
  private listeners: Set<Listener> = new Set();
  private isInitialized = false;

  /**
   * Initialize by loading persisted download state
   *
   * NOTE: We intentionally do NOT restore isDownloading=true on app restart.
   * If a download was interrupted (app closed, crashed, etc.), the download
   * is no longer actively running. The PendingDownloadBanner and PendingDownloads
   * components handle resuming interrupted downloads via persistentDownloadManager.
   *
   * Restoring isDownloading=true would incorrectly show ModelDownloadIndicator
   * as if a download is in progress when it's actually paused.
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      // Clear any stale download state from previous session
      // Interrupted downloads are handled by persistentDownloadManager
      const stored = await SecureStore.getItemAsync(DOWNLOAD_STATUS_KEY);
      if (stored) {
        const status = JSON.parse(stored) as DownloadStatus;
        if (status.isDownloading) {
          console.log(
            `[ModelDownloadStatus] Clearing stale download state for ${status.modelId} (app was restarted)`,
          );
          await this.clearPersistedState();
        }
      }
    } catch (e) {
      console.error("[ModelDownloadStatus] Failed to initialize:", e);
    }

    this.isInitialized = true;
    this.notifyListeners();
  }

  /**
   * Start tracking a download
   */
  async startDownload(modelId: string, modelName: string) {
    this.currentDownload = {
      modelId,
      modelName,
      progress: 0,
      isDownloading: true,
    };
    await this.persistState();
    this.notifyListeners();
  }

  /**
   * Update download progress
   */
  async updateProgress(modelId: string, progress: number) {
    if (this.currentDownload?.modelId === modelId) {
      // Create a new object to ensure React detects the change
      this.currentDownload = {
        ...this.currentDownload,
        progress: Math.min(100, Math.max(0, progress)),
      };

      // Only persist every 5% to avoid too many writes
      if (progress % 5 === 0 || progress === 100) {
        await this.persistState();
      }

      this.notifyListeners();
    }
  }

  /**
   * Mark download as complete
   */
  async completeDownload(modelId: string) {
    if (this.currentDownload?.modelId === modelId) {
      this.currentDownload = null;
      await this.clearPersistedState();
      this.notifyListeners();
    }
  }

  /**
   * Mark download as failed
   */
  async failDownload(modelId: string, error: string) {
    if (this.currentDownload?.modelId === modelId) {
      // Create a new object to ensure React detects the change
      this.currentDownload = {
        ...this.currentDownload,
        error,
        isDownloading: false,
      };
      await this.persistState();
      this.notifyListeners();

      // Clear after a delay
      setTimeout(async () => {
        if (this.currentDownload?.modelId === modelId) {
          this.currentDownload = null;
          await this.clearPersistedState();
          this.notifyListeners();
        }
      }, 5000);
    }
  }

  /**
   * Get current download status
   */
  getCurrentDownload(): DownloadStatus | null {
    return this.currentDownload;
  }

  /**
   * Subscribe to download status changes
   */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    // Immediately notify with current status
    listener(this.currentDownload);

    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => listener(this.currentDownload));
  }

  /**
   * Persist current download state
   */
  private async persistState() {
    if (this.currentDownload) {
      try {
        await SecureStore.setItemAsync(
          DOWNLOAD_STATUS_KEY,
          JSON.stringify(this.currentDownload),
        );
      } catch (e) {
        console.error("[ModelDownloadStatus] Failed to persist state:", e);
      }
    }
  }

  /**
   * Clear persisted state
   */
  private async clearPersistedState() {
    try {
      await SecureStore.deleteItemAsync(DOWNLOAD_STATUS_KEY);
    } catch (e) {
      console.error(
        "[ModelDownloadStatus] Failed to clear persisted state:",
        e,
      );
    }
  }
}

// Global singleton instance
export const modelDownloadStatus = new ModelDownloadStatusManager();
