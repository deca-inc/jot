/**
 * Model file verification utilities
 * Helps diagnose and prevent issues with disappearing models on Android
 */

import { Paths } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import { LlmModelConfig } from "./modelConfig";

function getBaseDir(): string {
  try {
    const documentsDir = Paths.document.uri;
    if (documentsDir) {
      return documentsDir;
    }
  } catch (e) {
    console.warn("Paths API not available:", e);
  }
  return FileSystem.documentDirectory || "";
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

/**
 * Verify that a model's files still exist on disk
 * Returns detailed information about each file
 */
export async function verifyModelFiles(config: LlmModelConfig): Promise<{
  exists: boolean;
  details: {
    modelFile: { exists: boolean; size?: number; path: string };
    tokenizerFile?: { exists: boolean; size?: number; path: string };
    configFile?: { exists: boolean; size?: number; path: string };
  };
}> {
  const baseDir = getBaseDir();
  const modelsDir = joinPaths(baseDir, "models");
  const modelDir = joinPaths(modelsDir, config.folderName);
  
  const modelPath = joinPaths(modelDir, config.pteFileName);
  const tokenizerPath = config.tokenizerFileName
    ? joinPaths(modelDir, config.tokenizerFileName)
    : undefined;
  const configPath = config.tokenizerConfigFileName
    ? joinPaths(modelDir, config.tokenizerConfigFileName)
    : undefined;

  // Check model file
  const modelInfo = await FileSystem.getInfoAsync(modelPath);
  const modelFileResult = {
    exists: modelInfo.exists && (modelInfo.exists ? (modelInfo.size || 0) > 0 : false),
    size: modelInfo.exists ? modelInfo.size : undefined,
    path: modelPath,
  };

  // Check tokenizer file
  let tokenizerFileResult;
  if (tokenizerPath) {
    const tokenizerInfo = await FileSystem.getInfoAsync(tokenizerPath);
    tokenizerFileResult = {
      exists: tokenizerInfo.exists && (tokenizerInfo.exists ? (tokenizerInfo.size || 0) > 0 : false),
      size: tokenizerInfo.exists ? tokenizerInfo.size : undefined,
      path: tokenizerPath,
    };
  }

  // Check config file
  let configFileResult;
  if (configPath) {
    const configInfo = await FileSystem.getInfoAsync(configPath);
    configFileResult = {
      exists: configInfo.exists && (configInfo.exists ? (configInfo.size || 0) > 0 : false),
      size: configInfo.exists ? configInfo.size : undefined,
      path: configPath,
    };
  }

  const allExist =
    modelFileResult.exists &&
    (!tokenizerPath || (tokenizerFileResult?.exists ?? false)) &&
    (!configPath || (configFileResult?.exists ?? false));

  return {
    exists: allExist as boolean,
    details: {
      modelFile: modelFileResult,
      tokenizerFile: tokenizerFileResult,
      configFile: configFileResult,
    },
  };
}

/**
 * Get storage information for debugging
 */
export async function getStorageInfo(): Promise<{
  baseDirectory: string;
  modelsDirectory: string;
  availableSpace?: number;
  usedSpace?: number;
}> {
  const baseDir = getBaseDir();
  const modelsDir = joinPaths(baseDir, "models");

  // Get available space (if supported)
  let availableSpace: number | undefined;
  let usedSpace: number | undefined;
  
  try {
    const diskInfo = await FileSystem.getFreeDiskStorageAsync();
    availableSpace = diskInfo;
  } catch (e) {
    console.warn("Could not get disk space info:", e);
  }

  // Calculate used space in models directory
  try {
    const modelsDirInfo = await FileSystem.getInfoAsync(modelsDir);
    if (modelsDirInfo.exists) {
      const files = await FileSystem.readDirectoryAsync(modelsDir);
      let total = 0;
      for (const file of files) {
        const filePath = joinPaths(modelsDir, file);
        const fileInfo = await FileSystem.getInfoAsync(filePath);
        if (fileInfo.exists && fileInfo.size) {
          total += fileInfo.size;
        }
      }
      usedSpace = total;
    }
  } catch (e) {
    console.warn("Could not calculate used space:", e);
  }

  return {
    baseDirectory: baseDir,
    modelsDirectory: modelsDir,
    availableSpace,
    usedSpace,
  };
}

/**
 * Log detailed storage and model information for debugging
 */
export async function logStorageDebugInfo(): Promise<void> {
  console.log("=== Storage Debug Info ===");
  
  const storageInfo = await getStorageInfo();
  console.log("Base directory:", storageInfo.baseDirectory);
  console.log("Models directory:", storageInfo.modelsDirectory);
  
  if (storageInfo.availableSpace) {
    console.log(
      `Available space: ${(storageInfo.availableSpace / 1024 / 1024 / 1024).toFixed(2)} GB`,
    );
  }
  
  if (storageInfo.usedSpace) {
    console.log(
      `Models using: ${(storageInfo.usedSpace / 1024 / 1024).toFixed(2)} MB`,
    );
  }

  // Check if documentDirectory is being used (good) or cacheDirectory (bad)
  if (storageInfo.baseDirectory.includes("cache")) {
    console.error(
      "⚠️  WARNING: Models are being stored in cache directory! This is NOT persistent on Android.",
    );
  } else {
    console.log("✅ Models are in persistent storage (documentDirectory)");
  }

  console.log("========================");
}

/**
 * Verify all downloaded models still exist
 * Call this on app startup to detect if files were cleared
 */
export async function verifyAllModels(
  downloadedModelIds: string[],
  allModels: LlmModelConfig[],
): Promise<{
  allExist: boolean;
  missing: string[];
  verified: string[];
}> {
  const missing: string[] = [];
  const verified: string[] = [];

  for (const modelId of downloadedModelIds) {
    const config = allModels.find((m) => m.modelId === modelId);
    if (!config) {
      console.warn(`Model config not found for ${modelId}`);
      missing.push(modelId);
      continue;
    }

    const verification = await verifyModelFiles(config);
    if (verification.exists) {
      verified.push(modelId);
    } else {
      console.warn(`Model files missing for ${modelId}:`, verification.details);
      missing.push(modelId);
    }
  }

  return {
    allExist: missing.length === 0,
    missing,
    verified,
  };
}

