/**
 * Attachment Storage - Manages decrypted attachments for playback
 *
 * Audio/image files are decrypted to a temp directory and served via HTTP.
 * Uses @dr.pogodin/react-native-static-server (Lighttpd) to serve files.
 */

import Server from "@dr.pogodin/react-native-static-server";
import * as FileSystem from "expo-file-system/legacy";
import { decryptFile } from "./fileEncryption";

// Directories
const ATTACHMENTS_DIR = `${FileSystem.documentDirectory}attachments`;
const TEMP_SERVE_DIR = `${FileSystem.cacheDirectory}serve/`;

// Server config
const SERVER_PORT = 19847;
let server: Server | null = null;
let serverOrigin: string | null = null;

/**
 * Convert file:// URL to regular path for the static server
 */
function toFilePath(fileUrl: string): string {
  if (fileUrl.startsWith("file://")) {
    return decodeURIComponent(fileUrl.replace("file://", ""));
  }
  return fileUrl;
}

/**
 * Get the HTTP URL for a specific audio attachment
 * Also ensures the file is decrypted and ready
 */
export async function getAudioAttachmentUrl(
  entryId: number,
  attachmentId: string,
): Promise<string> {
  await ensureDecryptedFile(entryId, attachmentId);
  const baseUrl = serverOrigin || `http://127.0.0.1:${SERVER_PORT}`;
  return `${baseUrl}/${entryId}/${attachmentId}.wav`;
}

/**
 * Ensure a decrypted copy of the attachment exists in the serve directory
 */
async function ensureDecryptedFile(
  entryId: number,
  attachmentId: string,
): Promise<void> {
  const encryptedPath = `${ATTACHMENTS_DIR}/${entryId}/${attachmentId}.enc`;
  const decryptedDir = `${TEMP_SERVE_DIR}${entryId}`;
  const decryptedPath = `${decryptedDir}/${attachmentId}.wav`;

  // Check if already decrypted
  const decryptedInfo = await FileSystem.getInfoAsync(decryptedPath);
  if (decryptedInfo.exists) {
    return;
  }

  // Check if encrypted file exists
  const encryptedInfo = await FileSystem.getInfoAsync(encryptedPath);
  if (!encryptedInfo.exists) {
    throw new Error(`Encrypted attachment not found: ${attachmentId}`);
  }

  // Ensure directory exists
  await FileSystem.makeDirectoryAsync(decryptedDir, { intermediates: true });

  // Decrypt to serve directory
  await decryptFile(encryptedPath, decryptedPath);
}

/**
 * Ensure the serve directory exists
 */
async function ensureServeDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(TEMP_SERVE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(TEMP_SERVE_DIR, {
      intermediates: true,
    });
  }
}

/**
 * Start the attachment server
 */
export async function startAttachmentServer(): Promise<void> {
  if (server) {
    return;
  }

  await ensureServeDir();

  const servePath = toFilePath(TEMP_SERVE_DIR);
  server = new Server({
    fileDir: servePath,
    port: SERVER_PORT,
    stopInBackground: false,
  });

  serverOrigin = await server.start();
}

/**
 * Stop the attachment server
 */
export async function stopAttachmentServer(): Promise<void> {
  if (server) {
    await server.stop();
    server = null;
    serverOrigin = null;
  }
}

/**
 * Check if the server is running
 */
export function isAttachmentServerRunning(): boolean {
  return server !== null;
}

/**
 * Clean up decrypted files for an entry
 */
export async function cleanupDecryptedFiles(entryId: number): Promise<void> {
  const entryDir = `${TEMP_SERVE_DIR}${entryId}`;
  const info = await FileSystem.getInfoAsync(entryDir);
  if (info.exists) {
    await FileSystem.deleteAsync(entryDir, { idempotent: true });
  }
}

/**
 * Clean up all decrypted files
 */
export async function cleanupAllDecryptedFiles(): Promise<void> {
  const info = await FileSystem.getInfoAsync(TEMP_SERVE_DIR);
  if (info.exists) {
    await FileSystem.deleteAsync(TEMP_SERVE_DIR, { idempotent: true });
    await ensureServeDir();
  }
}
