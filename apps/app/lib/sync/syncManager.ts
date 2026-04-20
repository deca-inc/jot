/**
 * Sync Manager
 *
 * Orchestrates the sync lifecycle:
 * - Initial sync on login
 * - Ongoing sync of entry changes
 * - Conflict resolution
 * - Offline queue management
 */

import * as Crypto from "expo-crypto";
import { SQLiteDatabase } from "expo-sqlite";
import * as Y from "yjs";
import {
  uploadAttachmentForSync,
  downloadAttachmentFromServer,
} from "./assetSyncService";
import { encryptEntry, decryptEntry, hasUEK, isUEKStale } from "./encryption";
import {
  yjsToEntry,
  markYjsDeleted,
  getYjsUpdatedAt,
  observeYjsDoc,
  encryptedEntryToYjs,
  yjsToEncryptedEntry,
  isYjsEncrypted,
  observeEncryptedYjsDoc,
  markEncryptedYjsDeleted,
} from "./entryYjsMapper";
import {
  SyncClient,
  createSyncClient,
  ConnectionStatus,
  SyncClientCallbacks,
} from "./syncClient";
import { SyncQueue, QueuedSync, createSyncQueue } from "./syncQueue";
import type { Entry, Block, UpdateEntryInput } from "../db/entries";

/** Convert Uint8Array to base64 string (works in React Native and web) */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Convert base64 string to Uint8Array */
function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export type SyncStatus = "idle" | "syncing" | "synced" | "error" | "offline";

export interface SyncManagerCallbacks {
  onStatusChange?: (status: SyncStatus) => void;
  onEntryUpdated?: (entryId: number, uuid: string) => void;
  onEntryDeleted?: (entryId: number, uuid: string) => void;
  onConflict?: (
    entryId: number,
    localEntry: Entry,
    remoteEntry: Partial<Entry>,
  ) => void;
  onError?: (error: Error) => void;
  /**
   * Called when local UEK is older than server version.
   * Client should prompt user to re-authenticate to get the new key.
   */
  onStaleUEK?: (serverVersion: number) => void;
}

export interface EntrySyncInfo {
  id: number;
  uuid: string;
  sync_status: string;
  last_synced_at: number | null;
}

/**
 * SyncManager coordinates entry sync between local DB and server
 */
export class SyncManager {
  private client: SyncClient | null = null;
  private syncQueue: SyncQueue | null = null;
  private db: SQLiteDatabase;
  private getToken: () => Promise<string | null>;
  private callbacks: SyncManagerCallbacks;
  private entryObservers: Map<string, () => void> = new Map();
  private status: SyncStatus = "idle";
  private serverUrl: string | null = null;
  private isInitialized = false;
  private userId: string | null = null;

  constructor(
    db: SQLiteDatabase,
    getToken: () => Promise<string | null>,
    callbacks?: SyncManagerCallbacks,
  ) {
    this.db = db;
    this.getToken = getToken;
    this.callbacks = callbacks ?? {};
  }

  /**
   * Set the current user ID (needed for E2EE)
   */
  setUserId(userId: string): void {
    this.userId = userId;
  }

  /**
   * Initialize sync with a server URL
   */
  async initialize(serverUrl: string): Promise<void> {
    if (this.isInitialized && this.serverUrl === serverUrl) {
      return;
    }

    // Clean up existing client if reinitializing
    if (this.client) {
      this.shutdown();
    }

    this.serverUrl = serverUrl;

    const clientCallbacks: SyncClientCallbacks = {
      onStatusChange: (status) => this.handleConnectionStatusChange(status),
      onDocumentSynced: (docId) => this.handleDocumentSynced(docId),
      onDocumentError: (docId, error) => this.handleDocumentError(docId, error),
      onAuthError: () => this.handleAuthError(),
    };

    this.client = createSyncClient(serverUrl, this.getToken, {
      callbacks: clientCallbacks,
    });

    // Reset any previous auth failures on new initialization
    this.client.resetAuthFailures();

    // Initialize the sync queue with the sync function
    this.syncQueue = createSyncQueue(
      this.db,
      (item) => this.processSyncQueueItem(item),
      {
        onSyncFailed: (item, error) => {
          console.error(`[SyncManager] Sync failed for entry:`, error);
          this.callbacks.onError?.(error);
        },
      },
    );
    await this.syncQueue.initialize();

    // Initialize E2EE - generate keypair and upload public key
    await this.initializeE2EE();

    this.isInitialized = true;
    this.updateStatus("idle");
  }

  /**
   * Initialize E2EE: verify UEK exists locally
   *
   * With UEK-based encryption, keys are set up during login/registration.
   * This method just verifies the UEK is available for encryption operations.
   */
  private async initializeE2EE(): Promise<void> {
    try {
      // Verify UEK exists (set up during login/registration)
      const hasKey = await hasUEK();
      if (!hasKey) {
        console.info("[SyncManager] UEK not found - E2EE may not work");
      }
    } catch (error) {
      console.error("[SyncManager] E2EE initialization failed:", error);
      // Don't throw - sync can still work, just not encrypted
    }
  }

  /**
   * Perform initial sync using manifest comparison
   *
   * 1. Fetch server manifest (list of document UUIDs and timestamps)
   * 2. Compare with local entries
   * 3. Only sync entries that differ:
   *    - Local only → push to server
   *    - Server only → pull from server (future)
   *    - Both exist but timestamps differ → sync based on newer
   */
  async performInitialSync(): Promise<void> {
    if (!this.client || !this.serverUrl) {
      console.info("[SyncManager] performInitialSync skipped: not initialized");
      this.updateStatus("offline");
      return;
    }

    // Check if sync is disabled due to auth failures
    if (this.client.isSyncDisabled()) {
      console.info(
        "[SyncManager] performInitialSync skipped: sync disabled (auth failures)",
      );
      this.updateStatus("error");
      return;
    }

    this.updateStatus("syncing");

    try {
      // Fetch server manifest (includes UEK version)
      const manifestResult = await this.fetchServerManifest();
      if (!manifestResult) {
        this.updateStatus("offline");
        return;
      }
      const { documents: serverManifest, uekVersion } = manifestResult;

      // Check for stale UEK before proceeding with sync
      const stale = await isUEKStale(uekVersion);
      if (stale) {
        console.info(
          "[SyncManager] Local UEK is stale (server version:",
          uekVersion,
          ")",
        );
        this.callbacks.onStaleUEK?.(uekVersion);
        this.updateStatus("error");
        throw new Error(
          "Encryption key is outdated. Please log in again to update it.",
        );
      }

      // Create lookup map for server documents
      const serverDocs = new Map<string, number>();
      for (const doc of serverManifest) {
        serverDocs.set(doc.uuid, doc.updatedAt);
      }

      // Get local entries with UUIDs
      const localEntries = await this.getLocalEntriesWithUuids();

      // Determine what needs syncing
      const toPush: Entry[] = []; // Local entries to push to server
      const toPull: string[] = []; // Server UUIDs to pull

      for (const entry of localEntries) {
        if (!entry.uuid) continue;

        const serverUpdatedAt = serverDocs.get(entry.uuid);

        if (serverUpdatedAt === undefined) {
          // Entry only exists locally → push
          toPush.push(entry);
        } else if (entry.updatedAt > serverUpdatedAt) {
          // Local is newer → push
          toPush.push(entry);
        } else if (serverUpdatedAt > entry.updatedAt) {
          // Server is newer → pull (handles remote deletes, archive, favorite, title changes)
          toPull.push(entry.uuid);
        }
        // If timestamps are equal, documents are in sync

        // Remove from server map (remaining are server-only)
        serverDocs.delete(entry.uuid);
      }

      // Remaining server docs don't exist locally → need to pull
      for (const [uuid] of serverDocs) {
        toPull.push(uuid);
      }

      // Push local entries via HTTP bulk endpoint
      if (toPush.length > 0) {
        await this.bulkPushEntries(toPush);
      }

      // Pull server-only entries via HTTP bulk endpoint
      if (toPull.length > 0) {
        await this.bulkPullEntries(toPull);
      }

      await this.setLastSyncTimestamp(Date.now());
      this.updateStatus("synced");
    } catch (error) {
      console.error("[SyncManager] Sync failed:", error);
      this.updateStatus("error");
      const err = error instanceof Error ? error : new Error(String(error));
      this.callbacks.onError?.(err);
    }
  }

  /**
   * Fetch document manifest from server
   * Returns documents and UEK version for stale key detection
   */
  private async fetchServerManifest(): Promise<{
    documents: { uuid: string; updatedAt: number }[];
    uekVersion: number;
  } | null> {
    const token = await this.getToken();
    if (!token) {
      console.info(
        "[SyncManager] fetchServerManifest skipped: no auth token available",
      );
      return null;
    }

    // Always fetch the full manifest — it's lightweight (UUIDs + timestamps)
    // and a full comparison is more reliable than incremental sync which can
    // miss entries if a previous sync partially failed.
    const url = `${this.serverUrl}/api/documents/manifest`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch manifest: ${response.status}`);
    }

    const data = (await response.json()) as {
      documents: { uuid: string; updatedAt: number }[];
      uekVersion: number;
    };
    return {
      documents: data.documents,
      uekVersion: data.uekVersion ?? 0,
    };
  }

  /**
   * Bulk push entries to server via HTTP.
   * Converts each entry to an encrypted Yjs doc and sends as base64.
   */
  private async bulkPushEntries(entries: Entry[]): Promise<void> {
    if (!this.userId) {
      console.warn("[SyncManager] bulkPushEntries skipped: no userId set");
      return;
    }

    const token = await this.getToken();
    if (!token) {
      console.info("[SyncManager] bulkPushEntries skipped: no auth token");
      return;
    }

    const documents: Array<{
      uuid: string;
      state: string;
      metadata?: Record<string, unknown>;
    }> = [];

    for (const entry of entries) {
      try {
        let uuid = entry.uuid;
        if (!uuid) {
          uuid = await this.generateAndStoreUuid(entry.id);
        }

        // Create a Yjs doc, encrypt the entry into it, encode as base64
        const ydoc = new Y.Doc();
        ydoc.getMap<unknown>("metadata");
        ydoc.getArray<Block>("blocks");

        const encrypted = await encryptEntry(entry, this.userId);
        encryptedEntryToYjs(encrypted, entry.createdAt, entry.updatedAt, ydoc);

        const state = Y.encodeStateAsUpdate(ydoc);
        documents.push({
          uuid,
          state: uint8ArrayToBase64(state),
        });

        ydoc.destroy();
      } catch (error) {
        console.error(
          `[SyncManager] Failed to prepare entry ${entry.id} for push:`,
          error,
        );
      }
    }

    if (documents.length === 0) return;

    console.info(
      `[SyncManager] Bulk pushing ${documents.length} entries via HTTP`,
    );

    const response = await fetch(`${this.serverUrl}/api/documents/bulk-push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ documents }),
    });

    if (!response.ok) {
      throw new Error(`Bulk push failed: ${response.status}`);
    }

    const result = (await response.json()) as {
      pushed: number;
      failed: number;
    };
    console.info(
      `[SyncManager] Bulk push complete: ${result.pushed} pushed, ${result.failed} failed`,
    );

    // Mark pushed entries as synced and upload their attachments
    for (const entry of entries) {
      try {
        await this.markEntrySynced(entry.id);
      } catch {
        // Non-fatal
      }

      // Upload attachments in background (non-blocking per entry)
      if (entry.uuid && this.serverUrl) {
        const attachmentIds = this.extractAttachmentIds(entry);
        for (const attachmentId of attachmentIds) {
          uploadAttachmentForSync(
            this.serverUrl,
            entry.id,
            entry.uuid,
            attachmentId,
          ).catch((err) =>
            console.warn(
              `[SyncManager] Attachment upload failed for ${attachmentId}:`,
              err,
            ),
          );
        }
      }
    }
  }

  /**
   * Bulk pull entries from server via HTTP.
   * Downloads Yjs states, decrypts, and creates/updates local entries.
   */
  private async bulkPullEntries(uuids: string[]): Promise<void> {
    if (!this.userId) {
      console.warn("[SyncManager] bulkPullEntries skipped: no userId set");
      return;
    }

    const token = await this.getToken();
    if (!token) {
      console.info("[SyncManager] bulkPullEntries skipped: no auth token");
      return;
    }

    console.info(`[SyncManager] Bulk pulling ${uuids.length} entries via HTTP`);

    const response = await fetch(`${this.serverUrl}/api/documents/bulk-pull`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ uuids }),
    });

    if (!response.ok) {
      throw new Error(`Bulk pull failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      documents: Array<{
        uuid: string;
        state: string | null;
        updatedAt: number;
      }>;
    };

    for (const doc of data.documents) {
      try {
        if (!doc.state) continue;

        // Decode base64 Yjs state and apply to a new doc
        const stateBuffer = base64ToUint8Array(doc.state);
        const ydoc = new Y.Doc();
        Y.applyUpdate(ydoc, stateBuffer);

        // Decrypt and create/update local entry
        let localEntryId: number | null = null;
        let pulledEntry: Partial<Entry> | null = null;

        if (isYjsEncrypted(ydoc)) {
          const encryptedData = yjsToEncryptedEntry(ydoc);
          if (encryptedData && encryptedData.deleted) {
            // Entry was deleted remotely — remove local copy if it exists
            await this.deleteLocalEntryByUuid(doc.uuid);
          } else if (encryptedData) {
            const decrypted = await decryptEntry(
              encryptedData.encrypted,
              this.userId,
            );
            pulledEntry = {
              ...decrypted,
              createdAt: encryptedData.createdAt,
              updatedAt: encryptedData.updatedAt,
            };
            localEntryId = await this.createOrUpdateLocalEntry(
              doc.uuid,
              pulledEntry,
            );
          }
        } else {
          // Legacy unencrypted document
          const remoteEntry = yjsToEntry(ydoc, {});
          if (remoteEntry.deleted) {
            await this.deleteLocalEntryByUuid(doc.uuid);
          } else {
            pulledEntry = remoteEntry;
            localEntryId = await this.createOrUpdateLocalEntry(
              doc.uuid,
              pulledEntry,
            );
          }
        }

        // Download attachments for the pulled entry (non-blocking)
        if (localEntryId && pulledEntry && this.serverUrl) {
          const attachmentIds = this.extractAttachmentIdsFromBlocks(
            pulledEntry.blocks,
          );
          for (const attachmentId of attachmentIds) {
            downloadAttachmentFromServer(
              this.serverUrl,
              localEntryId,
              doc.uuid,
              attachmentId,
            ).catch((err) =>
              console.warn(
                `[SyncManager] Attachment download failed for ${attachmentId}:`,
                err,
              ),
            );
          }
        }

        ydoc.destroy();
      } catch (error) {
        console.error(`[SyncManager] Failed to pull entry ${doc.uuid}:`, error);
      }
    }

    console.info(
      `[SyncManager] Bulk pull complete: ${data.documents.length} entries`,
    );
  }

  /**
   * Create or update a local entry from pulled remote data
   */
  private async createOrUpdateLocalEntry(
    uuid: string,
    remoteData: Partial<Entry>,
  ): Promise<number> {
    // Check if entry already exists locally
    const existingRow = await this.db.getFirstAsync<{ id: number }>(
      "SELECT id FROM entries WHERE uuid = ?",
      [uuid],
    );

    if (existingRow) {
      await this.applyRemoteChanges(existingRow.id, remoteData);
      return existingRow.id;
    } else {
      // Create new local entry
      const blocks = JSON.stringify(remoteData.blocks ?? []);
      const tags = JSON.stringify(remoteData.tags ?? []);
      const attachments = JSON.stringify(remoteData.attachments ?? []);

      const result = await this.db.runAsync(
        `INSERT INTO entries (uuid, type, title, blocks, tags, attachments, isFavorite, isPinned, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuid,
          remoteData.type ?? "journal",
          remoteData.title ?? "",
          blocks,
          tags,
          attachments,
          remoteData.isFavorite ? 1 : 0,
          remoteData.isPinned ? 1 : 0,
          remoteData.createdAt ?? Date.now(),
          remoteData.updatedAt ?? Date.now(),
        ],
      );

      this.callbacks.onEntryUpdated?.(0, uuid);
      return result.lastInsertRowId;
    }
  }

  /**
   * Get all local entries that have UUIDs
   */
  private async getLocalEntriesWithUuids(): Promise<Entry[]> {
    const rows = await this.db.getAllAsync<{
      id: number;
      uuid: string | null;
      type: string;
      title: string;
      blocks: string;
      tags: string;
      attachments: string;
      isFavorite: number;
      isPinned: number;
      archivedAt: number | null;
      parentId: number | null;
      embedding: Uint8Array | null;
      embeddingModel: string | null;
      embeddingCreatedAt: number | null;
      generationStatus: string | null;
      generationStartedAt: number | null;
      generationModelId: string | null;
      agentId: number | null;
      sync_status: string | null;
      server_updated_at: number | null;
      last_synced_at: number | null;
      createdAt: number;
      updatedAt: number;
    }>(`
      SELECT * FROM entries WHERE uuid IS NOT NULL
      ORDER BY updatedAt DESC
    `);

    return rows.map((row) => this.mapRowToEntry(row));
  }

  /**
   * Sync an entry when it's opened for viewing/editing (with E2EE).
   * Connects to the document, syncs with server, and sets up real-time observer.
   * Call disconnectOnClose() when the entry is closed to clean up.
   */
  async syncOnOpen(entryId: number): Promise<void> {
    if (!this.client || !this.isInitialized) {
      console.warn(
        `[SyncManager] syncOnOpen(${entryId}) skipped: client=${!!this.client} initialized=${this.isInitialized}`,
      );
      return;
    }

    if (this.client.isSyncDisabled()) {
      console.warn(
        `[SyncManager] syncOnOpen(${entryId}) skipped: sync disabled (auth failures)`,
      );
      return;
    }

    if (!this.userId) {
      console.warn(
        `[SyncManager] syncOnOpen(${entryId}) skipped: no userId set`,
      );
      return;
    }

    console.log(`[SyncManager] syncOnOpen(${entryId}) starting...`);

    // Get or generate UUID
    let uuid = await this.getEntryUuid(entryId);
    if (!uuid) {
      uuid = await this.generateAndStoreUuid(entryId);
    }

    try {
      // Connect to the document and wait for sync
      const ydoc = await this.client.connectDocument(uuid);
      if (!ydoc) return;
      await this.client.waitForSync(uuid);

      // Get local entry for comparison
      const entry = await this.getLocalEntry(entryId);
      if (!entry) {
        return;
      }

      // Check timestamps and sync appropriately
      const remoteUpdatedAt = getYjsUpdatedAt(ydoc);

      if (remoteUpdatedAt === 0 || entry.updatedAt > remoteUpdatedAt) {
        // New document or local is newer - encrypt and push
        await this.pushEncryptedEntry(entry, ydoc);
      } else if (remoteUpdatedAt > entry.updatedAt) {
        // Remote is newer - decrypt and apply changes
        await this.pullAndApplyEncryptedChanges(entryId, ydoc);
      }
      // If timestamps are equal, documents are in sync

      // Set up observer for real-time changes while document is open
      this.observeEncryptedDocument(uuid, entryId, ydoc);
      await this.markEntrySynced(entryId);

      // Always notify that entry was updated to refresh UI cache
      this.callbacks.onEntryUpdated?.(entryId, uuid);
    } catch (error) {
      console.error("[SyncManager] syncOnOpen failed:", error);
      // Don't throw - sync failures shouldn't block editing
    }
  }

  /**
   * Disconnect from an entry when it's closed.
   * Cleans up WebSocket connection and observers.
   */
  async disconnectOnClose(entryId: number): Promise<void> {
    const uuid = await this.getEntryUuid(entryId);
    if (!uuid) {
      return;
    }

    // Remove observer
    const unobserve = this.entryObservers.get(uuid);
    if (unobserve) {
      unobserve();
      this.entryObservers.delete(uuid);
    }

    // Disconnect WebSocket for this document
    this.client?.disconnectDocument(uuid);
  }

  /**
   * Sync a single entry (with E2EE)
   */
  async syncEntry(entry: Entry): Promise<void> {
    if (!this.client) {
      console.info("[SyncManager] syncEntry skipped: not initialized");
      return;
    }

    if (!this.userId) {
      console.warn("[SyncManager] syncEntry skipped: no userId set");
      return;
    }

    // Ensure entry has UUID
    let uuid = await this.getEntryUuid(entry.id);
    if (!uuid) {
      uuid = await this.generateAndStoreUuid(entry.id);
    }

    // Connect to the document and wait for sync
    const ydoc = await this.client.connectDocument(uuid);
    if (!ydoc) return;
    await this.client.waitForSync(uuid);

    // Check if remote has changes
    const remoteUpdatedAt = getYjsUpdatedAt(ydoc);

    if (remoteUpdatedAt === 0 || entry.updatedAt > remoteUpdatedAt) {
      // New document or local is newer - encrypt and push
      await this.pushEncryptedEntry(entry, ydoc);
    } else if (remoteUpdatedAt > entry.updatedAt) {
      // Remote is newer - decrypt and apply changes
      await this.pullAndApplyEncryptedChanges(entry.id, ydoc);
    }
    // If timestamps are equal, documents are in sync

    // Set up observer for future changes
    this.observeEncryptedDocument(uuid, entry.id, ydoc);

    // Mark entry as synced
    await this.markEntrySynced(entry.id);
  }

  /**
   * Encrypt and push an entry to Yjs document.
   * Uses UEK-based symmetric encryption (V2).
   */
  private async pushEncryptedEntry(entry: Entry, ydoc: Y.Doc): Promise<void> {
    if (!this.userId) {
      throw new Error("Cannot encrypt entry: userId not set");
    }

    // Encrypt the entry with UEK (V2 encryption)
    const encrypted = await encryptEntry(entry, this.userId);

    // Store encrypted data in Yjs
    encryptedEntryToYjs(encrypted, entry.createdAt, entry.updatedAt, ydoc);
  }

  /**
   * Pull encrypted changes from Yjs and apply to local entry
   */
  private async pullAndApplyEncryptedChanges(
    entryId: number,
    ydoc: Y.Doc,
  ): Promise<void> {
    if (!this.userId) {
      throw new Error("User ID not set");
    }

    // Check if document is encrypted
    if (!isYjsEncrypted(ydoc)) {
      // Fall back to unencrypted handling for legacy documents
      const remoteEntry = yjsToEntry(ydoc, { id: entryId });
      await this.applyRemoteChanges(entryId, remoteEntry);
      return;
    }

    // Extract encrypted data
    const encryptedData = yjsToEncryptedEntry(ydoc);
    if (!encryptedData) {
      console.info("[SyncManager] Could not extract encrypted data");
      return;
    }

    if (encryptedData.deleted) {
      await this.handleRemoteDeletion(entryId);
      return;
    }

    // Decrypt the entry
    const decrypted = await decryptEntry(encryptedData.encrypted, this.userId);

    // Apply changes
    await this.applyRemoteChanges(entryId, {
      ...decrypted,
      createdAt: encryptedData.createdAt,
      updatedAt: encryptedData.updatedAt,
    });
  }

  /**
   * Set up observer for document changes.
   * Handles both encrypted and unencrypted documents.
   */
  private observeEncryptedDocument(
    uuid: string,
    entryId: number,
    ydoc: Y.Doc,
  ): void {
    // Remove existing observer
    const existingUnobserve = this.entryObservers.get(uuid);
    if (existingUnobserve) {
      existingUnobserve();
    }

    const encrypted = isYjsEncrypted(ydoc);

    // Track last seen updatedAt to avoid processing our own changes
    let lastSeenUpdatedAt = getYjsUpdatedAt(ydoc);

    if (encrypted && this.userId) {
      // Encrypted document observer
      const unobserve = observeEncryptedYjsDoc(ydoc, async (data) => {
        if (!data || !this.userId) {
          return;
        }

        if (data.updatedAt <= lastSeenUpdatedAt) {
          return;
        }

        lastSeenUpdatedAt = data.updatedAt;

        if (data.deleted) {
          await this.handleRemoteDeletion(entryId);
          return;
        }

        try {
          const decrypted = await decryptEntry(data.encrypted, this.userId);
          await this.applyRemoteChanges(entryId, {
            ...decrypted,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          });
        } catch (error) {
          console.error(
            "[SyncManager] Failed to decrypt observed changes:",
            error,
          );
        }
      });

      this.entryObservers.set(uuid, unobserve);
    } else {
      // Unencrypted document observer (fallback)
      const unobserve = observeYjsDoc(ydoc, async (remoteEntry) => {
        const currentUpdatedAt = remoteEntry.updatedAt ?? 0;

        if (currentUpdatedAt <= lastSeenUpdatedAt) {
          return;
        }

        lastSeenUpdatedAt = currentUpdatedAt;

        if (remoteEntry.deleted) {
          await this.handleRemoteDeletion(entryId);
          return;
        }

        await this.applyRemoteChanges(entryId, remoteEntry);
      });

      this.entryObservers.set(uuid, unobserve);
    }
  }

  /**
   * Handle remote deletion of an entry
   */
  private async handleRemoteDeletion(entryId: number): Promise<void> {
    try {
      await this.db.runAsync("DELETE FROM entries WHERE id = ?", [entryId]);
      this.callbacks.onEntryDeleted?.(entryId, "");
    } catch (error) {
      console.error("[SyncManager] Failed to delete entry:", error);
    }
  }

  /**
   * Delete a local entry by UUID (used during bulk pull when remote is deleted)
   */
  private async deleteLocalEntryByUuid(uuid: string): Promise<void> {
    try {
      const row = await this.db.getFirstAsync<{ id: number }>(
        "SELECT id FROM entries WHERE uuid = ?",
        [uuid],
      );
      if (row) {
        await this.db.runAsync("DELETE FROM entries WHERE id = ?", [row.id]);
        this.callbacks.onEntryDeleted?.(row.id, uuid);
        console.info(
          `[SyncManager] Deleted local entry ${row.id} (uuid=${uuid.slice(0, 8)}...) - marked deleted on server`,
        );
      }
    } catch (error) {
      console.error(
        `[SyncManager] Failed to delete local entry by uuid ${uuid}:`,
        error,
      );
    }
  }

  /**
   * Pull a server-only entry and create it locally (with E2EE)
   */
  private async pullServerEntry(uuid: string): Promise<void> {
    if (!this.client) {
      console.info("[SyncManager] pullServerEntry skipped: not initialized");
      return;
    }

    if (!this.userId) {
      console.warn("[SyncManager] pullServerEntry skipped: no userId set");
      return;
    }

    // Connect to the document and wait for sync
    const ydoc = await this.client.connectDocument(uuid);
    if (!ydoc) return;
    const synced = await this.client.waitForSync(uuid);
    if (!synced) {
      console.info("[SyncManager] pullServerEntry: sync timeout");
      this.client.disconnectDocument(uuid);
      return;
    }

    // Check if document has data
    const remoteUpdatedAt = getYjsUpdatedAt(ydoc);
    if (remoteUpdatedAt === 0) {
      this.client.disconnectDocument(uuid);
      return;
    }

    let entryData: Partial<Entry>;
    let createdAt: number;
    let updatedAt: number;

    // Check if document is encrypted
    if (isYjsEncrypted(ydoc)) {
      const encryptedData = yjsToEncryptedEntry(ydoc);
      if (!encryptedData) {
        console.info(
          "[SyncManager] pullServerEntry: could not extract encrypted data",
        );
        this.client.disconnectDocument(uuid);
        return;
      }

      if (encryptedData.deleted) {
        this.client.disconnectDocument(uuid);
        return;
      }

      entryData = await decryptEntry(encryptedData.encrypted, this.userId);
      createdAt = encryptedData.createdAt;
      updatedAt = encryptedData.updatedAt;
    } else {
      // Legacy unencrypted document
      const remoteEntry = yjsToEntry(ydoc);

      if (remoteEntry.deleted) {
        this.client.disconnectDocument(uuid);
        return;
      }

      entryData = remoteEntry;
      createdAt = remoteEntry.createdAt ?? Date.now();
      updatedAt = remoteEntry.updatedAt ?? Date.now();
    }

    // Create local entry
    const now = Date.now();
    const result = await this.db.runAsync(
      `INSERT INTO entries (
        uuid, type, title, blocks, tags, attachments,
        isFavorite, isPinned, archivedAt, parentId, agentId,
        sync_status, last_synced_at, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, ?, ?)`,
      [
        uuid,
        entryData.type ?? "journal",
        entryData.title ?? "",
        JSON.stringify(entryData.blocks ?? []),
        JSON.stringify(entryData.tags ?? []),
        JSON.stringify([]), // attachments
        entryData.isFavorite ? 1 : 0,
        entryData.isPinned ? 1 : 0,
        entryData.archivedAt ?? null,
        entryData.parentId ?? null,
        entryData.agentId ?? null,
        now,
        createdAt,
        updatedAt,
      ],
    );

    const entryId = result.lastInsertRowId;

    // Set up observer for future changes
    this.observeDocument(uuid, entryId, ydoc);

    // Notify that entry was created
    this.callbacks.onEntryUpdated?.(entryId, uuid);
  }

  /**
   * Handle local entry creation
   */
  async onEntryCreated(entry: Entry): Promise<void> {
    // Ensure entry has UUID
    let uuid = entry.uuid;
    if (!uuid) {
      uuid = await this.generateAndStoreUuid(entry.id);
    }

    // Queue the sync operation with the entry's updatedAt for conflict detection
    if (this.syncQueue) {
      await this.syncQueue.enqueueCreate(entry.id, uuid, entry.updatedAt);
    } else {
      // Fallback to direct sync if queue not initialized
      await this.markEntryPending(entry.id);
    }
  }

  /**
   * Handle local entry update
   * @param entryUpdatedAt - Optional: the entry's updatedAt when the edit was made (for conflict detection)
   */
  async onEntryUpdated(
    entryId: number,
    updates: UpdateEntryInput,
    entryUpdatedAt?: number,
  ): Promise<void> {
    const uuid = await this.getEntryUuid(entryId);
    if (!uuid) {
      console.log(
        `[SyncManager] onEntryUpdated(${entryId}) - no UUID, marking modified`,
      );
      await this.markEntryModified(entryId);
      return;
    }

    // Queue the sync operation with debouncing for rapid edits
    // Pass the entry's updatedAt for conflict detection
    if (this.syncQueue) {
      console.log(
        `[SyncManager] onEntryUpdated(${entryId}) - queuing sync for uuid=${uuid.slice(0, 8)}...`,
      );
      this.syncQueue.enqueueUpdateDebounced(
        entryId,
        uuid,
        updates,
        entryUpdatedAt,
      );
    } else {
      await this.markEntryModified(entryId);
    }
  }

  /**
   * Handle local entry deletion
   * Note: Call this BEFORE deleting the entry from the database to capture the UUID
   */
  async onEntryDeleted(entryId: number, uuid?: string): Promise<void> {
    // Get UUID if not provided (caller should provide it before entry deletion)
    const entryUuid = uuid ?? (await this.getEntryUuid(entryId));
    if (!entryUuid) {
      return;
    }

    // Queue the delete operation (will be synced when online)
    if (this.syncQueue) {
      await this.syncQueue.enqueueDelete(entryUuid);
    }

    // Cleanup local observers and connections
    if (this.client) {
      const ydoc = this.client.getDocument(entryUuid);
      if (ydoc) {
        markYjsDeleted(ydoc);
      }

      // Remove observer
      const unobserve = this.entryObservers.get(entryUuid);
      if (unobserve) {
        unobserve();
        this.entryObservers.delete(entryUuid);
      }

      // Disconnect document
      this.client.disconnectDocument(entryUuid);
    }
  }

  /**
   * Reconnect to the server with fresh tokens.
   * Resets auth failure tracking and rebuilds all WebSocket connections.
   */
  async reconnect(): Promise<void> {
    if (!this.client) return;
    this.client.resetAuthFailures();
    await this.client.reconnectAll();
    this.updateStatus("idle");
  }

  /**
   * Shutdown sync manager
   */
  shutdown(): void {
    // Shutdown the sync queue
    if (this.syncQueue) {
      this.syncQueue.shutdown();
      this.syncQueue = null;
    }

    // Unsubscribe all observers
    for (const [, unobserve] of this.entryObservers) {
      unobserve();
    }
    this.entryObservers.clear();

    // Disconnect all documents
    if (this.client) {
      this.client.disconnectAll();
      this.client = null;
    }

    this.isInitialized = false;
    this.updateStatus("idle");
  }

  /**
   * Get sync queue stats
   */
  async getQueueStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  } | null> {
    if (!this.syncQueue) return null;
    return this.syncQueue.getStats();
  }

  /**
   * Retry failed sync items
   */
  async retryFailedSyncs(): Promise<void> {
    if (this.syncQueue) {
      await this.syncQueue.retryFailed();
    }
  }

  /**
   * Clear completed sync items
   */
  async clearCompletedSyncs(): Promise<void> {
    if (this.syncQueue) {
      await this.syncQueue.clearCompleted();
    }
  }

  /**
   * Get current sync status
   */
  getStatus(): SyncStatus {
    return this.status;
  }

  /**
   * Get connection status for a specific entry
   */
  async getEntryConnectionStatus(entryId: number): Promise<ConnectionStatus> {
    if (!this.client) return "disconnected";

    const uuid = await this.getEntryUuid(entryId);
    if (!uuid) return "disconnected";

    return this.client.getDocumentStatus(uuid);
  }

  // Private methods

  /**
   * Process a single item from the sync queue
   */
  private async processSyncQueueItem(item: QueuedSync): Promise<void> {
    if (!this.client) {
      console.info(
        "[SyncManager] processSyncQueueItem skipped: client not initialized",
      );
      return;
    }

    switch (item.operation) {
      case "create": {
        if (item.entryId === null) {
          throw new Error("Create operation requires entryId");
        }
        const entry = await this.getLocalEntry(item.entryId);
        if (!entry) {
          // Entry was deleted before sync completed - skip
          return;
        }
        const ydoc = await this.client.connectDocument(item.entryUuid);
        if (!ydoc) return;
        await this.client.waitForSync(item.entryUuid);
        // Use encrypted push
        await this.pushEncryptedEntry(entry, ydoc);
        this.observeEncryptedDocument(item.entryUuid, item.entryId, ydoc);
        await this.markEntrySynced(item.entryId);
        break;
      }

      case "update": {
        if (item.entryId === null) {
          throw new Error("Update operation requires entryId");
        }

        console.log(
          `[SyncManager] Processing sync queue: update entry=${item.entryId} uuid=${item.entryUuid.slice(0, 8)}...`,
        );

        // Get current local entry state
        const currentEntry = await this.getLocalEntry(item.entryId);
        if (!currentEntry) {
          return;
        }

        // Conflict detection: check if entry was modified after this update was queued
        // If so, the current entry state takes precedence (it's newer)
        if (
          item.entryUpdatedAtWhenQueued &&
          currentEntry.updatedAt > item.entryUpdatedAtWhenQueued
        ) {
          // Entry was modified after queue - skip stale update
          return;
        }

        let ydoc = this.client.getDocument(item.entryUuid);
        if (!ydoc) {
          // Document not connected - connect first
          ydoc = await this.client.connectDocument(item.entryUuid);
          if (!ydoc) return;
          await this.client.waitForSync(item.entryUuid);
        }

        // With E2EE, we always re-encrypt the full entry (can't do partial updates)
        await this.pushEncryptedEntry(currentEntry, ydoc);
        this.observeEncryptedDocument(item.entryUuid, item.entryId, ydoc);
        await this.markEntrySynced(item.entryId);
        break;
      }

      case "delete": {
        let ydoc = this.client.getDocument(item.entryUuid);
        if (!ydoc) {
          // Try to connect and mark as deleted
          ydoc = await this.client.connectDocument(item.entryUuid);
          if (ydoc) {
            await this.client.waitForSync(item.entryUuid);
          }
        }
        if (ydoc) {
          // Use encrypted delete marker
          if (isYjsEncrypted(ydoc)) {
            markEncryptedYjsDeleted(ydoc);
          } else {
            markYjsDeleted(ydoc);
          }
        }

        // Cleanup
        const unobserve = this.entryObservers.get(item.entryUuid);
        if (unobserve) {
          unobserve();
          this.entryObservers.delete(item.entryUuid);
        }
        this.client.disconnectDocument(item.entryUuid);
        break;
      }
    }
  }

  /**
   * Extract attachment IDs from an entry's blocks (HTML content).
   * Looks for data-value attributes containing attachment metadata.
   */
  private extractAttachmentIds(entry: Entry): string[] {
    return this.extractAttachmentIdsFromBlocks(entry.blocks);
  }

  /**
   * Extract attachment IDs from blocks array.
   */
  private extractAttachmentIdsFromBlocks(
    blocks: Block[] | undefined,
  ): string[] {
    if (!blocks) return [];
    const ids: string[] = [];
    for (const block of blocks) {
      if ("content" in block && block.content) {
        // Match data-value="..." attributes containing JSON with attachment IDs
        const regex = /data-value="([^"]*)"/g;
        let match;
        while ((match = regex.exec(block.content)) !== null) {
          try {
            const decoded = match[1]
              .replace(/&quot;/g, '"')
              .replace(/&amp;/g, "&");
            const parsed = JSON.parse(decoded) as { id?: string };
            if (parsed.id) {
              ids.push(parsed.id);
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
    return ids;
  }

  /**
   * Get entries that are marked as pending/modified (for incremental sync)
   */
  private async getEntriesForSync(): Promise<Entry[]> {
    const rows = await this.db.getAllAsync<{
      id: number;
      uuid: string | null;
      type: string;
      title: string;
      blocks: string;
      tags: string;
      attachments: string;
      isFavorite: number;
      isPinned: number;
      archivedAt: number | null;
      parentId: number | null;
      embedding: Uint8Array | null;
      embeddingModel: string | null;
      embeddingCreatedAt: number | null;
      generationStatus: string | null;
      generationStartedAt: number | null;
      generationModelId: string | null;
      agentId: number | null;
      sync_status: string | null;
      server_updated_at: number | null;
      last_synced_at: number | null;
      createdAt: number;
      updatedAt: number;
    }>(`
      SELECT * FROM entries
      WHERE sync_status = 'pending' OR sync_status = 'modified'
      ORDER BY updatedAt DESC
    `);

    return rows.map((row) => this.mapRowToEntry(row));
  }

  private async getEntryUuid(entryId: number): Promise<string | null> {
    const result = await this.db.getFirstAsync<{ uuid: string | null }>(
      `SELECT uuid FROM entries WHERE id = ?`,
      [entryId],
    );
    return result?.uuid ?? null;
  }

  private async generateAndStoreUuid(entryId: number): Promise<string> {
    const uuid = Crypto.randomUUID();
    await this.db.runAsync(`UPDATE entries SET uuid = ? WHERE id = ?`, [
      uuid,
      entryId,
    ]);
    return uuid;
  }

  private async markEntrySynced(entryId: number): Promise<void> {
    const now = Date.now();
    await this.db.runAsync(
      `UPDATE entries SET sync_status = 'synced', last_synced_at = ? WHERE id = ?`,
      [now, entryId],
    );
  }

  private async markEntryPending(entryId: number): Promise<void> {
    await this.db.runAsync(
      `UPDATE entries SET sync_status = 'pending' WHERE id = ?`,
      [entryId],
    );
  }

  private async markEntryModified(entryId: number): Promise<void> {
    await this.db.runAsync(
      `UPDATE entries SET sync_status = 'modified' WHERE id = ?`,
      [entryId],
    );
  }

  private async getLastSyncTimestamp(): Promise<number | null> {
    const row = await this.db.getFirstAsync<{ value: string }>(
      "SELECT value FROM settings WHERE key = 'last_sync_timestamp'",
    );
    return row ? Number(row.value) : null;
  }

  private async setLastSyncTimestamp(timestamp: number): Promise<void> {
    await this.db.runAsync(
      `INSERT OR REPLACE INTO settings (key, value, updatedAt) VALUES ('last_sync_timestamp', ?, ?)`,
      [String(timestamp), Date.now()],
    );
  }

  private async applyRemoteChanges(
    entryId: number,
    remoteEntry: Partial<Entry> & { deleted?: boolean },
  ): Promise<void> {
    if (remoteEntry.deleted) {
      // Entry was deleted remotely
      await this.db.runAsync(`DELETE FROM entries WHERE id = ?`, [entryId]);
      const uuid = await this.getEntryUuid(entryId);
      if (uuid) {
        this.callbacks.onEntryDeleted?.(entryId, uuid);
      }
      return;
    }

    // Update local entry with remote data
    const updates: string[] = [];
    const params: (string | number | null)[] = [];

    if (remoteEntry.title !== undefined) {
      updates.push("title = ?");
      params.push(remoteEntry.title);
    }
    if (remoteEntry.blocks !== undefined) {
      updates.push("blocks = ?");
      params.push(JSON.stringify(remoteEntry.blocks));
    }
    if (remoteEntry.tags !== undefined) {
      updates.push("tags = ?");
      params.push(JSON.stringify(remoteEntry.tags));
    }
    if (remoteEntry.isFavorite !== undefined) {
      updates.push("isFavorite = ?");
      params.push(remoteEntry.isFavorite ? 1 : 0);
    }
    if (remoteEntry.isPinned !== undefined) {
      updates.push("isPinned = ?");
      params.push(remoteEntry.isPinned ? 1 : 0);
    }
    if (remoteEntry.archivedAt !== undefined) {
      updates.push("archivedAt = ?");
      params.push(remoteEntry.archivedAt);
    }
    if (remoteEntry.updatedAt !== undefined) {
      updates.push("updatedAt = ?");
      params.push(remoteEntry.updatedAt);
    }

    if (updates.length > 0) {
      updates.push("sync_status = 'synced'");
      updates.push("last_synced_at = ?");
      params.push(Date.now());
      params.push(entryId);

      await this.db.runAsync(
        `UPDATE entries SET ${updates.join(", ")} WHERE id = ?`,
        params,
      );

      const uuid = await this.getEntryUuid(entryId);
      if (uuid) {
        this.callbacks.onEntryUpdated?.(entryId, uuid);
      }
    }
  }

  private observeDocument(uuid: string, entryId: number, ydoc: Y.Doc): void {
    // Remove existing observer if any
    const existing = this.entryObservers.get(uuid);
    if (existing) {
      existing();
    }

    // Set up new observer
    const unobserve = observeYjsDoc(ydoc, async (remoteEntry) => {
      // Check if this is a remote change (not a local change we just made)
      const localEntry = await this.getLocalEntry(entryId);
      if (
        localEntry &&
        remoteEntry.updatedAt &&
        remoteEntry.updatedAt > localEntry.updatedAt
      ) {
        await this.applyRemoteChanges(entryId, remoteEntry);
      }
    });

    this.entryObservers.set(uuid, unobserve);
  }

  private async getLocalEntry(entryId: number): Promise<Entry | null> {
    const row = await this.db.getFirstAsync<{
      id: number;
      type: string;
      title: string;
      blocks: string;
      tags: string;
      attachments: string;
      isFavorite: number;
      isPinned: number;
      archivedAt: number | null;
      parentId: number | null;
      embedding: Uint8Array | null;
      embeddingModel: string | null;
      embeddingCreatedAt: number | null;
      generationStatus: string | null;
      generationStartedAt: number | null;
      generationModelId: string | null;
      agentId: number | null;
      createdAt: number;
      updatedAt: number;
    }>(`SELECT * FROM entries WHERE id = ?`, [entryId]);

    if (!row) return null;
    return this.mapRowToEntry(row);
  }

  private mapRowToEntry(row: {
    id: number;
    uuid?: string | null;
    type: string;
    title: string;
    title_pinned?: number | null;
    blocks: string;
    tags: string;
    attachments: string;
    isFavorite: number;
    isPinned: number;
    archivedAt: number | null;
    parentId: number | null;
    embedding: Uint8Array | null;
    embeddingModel: string | null;
    embeddingCreatedAt: number | null;
    generationStatus: string | null;
    generationStartedAt: number | null;
    generationModelId: string | null;
    agentId: number | null;
    sync_status?: string | null;
    server_updated_at?: number | null;
    last_synced_at?: number | null;
    createdAt: number;
    updatedAt: number;
  }): Entry {
    return {
      id: row.id,
      uuid: row.uuid ?? null,
      type: row.type as Entry["type"],
      title: row.title,
      titlePinned: (row.title_pinned ?? 0) === 1,
      blocks: JSON.parse(row.blocks) as Block[],
      tags: JSON.parse(row.tags) as string[],
      attachments: JSON.parse(row.attachments) as string[],
      isFavorite: row.isFavorite === 1,
      isPinned: row.isPinned === 1,
      archivedAt: row.archivedAt,
      parentId: row.parentId,
      embedding: row.embedding,
      embeddingModel: row.embeddingModel,
      embeddingCreatedAt: row.embeddingCreatedAt,
      generationStatus: row.generationStatus as Entry["generationStatus"],
      generationStartedAt: row.generationStartedAt,
      generationModelId: row.generationModelId,
      agentId: row.agentId,
      syncStatus: (row.sync_status as Entry["syncStatus"]) ?? null,
      serverUpdatedAt: row.server_updated_at ?? null,
      lastSyncedAt: row.last_synced_at ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private handleConnectionStatusChange(status: ConnectionStatus): void {
    if (status === "synced") {
      this.updateStatus("synced");
    } else if (status === "connecting" || status === "syncing") {
      this.updateStatus("syncing");
    } else if (status === "disconnected") {
      this.updateStatus("offline");
    }
  }

  private handleDocumentSynced(_docId: string): void {
    // Document synced - could emit event here
  }

  private handleDocumentError(docId: string, error: Error): void {
    console.error(`Document ${docId} sync error:`, error);
    this.callbacks.onError?.(error);
  }

  private handleAuthError(): void {
    if (this.client?.isSyncDisabled()) {
      console.info(
        "[SyncManager] Auth failures exceeded, sync paused until re-authenticated",
      );
      this.updateStatus("error");
    } else {
      console.info("[SyncManager] Auth unavailable, sync offline");
      this.updateStatus("offline");
    }
  }

  private updateStatus(status: SyncStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.callbacks.onStatusChange?.(status);
    }
  }
}

/**
 * Create a new SyncManager instance
 */
export function createSyncManager(
  db: SQLiteDatabase,
  getToken: () => Promise<string | null>,
  callbacks?: SyncManagerCallbacks,
): SyncManager {
  return new SyncManager(db, getToken, callbacks);
}
