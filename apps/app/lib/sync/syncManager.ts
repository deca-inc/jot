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
import { encryptEntry, decryptEntry, hasUEK } from "./encryption";
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
        onQueueEmpty: () => {
          console.log("[SyncManager] Sync queue empty");
        },
        onSyncFailed: (item, error) => {
          console.error(
            `[SyncManager] Sync failed for ${item.entryUuid}:`,
            error,
          );
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
      console.log("[SyncManager] Initializing E2EE...");

      // Verify UEK exists (set up during login/registration)
      const hasKey = await hasUEK();
      if (!hasKey) {
        console.warn(
          "[SyncManager] UEK not found - E2EE may not work. Please re-login.",
        );
      } else {
        console.log("[SyncManager] E2EE initialized (UEK available)");
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
      throw new Error("Sync not initialized");
    }

    // Check if sync is disabled due to auth failures
    if (this.client.isSyncDisabled()) {
      console.warn("[SyncManager] Sync disabled due to auth failures");
      this.updateStatus("error");
      throw new Error("Sync disabled due to authentication failures");
    }

    this.updateStatus("syncing");

    try {
      // Fetch server manifest
      console.log("[SyncManager] Fetching server manifest...");
      const serverManifest = await this.fetchServerManifest();
      console.log(
        `[SyncManager] Server has ${serverManifest.length} documents`,
      );

      // Create lookup map for server documents
      const serverDocs = new Map<string, number>();
      for (const doc of serverManifest) {
        serverDocs.set(doc.uuid, doc.updatedAt);
      }

      // Get local entries with UUIDs
      const localEntries = await this.getLocalEntriesWithUuids();
      console.log(
        `[SyncManager] Local has ${localEntries.length} entries with UUIDs`,
      );

      // Determine what needs syncing
      const toPush: Entry[] = []; // Local entries to push to server
      const toPull: string[] = []; // Server UUIDs to pull (not implemented yet)

      for (const entry of localEntries) {
        if (!entry.uuid) continue;

        const serverUpdatedAt = serverDocs.get(entry.uuid);

        if (serverUpdatedAt === undefined) {
          // Entry only exists locally → push
          toPush.push(entry);
        } else if (entry.updatedAt > serverUpdatedAt) {
          // Local is newer → push
          toPush.push(entry);
        }
        // If server is newer, we'd pull (handled by Yjs observer when connected)

        // Remove from server map (remaining are server-only)
        serverDocs.delete(entry.uuid);
      }

      // Remaining server docs don't exist locally → would need to pull
      for (const [uuid] of serverDocs) {
        toPull.push(uuid);
      }

      console.log(
        `[SyncManager] Sync plan: ${toPush.length} to push, ${toPull.length} to pull`,
      );

      // Push local entries
      let synced = 0;
      let failed = 0;

      for (const entry of toPush) {
        try {
          console.log(
            `[SyncManager] Pushing entry ${entry.id} (${synced + 1}/${toPush.length})...`,
          );
          await this.syncEntry(entry);
          synced++;
        } catch (error) {
          console.error(
            `[SyncManager] Failed to sync entry ${entry.id}:`,
            error,
          );
          failed++;
        }
      }

      // Pull server-only entries (create local entries from Yjs docs)
      let pulled = 0;
      let pullFailed = 0;

      for (const uuid of toPull) {
        try {
          console.log(
            `[SyncManager] Pulling entry ${uuid} (${pulled + 1}/${toPull.length})...`,
          );
          await this.pullServerEntry(uuid);
          pulled++;
        } catch (error) {
          console.error(`[SyncManager] Failed to pull entry ${uuid}:`, error);
          pullFailed++;
        }
      }

      console.log(
        `[SyncManager] Sync complete: ${synced} pushed, ${pulled} pulled, ${failed + pullFailed} failed`,
      );
      this.updateStatus("synced");
    } catch (error) {
      console.error("[SyncManager] Sync failed:", error);
      this.updateStatus("error");
      const err = error instanceof Error ? error : new Error(String(error));
      this.callbacks.onError?.(err);
      throw error;
    }
  }

  /**
   * Fetch document manifest from server
   */
  private async fetchServerManifest(): Promise<
    { uuid: string; updatedAt: number }[]
  > {
    const token = await this.getToken();
    if (!token) {
      throw new Error("Not authenticated");
    }

    const response = await fetch(`${this.serverUrl}/api/documents/manifest`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch manifest: ${response.status}`);
    }

    const data = (await response.json()) as {
      documents: { uuid: string; updatedAt: number }[];
    };
    return data.documents;
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
      console.log("[SyncManager] syncOnOpen: not initialized");
      return;
    }

    if (this.client.isSyncDisabled()) {
      console.log("[SyncManager] syncOnOpen: sync disabled");
      return;
    }

    if (!this.userId) {
      console.log("[SyncManager] syncOnOpen: user ID not set");
      return;
    }

    // Get or generate UUID
    let uuid = await this.getEntryUuid(entryId);
    if (!uuid) {
      uuid = await this.generateAndStoreUuid(entryId);
    }

    console.log(
      `[SyncManager] syncOnOpen: connecting to entry ${entryId} (${uuid})`,
    );

    try {
      // Connect to the document and wait for sync
      const ydoc = await this.client.connectDocument(uuid);
      await this.client.waitForSync(uuid);

      // Get local entry for comparison
      const entry = await this.getLocalEntry(entryId);
      if (!entry) {
        console.log(
          `[SyncManager] syncOnOpen: entry ${entryId} not found locally`,
        );
        return;
      }

      // Check timestamps and sync appropriately
      const remoteUpdatedAt = getYjsUpdatedAt(ydoc);

      if (remoteUpdatedAt === 0 || entry.updatedAt > remoteUpdatedAt) {
        // New document or local is newer - encrypt and push
        console.log(
          `[SyncManager] syncOnOpen: pushing encrypted state to server`,
        );
        await this.pushEncryptedEntry(entry, ydoc);
      } else if (remoteUpdatedAt > entry.updatedAt) {
        // Remote is newer - decrypt and apply changes
        console.log(
          `[SyncManager] syncOnOpen: remote is newer, decrypting and applying`,
        );
        await this.pullAndApplyEncryptedChanges(entryId, ydoc);
      }
      // If timestamps are equal, documents are in sync

      // Set up observer for real-time changes while document is open
      this.observeEncryptedDocument(uuid, entryId, ydoc);
      await this.markEntrySynced(entryId);

      // Always notify that entry was updated to refresh UI cache
      this.callbacks.onEntryUpdated?.(entryId, uuid);

      console.log(
        `[SyncManager] syncOnOpen: entry ${entryId} synced and observing`,
      );
    } catch (error) {
      console.error(
        `[SyncManager] syncOnOpen failed for entry ${entryId}:`,
        error,
      );
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

    console.log(
      `[SyncManager] disconnectOnClose: disconnecting entry ${entryId} (${uuid})`,
    );

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
      throw new Error("Sync not initialized");
    }

    if (!this.userId) {
      throw new Error("User ID not set - call setUserId() before syncing");
    }

    // Ensure entry has UUID
    let uuid = await this.getEntryUuid(entry.id);
    if (!uuid) {
      uuid = await this.generateAndStoreUuid(entry.id);
    }

    // Connect to the document and wait for sync
    const ydoc = await this.client.connectDocument(uuid);
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

    console.log(`[SyncManager] Encrypting entry ${entry.id}...`);

    // Encrypt the entry with UEK (V2 encryption)
    const encrypted = await encryptEntry(entry, this.userId);

    // Store encrypted data in Yjs
    encryptedEntryToYjs(encrypted, entry.createdAt, entry.updatedAt, ydoc);

    console.log(`[SyncManager] Entry ${entry.id} encrypted and pushed (v2)`);
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
      console.log(`[SyncManager] Document not encrypted, using legacy sync`);
      const remoteEntry = yjsToEntry(ydoc, { id: entryId });
      await this.applyRemoteChanges(entryId, remoteEntry);
      return;
    }

    // Extract encrypted data
    const encryptedData = yjsToEncryptedEntry(ydoc);
    if (!encryptedData) {
      console.warn(`[SyncManager] Could not extract encrypted data`);
      return;
    }

    if (encryptedData.deleted) {
      console.log(`[SyncManager] Entry ${entryId} was deleted remotely`);
      await this.handleRemoteDeletion(entryId);
      return;
    }

    console.log(`[SyncManager] Decrypting entry ${entryId}...`);

    // Decrypt the entry
    const decrypted = await decryptEntry(encryptedData.encrypted, this.userId);

    // Apply changes
    await this.applyRemoteChanges(entryId, {
      ...decrypted,
      createdAt: encryptedData.createdAt,
      updatedAt: encryptedData.updatedAt,
    });

    console.log(`[SyncManager] Entry ${entryId} decrypted and applied`);
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
    console.log(
      `[SyncManager] Setting up observer for entry ${entryId} (${uuid}), encrypted: ${encrypted}`,
    );

    // Track last seen updatedAt to avoid processing our own changes
    let lastSeenUpdatedAt = getYjsUpdatedAt(ydoc);

    if (encrypted && this.userId) {
      // Encrypted document observer
      const unobserve = observeEncryptedYjsDoc(ydoc, async (data) => {
        console.log(
          `[SyncManager] Encrypted observer fired for entry ${entryId}, data:`,
          data ? "present" : "null",
        );

        if (!data || !this.userId) {
          console.log(`[SyncManager] Observer: skipping - no data or userId`);
          return;
        }

        console.log(
          `[SyncManager] Observer: remote=${data.updatedAt} local=${lastSeenUpdatedAt} diff=${data.updatedAt - lastSeenUpdatedAt}ms`,
        );

        if (data.updatedAt <= lastSeenUpdatedAt) {
          console.log(`[SyncManager] Observer: skipping - no newer changes`);
          return;
        }

        console.log(
          `[SyncManager] Observer: processing encrypted change for entry ${entryId}`,
        );
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
          console.log(
            `[SyncManager] Observer: applied encrypted changes for entry ${entryId}`,
          );
        } catch (error) {
          console.error(
            `[SyncManager] Failed to decrypt observed changes:`,
            error,
          );
        }
      });

      this.entryObservers.set(uuid, unobserve);
    } else {
      // Unencrypted document observer (fallback)
      const unobserve = observeYjsDoc(ydoc, async (remoteEntry) => {
        const currentUpdatedAt = remoteEntry.updatedAt ?? 0;
        console.log(
          `[SyncManager] Unencrypted observer fired for entry ${entryId}`,
        );

        if (currentUpdatedAt <= lastSeenUpdatedAt) {
          return;
        }

        console.log(
          `[SyncManager] Observer: processing unencrypted change for entry ${entryId}`,
        );
        lastSeenUpdatedAt = currentUpdatedAt;

        if (remoteEntry.deleted) {
          await this.handleRemoteDeletion(entryId);
          return;
        }

        await this.applyRemoteChanges(entryId, remoteEntry);
        console.log(
          `[SyncManager] Observer: applied unencrypted changes for entry ${entryId}`,
        );
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
      console.error(`[SyncManager] Failed to delete entry ${entryId}:`, error);
    }
  }

  /**
   * Pull a server-only entry and create it locally (with E2EE)
   */
  private async pullServerEntry(uuid: string): Promise<void> {
    if (!this.client) {
      throw new Error("Sync not initialized");
    }

    if (!this.userId) {
      throw new Error("User ID not set");
    }

    // Connect to the document and wait for sync
    const ydoc = await this.client.connectDocument(uuid);
    const synced = await this.client.waitForSync(uuid);
    if (!synced) {
      console.warn(`[SyncManager] pullServerEntry: sync timeout for ${uuid}`);
      this.client.disconnectDocument(uuid);
      return;
    }

    // Check if document has data
    const remoteUpdatedAt = getYjsUpdatedAt(ydoc);
    if (remoteUpdatedAt === 0) {
      console.log(
        `[SyncManager] pullServerEntry: document ${uuid} is empty, skipping`,
      );
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
        console.warn(
          `[SyncManager] pullServerEntry: could not extract encrypted data for ${uuid}`,
        );
        this.client.disconnectDocument(uuid);
        return;
      }

      if (encryptedData.deleted) {
        console.log(
          `[SyncManager] pullServerEntry: document ${uuid} is deleted, skipping`,
        );
        this.client.disconnectDocument(uuid);
        return;
      }

      console.log(`[SyncManager] pullServerEntry: decrypting ${uuid}...`);
      entryData = await decryptEntry(encryptedData.encrypted, this.userId);
      createdAt = encryptedData.createdAt;
      updatedAt = encryptedData.updatedAt;
    } else {
      // Legacy unencrypted document
      console.log(
        `[SyncManager] pullServerEntry: ${uuid} is unencrypted (legacy)`,
      );
      const remoteEntry = yjsToEntry(ydoc);

      if (remoteEntry.deleted) {
        console.log(
          `[SyncManager] pullServerEntry: document ${uuid} is deleted, skipping`,
        );
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
    console.log(
      `[SyncManager] pullServerEntry: created local entry ${entryId} for ${uuid}`,
    );

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
      await this.markEntryModified(entryId);
      return;
    }

    // Queue the sync operation with debouncing for rapid edits
    // Pass the entry's updatedAt for conflict detection
    if (this.syncQueue) {
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
      throw new Error("Sync client not initialized");
    }

    console.log(
      `[SyncManager] Processing queue item: ${item.operation} for ${item.entryUuid}`,
    );

    switch (item.operation) {
      case "create": {
        if (item.entryId === null) {
          throw new Error("Create operation requires entryId");
        }
        const entry = await this.getLocalEntry(item.entryId);
        if (!entry) {
          // Entry was deleted before sync completed - skip
          console.log(
            `[SyncManager] Entry ${item.entryId} not found, skipping create`,
          );
          return;
        }
        const ydoc = await this.client.connectDocument(item.entryUuid);
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

        // Get current local entry state
        const currentEntry = await this.getLocalEntry(item.entryId);
        if (!currentEntry) {
          console.log(
            `[SyncManager] Entry ${item.entryId} not found, skipping update`,
          );
          return;
        }

        // Conflict detection: check if entry was modified after this update was queued
        // If so, the current entry state takes precedence (it's newer)
        if (
          item.entryUpdatedAtWhenQueued &&
          currentEntry.updatedAt > item.entryUpdatedAtWhenQueued
        ) {
          console.log(
            `[SyncManager] Entry ${item.entryId} was modified after queue (` +
              `queued at ${item.entryUpdatedAtWhenQueued}, now ${currentEntry.updatedAt}). ` +
              `Skipping stale update, will sync current state.`,
          );
          return;
        }

        let ydoc = this.client.getDocument(item.entryUuid);
        if (!ydoc) {
          // Document not connected - connect first
          ydoc = await this.client.connectDocument(item.entryUuid);
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
          try {
            ydoc = await this.client.connectDocument(item.entryUuid);
            await this.client.waitForSync(item.entryUuid);
          } catch (error) {
            // If we can't connect, the document might not exist on server yet
            console.log(
              `[SyncManager] Could not connect to delete ${item.entryUuid}:`,
              error,
            );
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
    this.updateStatus("error");
    // Shutdown to prevent further attempts
    if (this.client?.isSyncDisabled()) {
      console.error("[SyncManager] Auth failures exceeded, shutting down sync");
      this.shutdown();
    }
    this.callbacks.onError?.(new Error("Authentication failed"));
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
