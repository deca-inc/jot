/**
 * Global model download status tracking
 * Allows components to subscribe to download progress for any model
 */

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

  /**
   * Start tracking a download
   */
  startDownload(modelId: string, modelName: string) {
    this.currentDownload = {
      modelId,
      modelName,
      progress: 0,
      isDownloading: true,
    };
    this.notifyListeners();
  }

  /**
   * Update download progress
   */
  updateProgress(modelId: string, progress: number) {
    if (this.currentDownload?.modelId === modelId) {
      // Create a new object to ensure React detects the change
      this.currentDownload = {
        ...this.currentDownload,
        progress: Math.min(100, Math.max(0, progress)),
      };
      this.notifyListeners();
    }
  }

  /**
   * Mark download as complete
   */
  completeDownload(modelId: string) {
    if (this.currentDownload?.modelId === modelId) {
      this.currentDownload = null;
      this.notifyListeners();
    }
  }

  /**
   * Mark download as failed
   */
  failDownload(modelId: string, error: string) {
    if (this.currentDownload?.modelId === modelId) {
      // Create a new object to ensure React detects the change
      this.currentDownload = {
        ...this.currentDownload,
        error,
        isDownloading: false,
      };
      this.notifyListeners();

      // Clear after a delay
      setTimeout(() => {
        if (this.currentDownload?.modelId === modelId) {
          this.currentDownload = null;
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
}

// Global singleton instance
export const modelDownloadStatus = new ModelDownloadStatusManager();

