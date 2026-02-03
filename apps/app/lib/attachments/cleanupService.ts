/**
 * Attachment Cleanup Service
 *
 * Runs on app startup to remove orphaned attachment files.
 * Scans all entries for data-attachment-id references and compares
 * against files on disk. Deletes any files not referenced.
 */

import * as FileSystem from "expo-file-system/legacy";
import { extractAttachmentIdsFromHtml } from "./attachmentService";

// Base directory for all attachments
const ATTACHMENTS_DIR = `${FileSystem.documentDirectory}attachments`;

/**
 * Get all attachment IDs referenced in an entry's HTML content
 */
function getAttachmentIdsFromEntry(entry: {
  blocks: Array<{ type: string; content: string }>;
}): Set<string> {
  const ids = new Set<string>();

  for (const block of entry.blocks) {
    if (block.type === "html" && block.content) {
      const blockIds = extractAttachmentIdsFromHtml(block.content);
      blockIds.forEach((id) => ids.add(id));
    }
    // Also check markdown blocks in case HTML is stored there
    if (block.type === "markdown" && block.content) {
      const blockIds = extractAttachmentIdsFromHtml(block.content);
      blockIds.forEach((id) => ids.add(id));
    }
  }

  return ids;
}

/**
 * Get all attachment files on disk, organized by entry ID
 * Returns a map of entryId -> Set of attachment IDs
 */
async function getAttachmentsOnDisk(): Promise<Map<string, Set<string>>> {
  const result = new Map<string, Set<string>>();

  const dirInfo = await FileSystem.getInfoAsync(ATTACHMENTS_DIR);
  if (!dirInfo.exists) {
    return result;
  }

  // List entry directories
  const entryDirs = await FileSystem.readDirectoryAsync(ATTACHMENTS_DIR);

  for (const entryDir of entryDirs) {
    const entryPath = `${ATTACHMENTS_DIR}/${entryDir}`;
    const entryDirInfo = await FileSystem.getInfoAsync(entryPath);

    if (entryDirInfo.isDirectory) {
      const files = await FileSystem.readDirectoryAsync(entryPath);
      const attachmentIds = new Set<string>();

      for (const file of files) {
        if (file.endsWith(".enc")) {
          attachmentIds.add(file.replace(".enc", ""));
        }
      }

      if (attachmentIds.size > 0) {
        result.set(entryDir, attachmentIds);
      }
    }
  }

  return result;
}

/**
 * Clean up orphaned attachments on app startup
 * Scans all entries and compares against files on disk
 *
 * @param getAllEntries - Function to get all entries from the database
 * @returns Object with cleanup statistics
 */
export async function cleanupOrphanedAttachmentsOnStartup(
  getAllEntries: () => Promise<
    Array<{ id: number; blocks: Array<{ type: string; content: string }> }>
  >,
): Promise<{
  scannedEntries: number;
  deletedFiles: number;
  deletedDirs: number;
}> {
  console.log("[AttachmentCleanup] Starting cleanup...");

  let deletedFiles = 0;
  let deletedDirs = 0;

  try {
    // Get all entries and extract referenced attachment IDs
    const entries = await getAllEntries();
    const referencedByEntry = new Map<number, Set<string>>();

    for (const entry of entries) {
      const ids = getAttachmentIdsFromEntry(entry);
      if (ids.size > 0) {
        referencedByEntry.set(entry.id, ids);
      }
    }

    // Get all attachments on disk
    const onDisk = await getAttachmentsOnDisk();

    // Find and delete orphaned files
    for (const [entryIdStr, diskIds] of onDisk) {
      const entryId = parseInt(entryIdStr, 10);
      const referencedIds = referencedByEntry.get(entryId) || new Set<string>();

      // Check each file on disk
      for (const diskId of diskIds) {
        if (!referencedIds.has(diskId)) {
          // This file is orphaned - delete it
          const filePath = `${ATTACHMENTS_DIR}/${entryIdStr}/${diskId}.enc`;
          try {
            await FileSystem.deleteAsync(filePath, { idempotent: true });
            deletedFiles++;
            console.log(
              `[AttachmentCleanup] Deleted orphaned file: ${filePath}`,
            );
          } catch (err) {
            console.error(
              `[AttachmentCleanup] Failed to delete ${filePath}:`,
              err,
            );
          }
        }
      }

      // Check if entry still exists - if not, delete the entire directory
      const entryExists = entries.some((e) => e.id === entryId);
      if (!entryExists) {
        const dirPath = `${ATTACHMENTS_DIR}/${entryIdStr}`;
        try {
          await FileSystem.deleteAsync(dirPath, { idempotent: true });
          deletedDirs++;
          console.log(
            `[AttachmentCleanup] Deleted orphaned directory: ${dirPath}`,
          );
        } catch (err) {
          console.error(
            `[AttachmentCleanup] Failed to delete dir ${dirPath}:`,
            err,
          );
        }
      } else {
        // Check if directory is now empty and delete if so
        const dirPath = `${ATTACHMENTS_DIR}/${entryIdStr}`;
        try {
          const remaining = await FileSystem.readDirectoryAsync(dirPath);
          if (remaining.length === 0) {
            await FileSystem.deleteAsync(dirPath, { idempotent: true });
            deletedDirs++;
          }
        } catch {
          // Directory might already be deleted
        }
      }
    }

    console.log(
      `[AttachmentCleanup] Complete. Scanned ${entries.length} entries, deleted ${deletedFiles} files, ${deletedDirs} directories.`,
    );

    return {
      scannedEntries: entries.length,
      deletedFiles,
      deletedDirs,
    };
  } catch (err) {
    console.error("[AttachmentCleanup] Error during cleanup:", err);
    return {
      scannedEntries: 0,
      deletedFiles,
      deletedDirs,
    };
  }
}
