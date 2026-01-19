/**
 * Attachment Service - Manages file attachments for entries
 *
 * Handles storage, encryption, and lifecycle of attachments like
 * audio recordings, images, and other files.
 *
 * Directory structure:
 * - {documentDirectory}/attachments/{entryId}/{attachmentId}.enc
 */

import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import { encryptFile, readEncryptedAsDataUri } from "./fileEncryption";

export type AttachmentType = "audio" | "image" | "video" | "document";

export interface Attachment {
  id: string;
  entryId: number;
  type: AttachmentType;
  filename: string;
  mimeType: string;
  size: number;
  duration?: number; // For audio/video in seconds
  createdAt: number;
}

export interface AttachmentMetadata {
  id: string;
  type: AttachmentType;
  filename: string;
  mimeType: string;
  duration?: number;
}

// Base directory for all attachments
const ATTACHMENTS_DIR = `${FileSystem.documentDirectory}attachments`;

/**
 * Generate a unique attachment ID
 */
export function generateAttachmentId(): string {
  const bytes = Crypto.getRandomBytes(16);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Get the directory path for an entry's attachments
 */
function getEntryAttachmentsDir(entryId: number): string {
  return `${ATTACHMENTS_DIR}/${entryId}`;
}

/**
 * Get the full path for an encrypted attachment
 */
function getAttachmentPath(entryId: number, attachmentId: string): string {
  return `${getEntryAttachmentsDir(entryId)}/${attachmentId}.enc`;
}

/**
 * Ensure the attachments directory exists for an entry
 */
async function ensureEntryDir(entryId: number): Promise<void> {
  const dir = getEntryAttachmentsDir(entryId);
  const dirInfo = await FileSystem.getInfoAsync(dir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

/**
 * Save a file as an encrypted attachment
 *
 * @param sourceUri - URI of the source file to save
 * @param entryId - Entry ID this attachment belongs to
 * @param type - Type of attachment
 * @param mimeType - MIME type of the file
 * @param originalFilename - Original filename (optional)
 * @param duration - Duration in seconds for audio/video (optional)
 * @returns Attachment metadata
 */
export async function saveAttachment(
  sourceUri: string,
  entryId: number,
  type: AttachmentType,
  mimeType: string,
  originalFilename?: string,
  duration?: number,
): Promise<Attachment> {
  // Ensure directory exists
  await ensureEntryDir(entryId);

  // Generate unique ID
  const id = generateAttachmentId();

  // Get file info
  const fileInfo = await FileSystem.getInfoAsync(sourceUri);
  if (!fileInfo.exists) {
    throw new Error(`Source file does not exist: ${sourceUri}`);
  }

  const size = fileInfo.size || 0;

  // Determine filename
  const extension = mimeType.split("/")[1] || "bin";
  const filename = originalFilename || `${type}_${Date.now()}.${extension}`;

  // Encrypt and save
  const destPath = getAttachmentPath(entryId, id);
  await encryptFile(sourceUri, destPath);

  // Return attachment metadata
  const attachment: Attachment = {
    id,
    entryId,
    type,
    filename,
    mimeType,
    size,
    duration,
    createdAt: Date.now(),
  };

  return attachment;
}

/**
 * Get an attachment as a data URI (for playback/display)
 *
 * @param entryId - Entry ID
 * @param attachmentId - Attachment ID
 * @param mimeType - MIME type for the data URI
 * @returns Data URI string
 */
export async function getAttachmentDataUri(
  entryId: number,
  attachmentId: string,
  mimeType: string,
): Promise<string> {
  const path = getAttachmentPath(entryId, attachmentId);
  const fileInfo = await FileSystem.getInfoAsync(path);

  if (!fileInfo.exists) {
    throw new Error(`Attachment not found: ${attachmentId}`);
  }

  return readEncryptedAsDataUri(path, mimeType);
}

/**
 * Delete a specific attachment
 *
 * @param entryId - Entry ID
 * @param attachmentId - Attachment ID to delete
 */
export async function deleteAttachment(
  entryId: number,
  attachmentId: string,
): Promise<void> {
  const path = getAttachmentPath(entryId, attachmentId);
  const fileInfo = await FileSystem.getInfoAsync(path);

  if (fileInfo.exists) {
    await FileSystem.deleteAsync(path, { idempotent: true });
  }
}

/**
 * Delete all attachments for an entry
 *
 * @param entryId - Entry ID
 */
export async function deleteAllAttachments(entryId: number): Promise<void> {
  const dir = getEntryAttachmentsDir(entryId);
  const dirInfo = await FileSystem.getInfoAsync(dir);

  if (dirInfo.exists) {
    await FileSystem.deleteAsync(dir, { idempotent: true });
  }
}

/**
 * List all attachment IDs for an entry
 *
 * @param entryId - Entry ID
 * @returns Array of attachment IDs
 */
export async function listAttachmentIds(entryId: number): Promise<string[]> {
  const dir = getEntryAttachmentsDir(entryId);
  const dirInfo = await FileSystem.getInfoAsync(dir);

  if (!dirInfo.exists) {
    return [];
  }

  const files = await FileSystem.readDirectoryAsync(dir);
  return files
    .filter((f) => f.endsWith(".enc"))
    .map((f) => f.replace(".enc", ""));
}

/**
 * Check if an attachment exists
 */
export async function attachmentExists(
  entryId: number,
  attachmentId: string,
): Promise<boolean> {
  const path = getAttachmentPath(entryId, attachmentId);
  const fileInfo = await FileSystem.getInfoAsync(path);
  return fileInfo.exists;
}

/**
 * Clean up orphaned attachments that are no longer referenced in content
 *
 * @param entryId - Entry ID
 * @param referencedIds - Set of attachment IDs still referenced in content
 */
export async function cleanupOrphanedAttachments(
  entryId: number,
  referencedIds: Set<string>,
): Promise<void> {
  const existingIds = await listAttachmentIds(entryId);

  for (const id of existingIds) {
    if (!referencedIds.has(id)) {
      console.log(`[AttachmentService] Deleting orphaned attachment: ${id}`);
      await deleteAttachment(entryId, id);
    }
  }
}

/**
 * Extract attachment IDs from HTML content
 * Looks for data-attachment-id attributes
 */
export function extractAttachmentIdsFromHtml(html: string): Set<string> {
  const ids = new Set<string>();
  const regex = /data-attachment-id="([^"]+)"/g;
  let match;

  while ((match = regex.exec(html)) !== null) {
    ids.add(match[1]);
  }

  return ids;
}

/**
 * Create HTML for an audio attachment block
 */
export function createAudioBlockHtml(attachment: AttachmentMetadata): string {
  const durationStr = attachment.duration
    ? formatDuration(attachment.duration)
    : "";

  return `<div class="attachment-block audio-block" data-attachment-id="${attachment.id}" data-attachment-type="audio" data-mime-type="${attachment.mimeType}" contenteditable="false">
  <div class="audio-player">
    <button class="play-button" aria-label="Play audio">&#9658;</button>
    <span class="duration">${durationStr}</span>
    <button class="delete-button" aria-label="Delete audio">&times;</button>
  </div>
</div>`;
}

/**
 * Create HTML for an image attachment block
 */
export function createImageBlockHtml(
  attachment: AttachmentMetadata,
  dataUri: string,
): string {
  return `<div class="attachment-block image-block" data-attachment-id="${attachment.id}" data-attachment-type="image" data-mime-type="${attachment.mimeType}" contenteditable="false">
  <img src="${dataUri}" alt="${attachment.filename}" />
  <button class="delete-button" aria-label="Delete image">&times;</button>
</div>`;
}

/**
 * Format duration in seconds to mm:ss
 */
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
