/**
 * Persistent Download Manager
 * 
 * Manages resumable downloads that persist across app sessions.
 * Downloads will continue in the background and can be resumed if interrupted.
 */

import { File } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
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
    onProgress?: (progress: number, bytesWritten: number, bytesTotal: number) => void,
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
    let isResuming = false;
    let effectiveDestination = destination + '.download';

    // Try to resume if we have persisted data
    if (persisted) {
      // Check if the partial download file still exists
      const fileInfo = await FileSystem.getInfoAsync(persisted.metadata.destination);

      if (fileInfo.exists && persisted.resumeData) {
        // Parse the resumeData - it was stringified when saved
        // savable() returns { url, fileUri, options, resumeData }
        let parsedResumeData: string | undefined;
        try {
          const savedData = JSON.parse(persisted.resumeData);
          // The savable() returns an object with resumeData inside it
          parsedResumeData = savedData.resumeData;
          console.log(`[PersistentDownloadManager] Parsed savable data for ${key}:`, {
            hasResumeData: !!parsedResumeData,
            resumeDataLength: parsedResumeData?.length,
            fileUri: savedData.fileUri,
          });
        } catch (e) {
          console.error(`[PersistentDownloadManager] Failed to parse resumeData for ${key}:`, e);
        }

        // Check if we have resumeData from pauseAsync OR if we can resume via HTTP Range
        const existingFileSize = fileInfo.size || 0;

        if (parsedResumeData) {
          // We have proper resumeData from pauseAsync - use it
          console.log(`[PersistentDownloadManager] Resuming download for ${key} with resumeData`);

          downloadResumable = new FileSystem.DownloadResumable(
            persisted.metadata.url,
            persisted.metadata.destination,
            {},
            (downloadProgress) => {
              const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;

              // Update metadata
              const meta = this.downloadMetadata.get(key);
              if (meta) {
                meta.bytesWritten = downloadProgress.totalBytesWritten;
                meta.bytesTotal = downloadProgress.totalBytesExpectedToWrite;
              }

              onProgress?.(progress, downloadProgress.totalBytesWritten, downloadProgress.totalBytesExpectedToWrite);
            },
            parsedResumeData,
          );
          isResuming = true;
          effectiveDestination = persisted.metadata.destination;
        } else if (existingFileSize > 0 && persisted.metadata.bytesTotal > 0) {
          // No resumeData, but we have a partial file - try HTTP Range resume
          // This handles the case where app crashed without calling pauseAsync
          console.log(`[PersistentDownloadManager] Attempting HTTP Range resume for ${key} from byte ${existingFileSize}`);

          // Use HTTP Range header to resume from where we left off
          downloadResumable = FileSystem.createDownloadResumable(
            persisted.metadata.url,
            persisted.metadata.destination,
            {
              headers: {
                'Range': `bytes=${existingFileSize}-`,
              },
            },
            (downloadProgress) => {
              // Adjust progress to account for already downloaded bytes
              const totalWritten = existingFileSize + downloadProgress.totalBytesWritten;
              const totalExpected = persisted.metadata.bytesTotal;
              const progress = totalWritten / totalExpected;

              // Update metadata
              const meta = this.downloadMetadata.get(key);
              if (meta) {
                meta.bytesWritten = totalWritten;
                meta.bytesTotal = totalExpected;
              }

              onProgress?.(progress, totalWritten, totalExpected);
            },
          );
          isResuming = true;
          effectiveDestination = persisted.metadata.destination;

          // Mark this as a Range resume so we handle it differently
          (downloadResumable as any)._isRangeResume = true;
          (downloadResumable as any)._existingBytes = existingFileSize;
        } else {
          // No resumeData and no usable partial file - start fresh
          console.log(`[PersistentDownloadManager] No resumeData for ${key} - starting fresh`);
          await this.completeDownload(modelId, fileType);
          try {
            await FileSystem.deleteAsync(persisted.metadata.destination, { idempotent: true });
          } catch (_e) {
            // Ignore delete errors
          }
        }
      } else {
        console.log(`[PersistentDownloadManager] Partial file missing for ${key}, starting fresh`);
        // Clean up stale persisted data
        await this.completeDownload(modelId, fileType);
      }
    }

    // Start fresh download if not resuming
    if (!isResuming) {
      console.log(`[PersistentDownloadManager] Starting new download for ${key}`);
      const tempDestination = destination + '.download';
      effectiveDestination = tempDestination;

      const progressCallback = (downloadProgress: FileSystem.DownloadProgressData) => {
        const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;

        // Update metadata
        const meta = this.downloadMetadata.get(key);
        if (meta) {
          meta.bytesWritten = downloadProgress.totalBytesWritten;
          meta.bytesTotal = downloadProgress.totalBytesExpectedToWrite;
        }

        onProgress?.(progress, downloadProgress.totalBytesWritten, downloadProgress.totalBytesExpectedToWrite);

        // Periodically save progress (get the current resumable from the map)
        const currentResumable = this.activeDownloads.get(key);
        if (currentResumable) {
          this.saveDownloadState(key, currentResumable, {
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
      };

      downloadResumable = FileSystem.createDownloadResumable(
        url,
        tempDestination,
        {},
        progressCallback,
      );
    }

    // Store metadata
    const metadata: DownloadMetadata = (isResuming && persisted?.metadata) ? persisted.metadata : {
      modelId,
      modelName,
      url,
      destination: effectiveDestination,
      bytesWritten: 0,
      bytesTotal: 0,
      startedAt: Date.now(),
      fileType,
    };

    this.downloadMetadata.set(key, metadata);
    this.activeDownloads.set(key, downloadResumable!);

    // Mark whether this is a resume so executeDownload knows which method to call
    (downloadResumable! as any)._isResuming = isResuming;

    return downloadResumable!;
  }

  /**
   * Execute a download and handle completion
   */
  async executeDownload(
    downloadResumable: FileSystem.DownloadResumable,
    modelId: string,
    fileType: DownloadMetadata['fileType'],
    finalDestination: string,
  ): Promise<string> {
    const key = this.getDownloadKey(modelId, fileType);
    const isResuming = (downloadResumable as any)._isResuming === true;
    const isRangeResume = (downloadResumable as any)._isRangeResume === true;

    try {
      let result;

      if (isRangeResume) {
        // For HTTP Range resume, we use downloadAsync (not resumeAsync)
        // The Range header was already set in the options
        console.log(`[PersistentDownloadManager] Calling downloadAsync with Range header for ${key}`);
        result = await downloadResumable.downloadAsync();

        // Range requests return 206 Partial Content on success
        if (!result || (result.status !== 200 && result.status !== 206)) {
          throw new Error(`Download failed with status ${result?.status || 'unknown'}`);
        }

        // For Range resume, the new content was downloaded to a temp file
        // We need to append it to the existing partial file, then move to final destination
        const existingBytes = (downloadResumable as any)._existingBytes || 0;
        const metadata = this.downloadMetadata.get(key);
        const partialFilePath = metadata?.destination;

        if (partialFilePath && existingBytes > 0) {
          // The Range request downloaded remaining bytes to result.uri
          // We need to combine: existing partial file + new chunk -> final file
          console.log(`[PersistentDownloadManager] Combining partial file (${existingBytes} bytes) with new chunk at ${result.uri}`);

          // Use chunked copy to handle large files without memory issues
          await this.concatenateFiles(partialFilePath, result.uri, finalDestination);

          // Clean up temp files
          await FileSystem.deleteAsync(partialFilePath, { idempotent: true });
          await FileSystem.deleteAsync(result.uri, { idempotent: true });
        } else {
          // No existing bytes, just move the downloaded file
          await FileSystem.moveAsync({ from: result.uri, to: finalDestination });
        }
      } else if (isResuming) {
        // Use resumeAsync for proper pause/resume (has resumeData)
        console.log(`[PersistentDownloadManager] Calling resumeAsync for ${key}`);
        result = await downloadResumable.resumeAsync();

        if (!result || result.status !== 200) {
          throw new Error(`Download failed with status ${result?.status || 'unknown'}`);
        }

        // Move from temp location to final destination
        await FileSystem.moveAsync({ from: result.uri, to: finalDestination });
      } else {
        // Fresh download
        console.log(`[PersistentDownloadManager] Calling downloadAsync for ${key}`);
        result = await downloadResumable.downloadAsync();

        if (!result || result.status !== 200) {
          throw new Error(`Download failed with status ${result?.status || 'unknown'}`);
        }

        // Move from temp location to final destination
        await FileSystem.moveAsync({ from: result.uri, to: finalDestination });
      }

      // Clean up
      await this.completeDownload(modelId, fileType);

      return finalDestination;
    } catch (error) {
      // Save state on error so we can resume
      const metadata = this.downloadMetadata.get(key);
      if (metadata) {
        await this.saveDownloadState(key, downloadResumable, metadata);
      }
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
    metadata: DownloadMetadata,
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
    _onProgress?: (modelId: string, fileType: DownloadMetadata['fileType'], progress: number) => void,
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

  /**
   * Concatenate two files into a destination file.
   * Uses the new expo-file-system File API for efficient binary handling.
   */
  private async concatenateFiles(
    file1Path: string,
    file2Path: string,
    destPath: string,
  ): Promise<void> {
    const CHUNK_SIZE = 1024 * 1024; // 1MB chunks

    try {
      // Use the new File API for efficient binary operations
      const file1 = new File(file1Path);
      const file2 = new File(file2Path);
      const destFile = new File(destPath);

      // Create/truncate destination file
      if (destFile.exists) {
        await destFile.delete();
      }
      await destFile.create();

      // Open file handles for streaming
      const handle1 = file1.open();
      const handle2 = file2.open();
      const destHandle = destFile.open();

      try {
        const file1Size = handle1.size ?? 0;
        const file2Size = handle2.size ?? 0;

        // Copy first file in chunks
        while ((handle1.offset ?? 0) < file1Size) {
          const currentOffset = handle1.offset ?? 0;
          const bytesToRead = Math.min(CHUNK_SIZE, file1Size - currentOffset);
          const chunk = handle1.readBytes(bytesToRead);
          destHandle.writeBytes(chunk);
        }

        // Copy second file in chunks
        while ((handle2.offset ?? 0) < file2Size) {
          const currentOffset = handle2.offset ?? 0;
          const bytesToRead = Math.min(CHUNK_SIZE, file2Size - currentOffset);
          const chunk = handle2.readBytes(bytesToRead);
          destHandle.writeBytes(chunk);
        }

        console.log(`[PersistentDownloadManager] Successfully concatenated files: ${file1Size} + ${file2Size} bytes`);
      } finally {
        // Always close handles
        handle1.close();
        handle2.close();
        destHandle.close();
      }
    } catch (error) {
      console.error('[PersistentDownloadManager] Failed to concatenate files:', error);
      throw error;
    }
  }
}

// Global singleton
export const persistentDownloadManager = new PersistentDownloadManager();

