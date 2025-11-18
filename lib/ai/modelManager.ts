import * as FileSystem from "expo-file-system/legacy";
import { Paths } from "expo-file-system";
import { Asset } from "expo-asset";
import { Llama32_1B_Instruct, LlmModelConfig } from "./modelConfig";
import { modelDownloadStatus } from "./modelDownloadStatus";
import { persistentDownloadManager } from "./persistentDownloadManager";

export interface EnsureResult {
  ptePath: string;
  tokenizerPath?: string;
  tokenizerConfigPath?: string;
}

function joinPaths(...segments: string[]): string {
  return segments
    .map((seg, index) => {
      if (index === 0) {
        return seg.endsWith("/") ? seg.slice(0, -1) : seg;
      }
      const s = seg.startsWith("/") ? seg.slice(1) : seg;
      return s.endsWith("/") ? s.slice(0, -1) : s;
    })
    .join("/");
}

// Use the new Paths API for expo-file-system v19+ (compatible with newer iOS versions)
// Falls back to legacy API if Paths is not available
// CRITICAL: Never use cacheDirectory as it can be cleared by Android at any time
function getBaseDir(): string {
  try {
    const documentsDir = Paths.document.uri;
    if (documentsDir) {
      console.log(`[modelManager] Using Paths API document directory: ${documentsDir}`);
      return documentsDir;
    }
  } catch (e) {
    console.warn("Paths API not available, falling back to legacy API:", e);
  }
  
  // Fallback to legacy API - use documentDirectory for persistent storage
  if (FileSystem.documentDirectory) {
    console.log(`[modelManager] Using legacy documentDirectory: ${FileSystem.documentDirectory}`);
    return FileSystem.documentDirectory;
  }
  
  // NEVER use cacheDirectory for models - Android can clear it at any time!
  throw new Error(
    "No persistent storage directory available. documentDirectory is required for model storage."
  );
}

const baseDir = getBaseDir();
const modelsDir = joinPaths(baseDir, "models");

async function ensureModelsDir(subDir?: string): Promise<string> {
  const targetDir = subDir ? joinPaths(modelsDir, subDir) : modelsDir;
  const info = await FileSystem.getInfoAsync(targetDir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(targetDir, { intermediates: true });
  }
  return targetDir;
}

async function ensureFromBundled(
  source: any,
  fileName: string
): Promise<string> {
  try {
    // Handle file path directly (for large .pte files loaded from filesystem)
    if (source.uri && typeof source.uri === "string") {
      // File path from filesystem - use directly
      const fileInfo = await FileSystem.getInfoAsync(source.uri);
      if (fileInfo.exists) {
        // Copy to models dir for consistency
        await ensureModelsDir();
        const dest = joinPaths(modelsDir, fileName);
        const existing = await FileSystem.getInfoAsync(dest);
        if (!existing.exists) {
          await FileSystem.copyAsync({ from: source.uri, to: dest });
        }
        return dest;
      } else {
        throw new Error(`File not found: ${source.uri}`);
      }
    }

    // Handle bundled asset (for small files like tokenizer.json)
    const asset = Asset.fromModule(source);
    await asset.downloadAsync();
    // Copy to models dir with deterministic name for simplicity
    await ensureModelsDir();
    const dest = joinPaths(modelsDir, fileName);
    // If already copied, skip
    const existing = await FileSystem.getInfoAsync(dest);
    if (!existing.exists) {
      await FileSystem.copyAsync({ from: asset.localUri!, to: dest });
    }
    return dest;
  } catch (error) {
    // If bundled asset doesn't exist or fails, throw to allow fallback
    throw new Error(
      `Bundled asset not available: ${fileName}. Run 'pnpm download:models' to download models.`
    );
  }
}

async function ensureFromRemote(
  url: string,
  fileName: string
): Promise<string> {
  await ensureModelsDir();
  const dest = joinPaths(modelsDir, fileName);
  const existing = await FileSystem.getInfoAsync(dest);
  if (existing.exists && existing.size && existing.size > 0) {
    return dest;
  }
  const tmp = dest + ".download";
  try {
    const res = await FileSystem.downloadAsync(url, tmp);
    if (res.status !== 200) {
      throw new Error(`Download failed with status ${res.status}`);
    }
    await FileSystem.moveAsync({ from: tmp, to: dest });
    return dest;
  } catch (e) {
    // Cleanup partial
    try {
      await FileSystem.deleteAsync(tmp, { idempotent: true });
    } catch {}
    throw e;
  }
}

async function ensureFromRemoteToFolder(
  url: string,
  folderName: string,
  fileName: string,
  modelId: string,
  modelName: string,
  fileType: 'model' | 'tokenizer' | 'config',
  onProgress?: (progress: number) => void
): Promise<string> {
  const modelDir = await ensureModelsDir(folderName);
  const dest = joinPaths(modelDir, fileName);
  const existing = await FileSystem.getInfoAsync(dest);
  if (existing.exists && existing.size && existing.size > 0) {
    console.log(`[ensureFromRemoteToFolder] File already exists: ${dest}`);
    return dest;
  }
  
  try {
    console.log(`[ensureFromRemoteToFolder] Starting download: ${url}`);
    
    // Use persistent download manager for resumable downloads
    const downloadResumable = await persistentDownloadManager.startDownload(
      modelId,
      modelName,
      url,
      dest,
      fileType,
      (progress, bytesWritten, bytesTotal) => {
        onProgress?.(progress);
        console.log(`[ensureFromRemoteToFolder] Progress: ${(progress * 100).toFixed(1)}% (${bytesWritten}/${bytesTotal} bytes)`);
      }
    );
    
    // Execute the download
    const finalPath = await persistentDownloadManager.executeDownload(
      downloadResumable,
      modelId,
      fileType,
      dest
    );
    
    console.log(`[ensureFromRemoteToFolder] Download complete: ${finalPath}`);
    return finalPath;
  } catch (e) {
    console.error(`[ensureFromRemoteToFolder] Download failed:`, e);
    throw e;
  }
}

export async function ensureModelPresent(
  config: LlmModelConfig = Llama32_1B_Instruct,
  onProgress?: (progress: number) => void
): Promise<EnsureResult> {
  let ptePath: string;

  await ensureModelsDir();

  // Check model-specific directory first (for already downloaded/copied files)
  const modelDir = await ensureModelsDir(config.folderName);
  const docModelPath = joinPaths(modelDir, config.pteFileName);
  console.log(`[ensureModelPresent] Checking for model at: ${docModelPath}`);
  console.log(`[ensureModelPresent] Base directory: ${baseDir}`);
  const docModelInfo = await FileSystem.getInfoAsync(docModelPath);

  if (docModelInfo.exists && docModelInfo.size && docModelInfo.size > 0) {
    // Use already downloaded/cached file
    ptePath = docModelPath;
    console.log(
      `[ensureModelPresent] Using cached model from: ${docModelPath} (${(
        docModelInfo.size /
        1024 /
        1024
      ).toFixed(2)}MB)`
    );
    
    // Model already exists, call onProgress with 100% immediately
    if (onProgress) {
      onProgress(1.0);
    }
  } else if (config.pteSource.kind === "unavailable") {
    throw new Error(`Model not available: ${config.pteSource.reason}`);
  } else if (config.pteSource.kind === "bundled") {
    // Try bundled asset (for small files)
    try {
      ptePath = await ensureFromBundled(
        config.pteSource.requireId,
        config.pteFileName
      );
      if (onProgress) {
        onProgress(1.0);
      }
    } catch (e) {
      throw new Error(
        `Bundled model not available. Run 'pnpm download:models --model ${config.modelId}' to download.`
      );
    }
  } else {
    // Download from remote to model-specific folder
    console.log(`Downloading model from remote: ${config.pteSource.url}`);
    
    // Start tracking download status
    modelDownloadStatus.startDownload(config.modelId, config.displayName);
    
    try {
      // Main model file progress (80% of total)
      ptePath = await ensureFromRemoteToFolder(
        config.pteSource.url,
        config.folderName,
        config.pteFileName,
        config.modelId,
        config.displayName,
        'model',
        (progress) => {
          const overallProgress = progress * 0.8; // Model is 80% of the work
          if (onProgress) {
            onProgress(overallProgress);
          }
          modelDownloadStatus.updateProgress(
            config.modelId,
            Math.round(overallProgress * 100)
          );
        }
      );
    } catch (e) {
      modelDownloadStatus.failDownload(
        config.modelId,
        e instanceof Error ? e.message : "Download failed"
      );
      throw e;
    }
  }

  let tokenizerPath: string | undefined;
  if (config.tokenizerSource) {
    if (config.tokenizerSource.kind === "unavailable") {
      // Skip tokenizer if unavailable
      console.warn(
        `[ensureModelPresent] Tokenizer not available for ${config.modelId}`
      );
    } else if (config.tokenizerSource.kind === "bundled") {
      tokenizerPath = await ensureFromBundled(
        config.tokenizerSource.requireId,
        config.tokenizerFileName || "tokenizer.bin"
      );
    } else {
      // Tokenizer progress (10% of total, starting from 80%)
      tokenizerPath = await ensureFromRemoteToFolder(
        config.tokenizerSource.url,
        config.folderName,
        config.tokenizerFileName || "tokenizer.bin",
        config.modelId,
        config.displayName,
        'tokenizer',
        (progress) => {
          const overallProgress = 0.8 + progress * 0.1;
          if (onProgress) {
            onProgress(overallProgress);
          }
          if (config.pteSource.kind === "remote") {
            modelDownloadStatus.updateProgress(
              config.modelId,
              Math.round(overallProgress * 100)
            );
          }
        }
      );
    }
  }

  let tokenizerConfigPath: string | undefined;
  if (config.tokenizerConfigSource) {
    if (config.tokenizerConfigSource.kind === "unavailable") {
      // Skip tokenizer config if unavailable
      console.warn(
        `[ensureModelPresent] Tokenizer config not available for ${config.modelId}`
      );
    } else if (config.tokenizerConfigSource.kind === "bundled") {
      tokenizerConfigPath = await ensureFromBundled(
        config.tokenizerConfigSource.requireId,
        config.tokenizerConfigFileName || "tokenizer.json"
      );
    } else {
      // Tokenizer config progress (10% of total, starting from 90%)
      tokenizerConfigPath = await ensureFromRemoteToFolder(
        config.tokenizerConfigSource.url,
        config.folderName,
        config.tokenizerConfigFileName || "tokenizer.json",
        config.modelId,
        config.displayName,
        'config',
        (progress) => {
          const overallProgress = 0.9 + progress * 0.1;
          if (onProgress) {
            onProgress(overallProgress);
          }
          if (config.pteSource.kind === "remote") {
            modelDownloadStatus.updateProgress(
              config.modelId,
              Math.round(overallProgress * 100)
            );
          }
        }
      );
    }
  }

  // Download complete
  if (config.pteSource.kind === "remote") {
    modelDownloadStatus.completeDownload(config.modelId);
    if (onProgress) {
      onProgress(1.0);
    }
  }

  return { ptePath, tokenizerPath, tokenizerConfigPath };
}

/**
 * Delete a downloaded model from the device
 */
export async function deleteModel(config: LlmModelConfig): Promise<void> {
  const modelDir = joinPaths(modelsDir, config.folderName);
  const info = await FileSystem.getInfoAsync(modelDir);
  if (info.exists) {
    await FileSystem.deleteAsync(modelDir, { idempotent: true });
    console.log(`[deleteModel] Deleted model directory: ${modelDir}`);
  }
}

/**
 * Get the size of a downloaded model in bytes
 */
export async function getModelSize(config: LlmModelConfig): Promise<number> {
  const modelDir = joinPaths(modelsDir, config.folderName);
  const info = await FileSystem.getInfoAsync(modelDir);

  if (!info.exists) {
    return 0;
  }

  // Sum up all files in the directory
  try {
    const files = await FileSystem.readDirectoryAsync(modelDir);
    let totalSize = 0;

    for (const file of files) {
      const filePath = joinPaths(modelDir, file);
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (fileInfo.exists && fileInfo.size) {
        totalSize += fileInfo.size;
      }
    }

    return totalSize;
  } catch (e) {
    console.error(`[getModelSize] Error calculating size:`, e);
    return 0;
  }
}
