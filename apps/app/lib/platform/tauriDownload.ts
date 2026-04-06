/**
 * Platform abstraction for the Tauri GGUF download helper (native stub).
 *
 * The Tauri download helper streams GGUF model files from remote URLs
 * straight to disk via a native Rust command. It is only usable inside a
 * Tauri webview.
 *
 * On native platforms (iOS/Android/macOS via react-native-macos), on-device
 * models are managed through expo-file-system + executorch, so this module
 * throws immediately.
 *
 * On web/Tauri, the .web.ts version is loaded via Metro/webpack resolution.
 */

/**
 * Streaming progress event emitted by the Rust side while downloading.
 */
export interface DownloadProgress {
  /** Bytes written to disk so far. */
  loaded: number;
  /** Total bytes in the response (0 if unknown). */
  total: number;
  /** True once the download has completed successfully. */
  done: boolean;
}

/**
 * Download a GGUF model file from a URL to a destination path on disk.
 *
 * On native this throws immediately — use `ensureModelPresent` instead.
 */
export async function downloadModelFile(
  _url: string,
  _destPath: string,
  _onProgress?: (progress: DownloadProgress) => void,
): Promise<void> {
  throw new Error("Tauri downloads are not available on native platforms");
}

/**
 * Compute the absolute filesystem path where a desktop model should live.
 *
 * On native this throws immediately.
 */
export async function getDesktopModelPath(
  _folderName: string,
  _fileName: string,
): Promise<string> {
  throw new Error("Tauri model paths are not available on native platforms");
}

/**
 * Check whether a previously downloaded desktop model exists on disk.
 *
 * On native this throws immediately.
 */
export async function isDesktopModelDownloaded(
  _destPath: string,
): Promise<boolean> {
  throw new Error(
    "Tauri model downloads are not available on native platforms",
  );
}

/**
 * Minimal descriptor for a downloadable desktop model.
 */
export interface DesktopModelDescriptor {
  folderName: string;
  fileName: string;
  url: string;
}

/**
 * High-level helper: ensure a desktop model exists on disk. Throws on native.
 */
export async function ensureDesktopModelDownloaded(
  _model: DesktopModelDescriptor,
  _onProgress?: (progress: DownloadProgress) => void,
): Promise<string> {
  throw new Error(
    "Tauri model downloads are not available on native platforms",
  );
}
