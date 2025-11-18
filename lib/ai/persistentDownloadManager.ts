/**
 * Persistent Download Manager
 * 
 * Manages resumable downloads that persist across app sessions.
 * Downloads will continue in the background and can be resumed if interrupted.
 */

import * as FileSystem from "expo-file-system/legacy";
import { Paths } from "expo-file-system";
import * as SecureStore from 'expo-secure-store';

export interface DownloadMetadata {
  modelId: string;
  modelName: string;
  url: string;
  destination: string;
  bytesWritten: number;
  bytesTotal: number;
  startedAt: number;
  fileType: 'model' | 'tokenizer' | 'config';
}

interface PersistedDownload {
  metadata: DownloadMetadata;
  resumeData: string;
}

const DOWNLOADS_KEY = 'persistent_downloads';
const DOWNLOADS_DIR_KEY = 'downloads_directory';

class PersistentDownloadManager {
  private activeDownloads = new Map<string, FileSystem.DownloadResumable>();
  private downloadMetadata = new Map<string, DownloadMetadata>();

  /**
   * Get a unique key for a download based on model ID and file type
   */
  private getDownloadKey(modelId: string, fileType: DownloadMetadata['fileType']): string {
    return `${modelId}:${fileType}`;
  }

  /**
   * Start a new download or resume an existing one
   */
  async startDownload(
    modelId: string,
    modelName: string,
    url: string,
    destination: string,
    fileType: DownloadMetadata['fileType'],
    onProgress?: (progress: number, bytesWritten: number, bytesTotal: number) => void
  ): Promise<FileSystem.DownloadResumable> {
    const key = this.getDownloadKey(modelId, fileType);
    
    // Check if already downloading
    const existing = this.activeDownloads.get(key);
    if (existing) {
      return existing;
    }

    // Check if there's a persisted download to resume
    const persisted = await this.loadPersistedDownload(key);
    let downloadResumable: FileSystem.DownloadResumable;

    if (persisted) {
      console.log(`[PersistentDownloadManager] Resuming download for ${key}`);
      downloadResumable = new FileSystem.DownloadResumable(
        persisted.metadata.url,
        persisted.metadata.destination,
        {},
        (downloadProgress) => {
          const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
          
          // Update metadata
          const metadata = this.downloadMetadata.get(key);
          if (metadata) {
            metadata.bytesWritten = downloadProgress.totalBytesWritten;
            metadata.bytesTotal = downloadProgress.totalBytesExpectedToWrite;
          }
          
          onProgress?.(progress, downloadProgress.totalBytesWritten, downloadProgress.totalBytesExpectedToWrite);
        },
        persisted.resumeData
      );
    } else {
      console.log(`[PersistentDownloadManager] Starting new download for ${key}`);
      // Create temporary download file
      const tempDestination = destination + '.download';
      
      downloadResumable = FileSystem.createDownloadResumable(
        url,
        tempDestination,
        {},
        (downloadProgress) => {
          const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
          
          // Update metadata
          const metadata = this.downloadMetadata.get(key);
          if (metadata) {
            metadata.bytesWritten = downloadProgress.totalBytesWritten;
            metadata.bytesTotal = downloadProgress.totalBytesExpectedToWrite;
          }
          
          onProgress?.(progress, downloadProgress.totalBytesWritten, downloadProgress.totalBytesExpectedToWrite);
          
          // Periodically save progress
          this.saveDownloadState(key, downloadResumable, {
            modelId,
            modelName,
            url,
            destination: tempDestination,
            bytesWritten: downloadProgress.totalBytesWritten,
            bytesTotal: downloadProgress.totalBytesExpectedToWrite,
            startedAt: Date.now(),
            fileType,
          });
        }
      );
    }

    // Store metadata
    const metadata: DownloadMetadata = persisted?.metadata || {
      modelId,
      modelName,
      url,
      destination: destination + '.download',
      bytesWritten: 0,
      bytesTotal: 0,
      startedAt: Date.now(),
      fileType,
    };
    
    this.downloadMetadata.set(key, metadata);
    this.activeDownloads.set(key, downloadResumable);
    
    return downloadResumable;
  }

  /**
   * Execute a download and handle completion
   */
  async executeDownload(
    downloadResumable: FileSystem.DownloadResumable,
    modelId: string,
    fileType: DownloadMetadata['fileType'],
    finalDestination: string
  ): Promise<string> {
    const key = this.getDownloadKey(modelId, fileType);
    
    try {
      const result = await downloadResumable.downloadAsync();
      
      if (!result || result.status !== 200) {
        throw new Error(`Download failed with status ${result?.status || 'unknown'}`);
      }

      // Move from temp location to final destination
      const tempPath = result.uri;
      await FileSystem.moveAsync({ from: tempPath, to: finalDestination });
      
      // Clean up
      await this.completeDownload(modelId, fileType);
      
      return finalDestination;
    } catch (error) {
      // Save state on error so we can resume
      await this.saveDownloadState(key, downloadResumable, this.downloadMetadata.get(key)!);
      throw error;
    }
  }

  /**
   * Pause a download (saves state for later resume)
   */
  async pauseDownload(modelId: string, fileType: DownloadMetadata['fileType']): Promise<void> {
    const key = this.getDownloadKey(modelId, fileType);
    const downloadResumable = this.activeDownloads.get(key);
    const metadata = this.downloadMetadata.get(key);
    
    if (downloadResumable && metadata) {
      await downloadResumable.pauseAsync();
      await this.saveDownloadState(key, downloadResumable, metadata);
    }
  }

  /**
   * Complete a download and clean up persisted state
   */
  async completeDownload(modelId: string, fileType: DownloadMetadata['fileType']): Promise<void> {
    const key = this.getDownloadKey(modelId, fileType);
    
    this.activeDownloads.delete(key);
    this.downloadMetadata.delete(key);
    
    // Remove from persisted storage
    const allDownloads = await this.loadAllPersistedDownloads();
    delete allDownloads[key];
    await SecureStore.setItemAsync(DOWNLOADS_KEY, JSON.stringify(allDownloads));
  }

  /**
   * Cancel a download and clean up files
   */
  async cancelDownload(modelId: string, fileType: DownloadMetadata['fileType']): Promise<void> {
    const key = this.getDownloadKey(modelId, fileType);
    const downloadResumable = this.activeDownloads.get(key);
    const metadata = this.downloadMetadata.get(key);
    
    if (downloadResumable) {
      await downloadResumable.pauseAsync();
    }
    
    // Delete partial download file
    if (metadata) {
      try {
        await FileSystem.deleteAsync(metadata.destination, { idempotent: true });
      } catch (e) {
        console.warn(`[PersistentDownloadManager] Failed to delete partial download:`, e);
      }
    }
    
    await this.completeDownload(modelId, fileType);
  }

  /**
   * Get active download for a model
   */
  getActiveDownload(modelId: string, fileType: DownloadMetadata['fileType']): FileSystem.DownloadResumable | undefined {
    const key = this.getDownloadKey(modelId, fileType);
    return this.activeDownloads.get(key);
  }

  /**
   * Get metadata for a download
   */
  getDownloadMetadata(modelId: string, fileType: DownloadMetadata['fileType']): DownloadMetadata | undefined {
    const key = this.getDownloadKey(modelId, fileType);
    return this.downloadMetadata.get(key);
  }

  /**
   * Check if a download is in progress
   */
  isDownloading(modelId: string, fileType: DownloadMetadata['fileType']): boolean {
    const key = this.getDownloadKey(modelId, fileType);
    return this.activeDownloads.has(key);
  }

  /**
   * Get all persisted downloads from storage
   */
  private async loadAllPersistedDownloads(): Promise<Record<string, PersistedDownload>> {
    try {
      const stored = await SecureStore.getItemAsync(DOWNLOADS_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch (e) {
      console.error('[PersistentDownloadManager] Failed to load persisted downloads:', e);
      return {};
    }
  }

  /**
   * Load a specific persisted download
   */
  private async loadPersistedDownload(key: string): Promise<PersistedDownload | null> {
    const allDownloads = await this.loadAllPersistedDownloads();
    return allDownloads[key] || null;
  }

  /**
   * Save download state to persistent storage
   */
  private async saveDownloadState(
    key: string,
    downloadResumable: FileSystem.DownloadResumable,
    metadata: DownloadMetadata
  ): Promise<void> {
    try {
      const resumeData = downloadResumable.savable();
      const allDownloads = await this.loadAllPersistedDownloads();
      
      allDownloads[key] = {
        metadata,
        resumeData: JSON.stringify(resumeData),
      };
      
      await SecureStore.setItemAsync(DOWNLOADS_KEY, JSON.stringify(allDownloads));
    } catch (e) {
      console.error('[PersistentDownloadManager] Failed to save download state:', e);
    }
  }

  /**
   * Resume all persisted downloads on app startup
   */
  async resumeAllDownloads(
    onProgress?: (modelId: string, fileType: DownloadMetadata['fileType'], progress: number) => void
  ): Promise<void> {
    const allDownloads = await this.loadAllPersistedDownloads();
    
    for (const [key, persisted] of Object.entries(allDownloads)) {
      const { metadata } = persisted;
      
      console.log(`[PersistentDownloadManager] Found persisted download: ${key}`);
      
      // Check if the partial file still exists
      const fileInfo = await FileSystem.getInfoAsync(metadata.destination);
      if (!fileInfo.exists) {
        console.log(`[PersistentDownloadManager] Partial file missing for ${key}, cleaning up`);
        await this.completeDownload(metadata.modelId, metadata.fileType);
        continue;
      }
      
      // Don't auto-resume - just load the metadata so it's available
      // The app can decide whether to resume downloads
      this.downloadMetadata.set(key, metadata);
      
      console.log(`[PersistentDownloadManager] Download ${key} ready to resume`);
    }
  }

  /**
   * Get all pending downloads that can be resumed
   */
  async getPendingDownloads(): Promise<DownloadMetadata[]> {
    const allDownloads = await this.loadAllPersistedDownloads();
    return Object.values(allDownloads).map(d => d.metadata);
  }

  /**
   * Clean up old/stale downloads
   */
  async cleanupOldDownloads(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    const now = Date.now();
    const allDownloads = await this.loadAllPersistedDownloads();
    const toDelete: string[] = [];
    
    for (const [key, persisted] of Object.entries(allDownloads)) {
      const age = now - persisted.metadata.startedAt;
      if (age > maxAgeMs) {
        console.log(`[PersistentDownloadManager] Cleaning up stale download: ${key}`);
        toDelete.push(key);
        
        // Delete partial file
        try {
          await FileSystem.deleteAsync(persisted.metadata.destination, { idempotent: true });
        } catch (e) {
          console.warn(`[PersistentDownloadManager] Failed to delete stale file:`, e);
        }
      }
    }
    
    if (toDelete.length > 0) {
      for (const key of toDelete) {
        delete allDownloads[key];
      }
      await SecureStore.setItemAsync(DOWNLOADS_KEY, JSON.stringify(allDownloads));
    }
  }
}

// Global singleton
export const persistentDownloadManager = new PersistentDownloadManager();

