/**
 * Tauri implementation of the Tauri GGUF download helper.
 *
 * Streams a GGUF model file from a remote URL to disk via a native Rust
 * `llm_download_model` command exposed through Tauri's `invoke()` IPC.
 * Progress is streamed back through a Tauri Channel as `DownloadProgress`
 * events.
 *
 * Flow:
 * - `downloadModelFile` -> invoke `llm_download_model` with a
 *    Channel<DownloadProgress>
 * - `getDesktopModelPath` -> build {appDataDir}/models/{folder}/{file}
 * - `isDesktopModelDownloaded` -> fs.exists()
 *
 * The webview loads the same web bundle as the browser, so this file is
 * resolved by Metro/webpack in both environments. Callers must gate usage
 * behind `isTauri()` at runtime.
 */

import { Channel, invoke } from "@tauri-apps/api/core";
// `@tauri-apps/api/path` and `@tauri-apps/plugin-fs` are resolvable in
// the workspace (they ship with the Tauri webview and are present in
// node_modules). Tests mock both virtually.
import { appDataDir } from "@tauri-apps/api/path";
import { exists } from "@tauri-apps/plugin-fs";

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
 * Minimal descriptor for a downloadable desktop model — a subset of
 * `LlmModelConfig` that keeps this module free of a heavy import.
 */
export interface DesktopModelDescriptor {
  folderName: string;
  fileName: string;
  url: string;
}

/**
 * Download a GGUF model file from a URL to a destination path on disk.
 *
 * The Rust side handles creating parent directories, streaming chunks,
 * and writing to the destination file.
 */
export async function downloadModelFile(
  url: string,
  destPath: string,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<void> {
  const channel = new Channel<DownloadProgress>();
  if (onProgress) {
    channel.onmessage = (event: DownloadProgress) => {
      onProgress({
        loaded: event.loaded,
        total: event.total,
        done: event.done,
      });
    };
  }

  await invoke("llm_download_model", {
    url,
    destPath,
    onProgress: channel,
  });
}

/**
 * Compute the absolute filesystem path where a desktop model should live.
 *
 * Returns `{appDataDir}/models/{folderName}/{fileName}` using forward-slash
 * separators (Tauri normalizes these cross-platform).
 */
export async function getDesktopModelPath(
  folderName: string,
  fileName: string,
): Promise<string> {
  const base: string = await appDataDir();
  const trimmed = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${trimmed}/models/${folderName}/${fileName}`;
}

/**
 * Check whether a previously downloaded desktop model exists on disk.
 *
 * Uses `@tauri-apps/plugin-fs`'s `exists()`. Returns `false` on any error
 * (permission denied, path traversal, etc.) so the caller can re-download.
 */
export async function isDesktopModelDownloaded(
  destPath: string,
): Promise<boolean> {
  try {
    return await exists(destPath);
  } catch {
    return false;
  }
}

/**
 * High-level helper: ensure a desktop model exists on disk and return its
 * absolute path. Skips download if the file already exists.
 *
 * This is the canonical implementation of `ensureDesktopModelPresent` for
 * the Tauri build. On native builds, the native stub throws.
 */
export async function ensureDesktopModelDownloaded(
  model: DesktopModelDescriptor,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<string> {
  const destPath = await getDesktopModelPath(model.folderName, model.fileName);
  const alreadyThere = await isDesktopModelDownloaded(destPath);
  if (alreadyThere) {
    onProgress?.({ loaded: 1, total: 1, done: true });
    return destPath;
  }
  await downloadModelFile(model.url, destPath, onProgress);
  return destPath;
}
