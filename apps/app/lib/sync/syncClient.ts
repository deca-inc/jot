/**
 * Sync Client
 *
 * Manages Hocuspocus WebSocket connections for Yjs document sync.
 * Each entry has its own Yjs document and Hocuspocus provider.
 */

import { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";
import type { Block } from "../db/entries";

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "syncing"
  | "synced";

export interface SyncClientCallbacks {
  onStatusChange?: (status: ConnectionStatus) => void;
  onDocumentSynced?: (docId: string) => void;
  onDocumentError?: (docId: string, error: Error) => void;
  onAuthError?: () => void;
}

interface DocumentConnection {
  provider: HocuspocusProvider;
  ydoc: Y.Doc;
  status: ConnectionStatus;
  syncPromise: Promise<void>;
  resolveSyncPromise: () => void;
}

/**
 * SyncClient manages WebSocket connections to the Hocuspocus server
 */
export class SyncClient {
  private documents: Map<string, DocumentConnection> = new Map();
  private serverUrl: string;
  private getToken: () => Promise<string | null>;
  private getSessionId: () => string;
  private getDisplayName: () => string;
  private callbacks: SyncClientCallbacks;
  private isShuttingDown = false;
  private authFailureCount = 0;
  private connectionFailureCount = 0;
  private readonly maxAuthFailures = 3;
  private readonly maxConnectionFailures = 5;

  constructor(
    serverUrl: string,
    getToken: () => Promise<string | null>,
    options?: {
      getSessionId?: () => string;
      getDisplayName?: () => string;
      callbacks?: SyncClientCallbacks;
    },
  ) {
    this.serverUrl = this.normalizeUrl(serverUrl);
    this.getToken = getToken;
    this.getSessionId =
      options?.getSessionId ?? (() => `session-${Date.now()}`);
    this.getDisplayName = options?.getDisplayName ?? (() => "Journal App");
    this.callbacks = options?.callbacks ?? {};
  }

  /**
   * Convert HTTP URL to WebSocket URL and add query parameters
   */
  private normalizeUrl(url: string): string {
    return url.replace(/^http/, "ws").replace(/\/$/, "");
  }

  /**
   * Build URL with query parameters for session identification and auth
   */
  private buildUrlWithParams(token: string): string {
    const sessionId = this.getSessionId();
    const displayName = this.getDisplayName();
    const params = new URLSearchParams({
      token,
      sessionId,
      displayName,
    });
    return `${this.serverUrl}?${params.toString()}`;
  }

  /**
   * Connect to a document and start syncing
   */
  async connectDocument(docId: string): Promise<Y.Doc> {
    // Check if we've had too many failures
    if (this.authFailureCount >= this.maxAuthFailures) {
      const error = new Error(
        "Too many authentication failures, sync disabled",
      );
      this.callbacks.onAuthError?.();
      throw error;
    }

    if (this.connectionFailureCount >= this.maxConnectionFailures) {
      const error = new Error("Too many connection failures, sync disabled");
      throw error;
    }

    // Return existing connection if available
    const existing = this.documents.get(docId);
    if (existing) {
      return existing.ydoc;
    }

    const token = await this.getToken();
    if (!token) {
      const error = new Error("Not authenticated");
      this.callbacks.onAuthError?.();
      throw error;
    }

    const ydoc = new Y.Doc();
    // Initialize the document structure
    ydoc.getMap<unknown>("metadata");
    ydoc.getArray<Block>("blocks");

    // Create a promise that resolves when sync is complete
    let resolveSyncPromise: () => void = () => {};
    const syncPromise = new Promise<void>((resolve) => {
      resolveSyncPromise = resolve;
    });

    // Include token in URL query parameters for server authentication
    const urlWithParams = this.buildUrlWithParams(token);

    const provider = new HocuspocusProvider({
      url: urlWithParams,
      name: docId,
      document: ydoc,
      // Token is passed in URL query params, not as a separate option
      onConnect: () => {
        // Reset failure counts on successful connection
        this.authFailureCount = 0;
        this.connectionFailureCount = 0;
        this.updateDocumentStatus(docId, "connected");
      },
      onSynced: () => {
        this.updateDocumentStatus(docId, "synced");
        resolveSyncPromise();
        this.callbacks.onDocumentSynced?.(docId);
      },
      onDisconnect: () => {
        if (!this.isShuttingDown) {
          this.connectionFailureCount++;
          console.warn(
            `[SyncClient] Connection failed ${this.connectionFailureCount}/${this.maxConnectionFailures} for ${docId}`,
          );

          if (this.connectionFailureCount >= this.maxConnectionFailures) {
            console.error(
              "[SyncClient] Too many connection failures, stopping sync",
            );
            this.disconnectAll();
          }

          this.updateDocumentStatus(docId, "disconnected");
        }
      },
      onAuthenticationFailed: () => {
        this.authFailureCount++;
        console.warn(
          `[SyncClient] Auth failure ${this.authFailureCount}/${this.maxAuthFailures}`,
        );

        // Stop the provider from reconnecting
        const connection = this.documents.get(docId);
        if (connection) {
          connection.provider.destroy();
          this.documents.delete(docId);
        }

        if (this.authFailureCount >= this.maxAuthFailures) {
          console.error("[SyncClient] Too many auth failures, stopping sync");
          this.disconnectAll();
        }

        this.callbacks.onAuthError?.();
        this.callbacks.onDocumentError?.(
          docId,
          new Error("Authentication failed"),
        );
      },
      onStatus: ({ status }) => {
        if (status === "connecting") {
          this.updateDocumentStatus(docId, "connecting");
        }
      },
    });

    const connection: DocumentConnection = {
      provider,
      ydoc,
      status: "connecting",
      syncPromise,
      resolveSyncPromise,
    };

    this.documents.set(docId, connection);
    return ydoc;
  }

  /**
   * Wait for a document to finish syncing
   * Returns immediately if already synced or not connected
   */
  async waitForSync(
    docId: string,
    timeoutMs: number = 10000,
  ): Promise<boolean> {
    const connection = this.documents.get(docId);
    if (!connection) {
      return false;
    }

    if (connection.status === "synced") {
      return true;
    }

    // Wait for sync with timeout
    try {
      await Promise.race([
        connection.syncPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Sync timeout")), timeoutMs),
        ),
      ]);
      return true;
    } catch {
      console.warn(`[SyncClient] Sync timeout for document ${docId}`);
      return false;
    }
  }

  /**
   * Get a connected document (does not create new connection)
   */
  getDocument(docId: string): Y.Doc | null {
    return this.documents.get(docId)?.ydoc ?? null;
  }

  /**
   * Get connection status for a document
   */
  getDocumentStatus(docId: string): ConnectionStatus {
    return this.documents.get(docId)?.status ?? "disconnected";
  }

  /**
   * Disconnect from a specific document
   */
  disconnectDocument(docId: string): void {
    const connection = this.documents.get(docId);
    if (connection) {
      connection.provider.destroy();
      this.documents.delete(docId);
    }
  }

  /**
   * Disconnect from all documents
   */
  disconnectAll(): void {
    this.isShuttingDown = true;
    for (const [docId, connection] of this.documents) {
      connection.provider.destroy();
      this.documents.delete(docId);
    }
    this.isShuttingDown = false;
  }

  /**
   * Get list of connected document IDs
   */
  getConnectedDocIds(): string[] {
    return Array.from(this.documents.keys());
  }

  /**
   * Check if connected to a specific document
   */
  isConnected(docId: string): boolean {
    const status = this.getDocumentStatus(docId);
    return status === "connected" || status === "synced";
  }

  /**
   * Check if any documents are connected
   */
  hasConnections(): boolean {
    return this.documents.size > 0;
  }

  /**
   * Get overall sync status
   */
  getOverallStatus(): ConnectionStatus {
    if (this.documents.size === 0) {
      return "disconnected";
    }

    const statuses = Array.from(this.documents.values()).map((c) => c.status);

    // If any are connecting, we're connecting
    if (statuses.some((s) => s === "connecting")) {
      return "connecting";
    }

    // If any are syncing, we're syncing
    if (statuses.some((s) => s === "syncing")) {
      return "syncing";
    }

    // If all are synced, we're synced
    if (statuses.every((s) => s === "synced")) {
      return "synced";
    }

    // If all are disconnected, we're disconnected
    if (statuses.every((s) => s === "disconnected")) {
      return "disconnected";
    }

    // Default to connected
    return "connected";
  }

  /**
   * Update the server URL (requires reconnecting all documents)
   */
  updateServerUrl(serverUrl: string): void {
    this.serverUrl = this.normalizeUrl(serverUrl);
    // Note: Existing connections will use the old URL until reconnected
  }

  /**
   * Reset failure counts (call after successful login/token refresh)
   */
  resetAuthFailures(): void {
    this.authFailureCount = 0;
    this.connectionFailureCount = 0;
  }

  /**
   * Check if sync is disabled due to failures
   */
  isSyncDisabled(): boolean {
    return (
      this.authFailureCount >= this.maxAuthFailures ||
      this.connectionFailureCount >= this.maxConnectionFailures
    );
  }

  /**
   * Force reconnect all documents
   */
  async reconnectAll(): Promise<void> {
    const docIds = this.getConnectedDocIds();
    this.disconnectAll();

    // Small delay to ensure cleanup
    await new Promise((resolve) => setTimeout(resolve, 100));

    for (const docId of docIds) {
      await this.connectDocument(docId);
    }
  }

  /**
   * Update document status and notify
   */
  private updateDocumentStatus(docId: string, status: ConnectionStatus): void {
    const connection = this.documents.get(docId);
    if (connection) {
      connection.status = status;
      this.callbacks.onStatusChange?.(this.getOverallStatus());
    }
  }
}

/**
 * Create a new SyncClient instance
 */
export function createSyncClient(
  serverUrl: string,
  getToken: () => Promise<string | null>,
  options?: {
    getSessionId?: () => string;
    getDisplayName?: () => string;
    callbacks?: SyncClientCallbacks;
  },
): SyncClient {
  return new SyncClient(serverUrl, getToken, options);
}
