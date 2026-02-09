/**
 * Entry ↔ Yjs Document Mapper
 *
 * Converts between local Entry objects and Yjs documents for sync.
 * Each entry becomes one Yjs document with:
 * - metadata: Y.Map for entry metadata (title, type, tags, etc.)
 * - blocks: Y.Array for content blocks (preserves order, handles concurrent edits)
 *
 * With E2EE enabled, the document stores encrypted content:
 * - metadata.encrypted: true
 * - metadata.ciphertext, nonce, authTag: encrypted content
 * - metadata.wrappedKeys: wrapped DEKs for authorized users
 * - metadata.createdAt, updatedAt: unencrypted for conflict resolution
 */

import * as Y from "yjs";
import type { Block, Entry, EntryType } from "../db/entries";
import type { EncryptedEntryV2 } from "./encryption/crypto";

/**
 * Metadata structure stored in Yjs document
 */
export interface YjsEntryMetadata {
  title: string;
  type: EntryType;
  tags: string[];
  isFavorite: boolean;
  isPinned: boolean;
  archivedAt: number | null;
  parentId: number | null;
  agentId: number | null;
  createdAt: number;
  updatedAt: number;
  deleted: boolean; // Soft delete flag for sync
}

/**
 * Convert an Entry to Yjs document structure
 */
export function entryToYjs(entry: Entry, ydoc: Y.Doc): void {
  const metadata = ydoc.getMap<unknown>("metadata");
  const blocks = ydoc.getArray<Block>("blocks");

  // Set metadata
  metadata.set("title", entry.title);
  metadata.set("type", entry.type);
  metadata.set("tags", entry.tags);
  metadata.set("isFavorite", entry.isFavorite);
  metadata.set("isPinned", entry.isPinned);
  metadata.set("archivedAt", entry.archivedAt);
  metadata.set("parentId", entry.parentId);
  metadata.set("agentId", entry.agentId);
  metadata.set("createdAt", entry.createdAt);
  metadata.set("updatedAt", entry.updatedAt);
  metadata.set("deleted", false);

  // Clear and set blocks
  if (blocks.length > 0) {
    blocks.delete(0, blocks.length);
  }
  for (const block of entry.blocks) {
    blocks.push([block]);
  }
}

/**
 * Convert Yjs document to Entry partial (for updating local DB)
 */
export function yjsToEntry(
  ydoc: Y.Doc,
  existingEntry?: Partial<Entry>,
): Partial<Entry> & { deleted?: boolean } {
  const metadata = ydoc.getMap<unknown>("metadata");
  const blocks = ydoc.getArray<Block>("blocks");

  return {
    ...existingEntry,
    title: (metadata.get("title") as string) ?? existingEntry?.title ?? "",
    type:
      (metadata.get("type") as EntryType) ?? existingEntry?.type ?? "journal",
    tags: (metadata.get("tags") as string[]) ?? existingEntry?.tags ?? [],
    isFavorite:
      (metadata.get("isFavorite") as boolean) ??
      existingEntry?.isFavorite ??
      false,
    isPinned:
      (metadata.get("isPinned") as boolean) ?? existingEntry?.isPinned ?? false,
    archivedAt:
      (metadata.get("archivedAt") as number | null) ??
      existingEntry?.archivedAt ??
      null,
    parentId:
      (metadata.get("parentId") as number | null) ??
      existingEntry?.parentId ??
      null,
    agentId:
      (metadata.get("agentId") as number | null) ??
      existingEntry?.agentId ??
      null,
    createdAt:
      (metadata.get("createdAt") as number) ??
      existingEntry?.createdAt ??
      Date.now(),
    updatedAt:
      (metadata.get("updatedAt") as number) ??
      existingEntry?.updatedAt ??
      Date.now(),
    blocks: blocks.toArray(),
    deleted: (metadata.get("deleted") as boolean) ?? false,
  };
}

/**
 * Update only the metadata in a Yjs document (not blocks)
 * Used when metadata changes but content doesn't
 */
export function updateYjsMetadata(
  ydoc: Y.Doc,
  updates: Partial<YjsEntryMetadata>,
): void {
  const metadata = ydoc.getMap<unknown>("metadata");

  ydoc.transact(() => {
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        metadata.set(key, value);
      }
    }
    // Always update updatedAt when metadata changes
    metadata.set("updatedAt", Date.now());
  });
}

/**
 * Update blocks in a Yjs document
 * This replaces all blocks - for more granular editing, use Yjs operations directly
 */
export function updateYjsBlocks(ydoc: Y.Doc, newBlocks: Block[]): void {
  const blocks = ydoc.getArray<Block>("blocks");
  const metadata = ydoc.getMap<unknown>("metadata");

  ydoc.transact(() => {
    if (blocks.length > 0) {
      blocks.delete(0, blocks.length);
    }
    for (const block of newBlocks) {
      blocks.push([block]);
    }
    metadata.set("updatedAt", Date.now());
  });
}

/**
 * Mark an entry as deleted in the Yjs document (soft delete)
 */
export function markYjsDeleted(ydoc: Y.Doc): void {
  const metadata = ydoc.getMap<unknown>("metadata");
  ydoc.transact(() => {
    metadata.set("deleted", true);
    metadata.set("updatedAt", Date.now());
  });
}

/**
 * Check if a Yjs document is marked as deleted
 */
export function isYjsDeleted(ydoc: Y.Doc): boolean {
  const metadata = ydoc.getMap<unknown>("metadata");
  return (metadata.get("deleted") as boolean) ?? false;
}

/**
 * Get the updatedAt timestamp from a Yjs document
 */
export function getYjsUpdatedAt(ydoc: Y.Doc): number {
  const metadata = ydoc.getMap<unknown>("metadata");
  return (metadata.get("updatedAt") as number) ?? 0;
}

/**
 * Compare timestamps to determine which version is newer
 * Returns:
 * - 'local' if local entry is newer
 * - 'remote' if Yjs document is newer
 * - 'same' if they have the same timestamp
 */
export function compareTimestamps(
  localUpdatedAt: number,
  ydoc: Y.Doc,
): "local" | "remote" | "same" {
  const remoteUpdatedAt = getYjsUpdatedAt(ydoc);

  if (localUpdatedAt > remoteUpdatedAt) {
    return "local";
  } else if (remoteUpdatedAt > localUpdatedAt) {
    return "remote";
  }
  return "same";
}

/**
 * Create an empty Yjs document with initialized structure
 */
export function createEmptyYjsDoc(): Y.Doc {
  const ydoc = new Y.Doc();
  // Initialize the map and array so they exist
  ydoc.getMap<unknown>("metadata");
  ydoc.getArray<Block>("blocks");
  return ydoc;
}

/**
 * Observe changes to a Yjs document
 * Returns an unsubscribe function
 */
export function observeYjsDoc(
  ydoc: Y.Doc,
  callback: (entry: Partial<Entry> & { deleted?: boolean }) => void,
): () => void {
  const metadata = ydoc.getMap<unknown>("metadata");
  const blocks = ydoc.getArray<Block>("blocks");

  // Track if we're processing to avoid duplicate callbacks
  let isProcessing = false;

  const notifyChange = () => {
    if (isProcessing) return;
    isProcessing = true;

    // Use setTimeout to batch multiple rapid changes
    setTimeout(() => {
      callback(yjsToEntry(ydoc));
      isProcessing = false;
    }, 0);
  };

  // Observe Y.Map and Y.Array changes (fires for local changes)
  metadata.observe(notifyChange);
  blocks.observe(notifyChange);

  // Observe ydoc updates (fires for ALL changes including remote)
  const onUpdate = () => {
    // Process all updates - the timestamp check in the callback will filter duplicates
    notifyChange();
  };

  ydoc.on("update", onUpdate);

  return () => {
    metadata.unobserve(notifyChange);
    blocks.unobserve(notifyChange);
    ydoc.off("update", onUpdate);
  };
}

// ============================================================================
// E2EE Encrypted Entry Functions
// ============================================================================

/**
 * Store encrypted entry data in a Yjs document
 *
 * The document stores:
 * - encrypted: true (marker)
 * - version: 2
 * - ciphertext, nonce, authTag: encrypted content
 * - wrappedKey: wrapped DEK for user
 * - createdAt, updatedAt: unencrypted for conflict resolution
 * - deleted: soft delete flag
 */
export function encryptedEntryToYjs(
  encrypted: EncryptedEntryV2,
  createdAt: number,
  updatedAt: number,
  ydoc: Y.Doc,
): void {
  const metadata = ydoc.getMap<unknown>("metadata");

  ydoc.transact(() => {
    metadata.set("encrypted", true);
    metadata.set("version", encrypted.version);
    metadata.set("ciphertext", encrypted.ciphertext);
    metadata.set("nonce", encrypted.nonce);
    metadata.set("authTag", encrypted.authTag);
    metadata.set("wrappedKey", encrypted.wrappedKey);
    metadata.set("createdAt", createdAt);
    metadata.set("updatedAt", updatedAt);
    metadata.set("deleted", false);
  });
}

/**
 * Extract encrypted entry data from a Yjs document
 * Returns null if the document is not encrypted or is empty.
 */
export function yjsToEncryptedEntry(ydoc: Y.Doc): {
  encrypted: EncryptedEntryV2;
  createdAt: number;
  updatedAt: number;
  deleted: boolean;
} | null {
  const metadata = ydoc.getMap<unknown>("metadata");

  const isEncrypted = metadata.get("encrypted") as boolean;
  if (!isEncrypted) {
    return null;
  }

  const ciphertext = metadata.get("ciphertext") as string;
  const nonce = metadata.get("nonce") as string;
  const authTag = metadata.get("authTag") as string;

  if (!ciphertext || !nonce || !authTag) {
    return null;
  }

  const wrappedKey = metadata.get(
    "wrappedKey",
  ) as EncryptedEntryV2["wrappedKey"];
  if (!wrappedKey) {
    return null;
  }

  const createdAt = (metadata.get("createdAt") as number) ?? Date.now();
  const updatedAt = (metadata.get("updatedAt") as number) ?? Date.now();
  const deleted = (metadata.get("deleted") as boolean) ?? false;

  return {
    encrypted: {
      ciphertext,
      nonce,
      authTag,
      wrappedKey,
      version: 2,
    },
    createdAt,
    updatedAt,
    deleted,
  };
}

/**
 * Check if a Yjs document contains encrypted data
 */
export function isYjsEncrypted(ydoc: Y.Doc): boolean {
  const metadata = ydoc.getMap<unknown>("metadata");
  return (metadata.get("encrypted") as boolean) === true;
}

/**
 * Mark an encrypted document as deleted
 */
export function markEncryptedYjsDeleted(ydoc: Y.Doc): void {
  const metadata = ydoc.getMap<unknown>("metadata");
  ydoc.transact(() => {
    metadata.set("deleted", true);
    metadata.set("updatedAt", Date.now());
  });
}

/**
 * Observe changes to an encrypted Yjs document
 * Returns the encrypted payload for decryption by the caller
 */
export function observeEncryptedYjsDoc(
  ydoc: Y.Doc,
  callback: (
    data: {
      encrypted: EncryptedEntryV2;
      createdAt: number;
      updatedAt: number;
      deleted: boolean;
    } | null,
  ) => void,
): () => void {
  const metadata = ydoc.getMap<unknown>("metadata");

  // Track if we're processing to avoid duplicate callbacks
  let isProcessing = false;

  const notifyChange = () => {
    if (isProcessing) return;
    isProcessing = true;

    // Use setTimeout to batch multiple rapid changes
    setTimeout(() => {
      callback(yjsToEncryptedEntry(ydoc));
      isProcessing = false;
    }, 0);
  };

  // Observe Y.Map changes (fires for local changes)
  const onMapChange = () => {
    notifyChange();
  };

  // Observe ydoc updates (fires for ALL changes including remote)
  // This is the key for real-time sync - remote changes come as raw updates
  const onUpdate = () => {
    // Process all updates - the timestamp check in the callback will filter duplicates
    notifyChange();
  };

  metadata.observe(onMapChange);
  ydoc.on("update", onUpdate);

  return () => {
    metadata.unobserve(onMapChange);
    ydoc.off("update", onUpdate);
  };
}
