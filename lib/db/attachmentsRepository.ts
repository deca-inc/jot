/**
 * Attachments Repository - Database operations for attachment metadata
 */

import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useMemo } from "react";
import {
  deleteAttachment as deleteAttachmentFile,
  deleteAllAttachments as deleteAllAttachmentFiles,
  extractAttachmentIdsFromHtml,
} from "../attachments";

export interface AttachmentRecord {
  id: string;
  entryId: number;
  type: "audio" | "image" | "video" | "document";
  mimeType: string;
  filename: string | null;
  size: number | null;
  duration: number | null;
  createdAt: number;
}

export interface AttachmentInput {
  id: string;
  entryId: number;
  type: "audio" | "image" | "video" | "document";
  mimeType: string;
  filename?: string;
  size?: number;
  duration?: number;
}

/**
 * Insert a new attachment record
 */
async function insertAttachment(
  db: ReturnType<typeof useSQLiteContext>,
  input: AttachmentInput,
): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO attachments (id, entryId, type, mimeType, filename, size, duration, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.entryId,
      input.type,
      input.mimeType,
      input.filename ?? null,
      input.size ?? null,
      input.duration ?? null,
      Date.now(),
    ],
  );
}

/**
 * Get all attachment IDs for an entry
 */
async function getAttachmentIdsForEntry(
  db: ReturnType<typeof useSQLiteContext>,
  entryId: number,
): Promise<string[]> {
  const rows = await db.getAllAsync<{ id: string }>(
    "SELECT id FROM attachments WHERE entryId = ?",
    [entryId],
  );
  return rows.map((r) => r.id);
}

/**
 * Get all attachments for an entry
 */
async function getAttachmentsForEntry(
  db: ReturnType<typeof useSQLiteContext>,
  entryId: number,
): Promise<AttachmentRecord[]> {
  return db.getAllAsync<AttachmentRecord>(
    "SELECT * FROM attachments WHERE entryId = ?",
    [entryId],
  );
}

/**
 * Delete an attachment record (does NOT delete the file)
 */
async function deleteAttachmentRecord(
  db: ReturnType<typeof useSQLiteContext>,
  id: string,
): Promise<void> {
  await db.runAsync("DELETE FROM attachments WHERE id = ?", [id]);
}

/**
 * Delete all attachment records for an entry (does NOT delete files)
 */
async function deleteAttachmentRecordsForEntry(
  db: ReturnType<typeof useSQLiteContext>,
  entryId: number,
): Promise<void> {
  await db.runAsync("DELETE FROM attachments WHERE entryId = ?", [entryId]);
}

/**
 * Sync attachments for an entry based on HTML content
 * - Extracts attachment IDs from HTML
 * - Compares against database
 * - Deletes orphaned files and records
 * - Returns IDs of deleted attachments
 */
async function syncAttachmentsForEntry(
  db: ReturnType<typeof useSQLiteContext>,
  entryId: number,
  htmlContent: string,
): Promise<{ deleted: string[] }> {
  // Extract attachment IDs from current HTML
  const currentIds = extractAttachmentIdsFromHtml(htmlContent);

  // Get existing attachment IDs from database
  const existingIds = await getAttachmentIdsForEntry(db, entryId);

  // Find orphaned attachments (in DB but not in HTML)
  const orphanedIds = existingIds.filter((id) => !currentIds.has(id));

  // Delete orphaned files and records
  for (const id of orphanedIds) {
    try {
      // Delete the encrypted file
      await deleteAttachmentFile(entryId, id);
      // Delete the database record
      await deleteAttachmentRecord(db, id);
      console.log(`[AttachmentsRepo] Deleted orphaned attachment: ${id}`);
    } catch (err) {
      console.error(
        `[AttachmentsRepo] Failed to delete attachment ${id}:`,
        err,
      );
    }
  }

  return { deleted: orphanedIds };
}

/**
 * Delete all attachments for an entry (files and records)
 * Called when an entry is deleted
 */
async function deleteAllAttachmentsForEntry(
  db: ReturnType<typeof useSQLiteContext>,
  entryId: number,
): Promise<void> {
  // Delete all files
  await deleteAllAttachmentFiles(entryId);
  // Delete all records (should cascade, but be explicit)
  await deleteAttachmentRecordsForEntry(db, entryId);
  console.log(`[AttachmentsRepo] Deleted all attachments for entry ${entryId}`);
}

/**
 * React hook for attachments repository
 */
export function useAttachmentsRepository() {
  const db = useSQLiteContext();

  const insert = useCallback(
    (input: AttachmentInput) => insertAttachment(db, input),
    [db],
  );

  const getIdsForEntry = useCallback(
    (entryId: number) => getAttachmentIdsForEntry(db, entryId),
    [db],
  );

  const getForEntry = useCallback(
    (entryId: number) => getAttachmentsForEntry(db, entryId),
    [db],
  );

  const syncForEntry = useCallback(
    (entryId: number, htmlContent: string) =>
      syncAttachmentsForEntry(db, entryId, htmlContent),
    [db],
  );

  const deleteAllForEntry = useCallback(
    (entryId: number) => deleteAllAttachmentsForEntry(db, entryId),
    [db],
  );

  return useMemo(
    () => ({
      insert,
      getIdsForEntry,
      getForEntry,
      syncForEntry,
      deleteAllForEntry,
    }),
    [insert, getIdsForEntry, getForEntry, syncForEntry, deleteAllForEntry],
  );
}
