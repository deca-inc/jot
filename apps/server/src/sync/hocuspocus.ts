import Database from "better-sqlite3";
import * as Y from "yjs";
import { AuthService, AuthError } from "../auth/authService.js";
import { AuditLogRepository } from "../db/repositories/auditLog.js";
import { DocumentRepository } from "../db/repositories/documents.js";
import { SessionRepository } from "../db/repositories/sessions.js";
import { logger } from "../utils/logger.js";
import type {
  Configuration,
  onAuthenticatePayload,
  onChangePayload,
  onConnectPayload,
  onDisconnectPayload,
  onLoadDocumentPayload,
  onStoreDocumentPayload,
} from "@hocuspocus/server";

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate document ID format (must be UUID)
 */
function isValidDocumentId(id: string): boolean {
  return UUID_REGEX.test(id);
}

// Connection rate limiting
interface RateLimitEntry {
  count: number;
  resetAt: number;
}
const connectionAttempts = new Map<string, RateLimitEntry>();
const CONNECTION_RATE_LIMIT = 30; // Max connections per minute per user
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute

/**
 * Check and update connection rate limit for a user
 * Returns true if rate limit exceeded
 */
function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = connectionAttempts.get(userId);

  if (!entry || now > entry.resetAt) {
    // New window
    connectionAttempts.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count++;
  if (entry.count > CONNECTION_RATE_LIMIT) {
    return true;
  }

  return false;
}

/**
 * Helper to extract auth info from request parameters
 */
function getAuthInfo(
  requestParameters: URLSearchParams,
  authService: AuthService,
): { userId: string; sessionId: string } | null {
  const token = requestParameters.get("token");
  if (!token) return null;

  try {
    const payload = authService.verifyAccessToken(token);
    const sessionId = requestParameters.get("sessionId") || `session-${Date.now()}`;
    return { userId: payload.userId, sessionId };
  } catch {
    return null;
  }
}

/**
 * Create Hocuspocus configuration for the given database
 */
export function createHocuspocusConfig(
  db: Database.Database,
  authService: AuthService,
  auditLog?: AuditLogRepository,
): Partial<Configuration> {
  const documentRepo = new DocumentRepository(db);
  const sessionRepo = new SessionRepository(db);

  // Create audit log if not provided
  const audit = auditLog ?? new AuditLogRepository(db);

  return {
    /**
     * onAuthenticate validates the token and rejects unauthenticated connections
     */
    async onAuthenticate(data: onAuthenticatePayload): Promise<void> {
      const token = data.requestParameters.get("token");

      if (!token) {
        logger.warn("Connection rejected: No authentication token provided");
        throw new Error("Authentication required");
      }

      try {
        const payload = authService.verifyAccessToken(token);

        // Check connection rate limit
        if (checkRateLimit(payload.userId)) {
          logger.warn(`Connection rate limit exceeded for user: ${payload.userId}`);
          audit.log(payload.userId, "rate_limit_exceeded", "websocket");
          throw new Error("Connection rate limit exceeded");
        }

        logger.debug(`Authenticated connection for user: ${payload.email}`);
      } catch (error) {
        if (error instanceof AuthError) {
          logger.warn(`Authentication failed: ${error.message}`);
          throw new Error("Authentication failed: " + error.message);
        }
        throw error;
      }
    },

    async onConnect(data: onConnectPayload): Promise<void> {
      const authInfo = getAuthInfo(data.requestParameters, authService);
      if (!authInfo) {
        // Should not happen since onAuthenticate runs first
        logger.warn("No auth info in onConnect");
        return;
      }

      const { userId, sessionId } = authInfo;
      const displayName = data.requestParameters.get("displayName") || null;

      // Create or update session (non-fatal if it fails)
      try {
        sessionRepo.upsert(sessionId, {
          displayName: displayName || undefined,
          deviceType: "authenticated",
        });
      } catch (error) {
        logger.warn(`Failed to upsert session ${sessionId}: ${error}`);
      }

      // Log connection details for debugging real-time sync
      const connectionCount = data.instance.getConnectionsCount();
      logger.info(
        `Client connected: session=${sessionId} user=${userId} doc=${data.documentName} ` +
        `totalConnections=${connectionCount}`,
      );

      data.connection.readOnly = false;
    },

    async onDisconnect(data: onDisconnectPayload) {
      const sessionId = data.requestParameters.get("sessionId");
      if (sessionId) {
        // Update last seen time
        sessionRepo.touch(sessionId);
        logger.info(`Client disconnected: ${sessionId} from document ${data.documentName}`);
      }
    },

    /**
     * onChange is called whenever a document changes
     * This is where Hocuspocus broadcasts updates to all connected clients
     */
    async onChange(data: onChangePayload) {
      const docConnections = data.instance.documents.get(data.documentName)?.getConnectionsCount() ?? 0;
      logger.debug(
        `Document changed: ${data.documentName} ` +
        `connectedClients=${docConnections} updateSize=${data.update?.length ?? 0}`,
      );
    },

    async onLoadDocument(data: onLoadDocumentPayload) {
      // Validate document ID format (must be UUID)
      if (!isValidDocumentId(data.documentName)) {
        logger.warn(`Load rejected: Invalid document ID format: ${data.documentName}`);
        throw new Error("Invalid document ID format");
      }

      const authInfo = getAuthInfo(data.requestParameters, authService);
      if (!authInfo) {
        logger.warn(`Load rejected: No auth info for document ${data.documentName}`);
        throw new Error("Authentication required");
      }

      const { userId, sessionId } = authInfo;

      // Check how many connections already exist for this document
      const docConnections = data.instance.documents.get(data.documentName)?.getConnectionsCount() ?? 0;

      // Try to load existing document for this user
      const doc = documentRepo.getByIdForUser(data.documentName, userId);

      if (doc?.yjsState) {
        // Load existing Yjs state
        logger.info(
          `Loading document: ${data.documentName} session=${sessionId} ` +
          `existingConnections=${docConnections} stateSize=${doc.yjsState.length}`,
        );
        Y.applyUpdate(data.document, doc.yjsState);

        // Audit log
        audit.log(userId, "document_load", "document", data.documentName, undefined, {
          sessionId,
          stateSize: doc.yjsState.length,
        });
      } else {
        // Check if document exists but belongs to another user
        const existingDoc = documentRepo.getById(data.documentName);
        if (existingDoc && existingDoc.userId && existingDoc.userId !== userId) {
          logger.warn(`Access denied: Document ${data.documentName} belongs to another user`);
          throw new Error("Access denied");
        }
        logger.info(
          `Creating new document: ${data.documentName} session=${sessionId} ` +
          `existingConnections=${docConnections}`,
        );

        // Audit log (new document)
        audit.log(userId, "document_load", "document", data.documentName, undefined, {
          sessionId,
          isNew: true,
        });
      }

      return data.document;
    },

    async onStoreDocument(data: onStoreDocumentPayload) {
      // Validate document ID format (must be UUID)
      if (!isValidDocumentId(data.documentName)) {
        logger.warn(`Store rejected: Invalid document ID format: ${data.documentName}`);
        throw new Error("Invalid document ID format");
      }

      const authInfo = getAuthInfo(data.requestParameters, authService);
      if (!authInfo) {
        logger.warn(`Store rejected: No auth info for document ${data.documentName}`);
        throw new Error("Authentication required");
      }

      const { userId, sessionId } = authInfo;

      // Check document ownership before storing
      const existingDoc = documentRepo.getById(data.documentName);
      if (existingDoc && existingDoc.userId && existingDoc.userId !== userId) {
        logger.warn(`Store rejected: Document ${data.documentName} belongs to another user`);
        throw new Error("Access denied");
      }

      const state = Y.encodeStateAsUpdate(data.document);

      // Log how many connections will receive this update
      const docConnections = data.instance.documents.get(data.documentName)?.getConnectionsCount() ?? 0;
      logger.info(
        `Storing document: ${data.documentName} session=${sessionId} ` +
        `size=${state.length} connectedClients=${docConnections}`,
      );

      documentRepo.upsert(
        data.documentName,
        Buffer.from(state),
        {
          updatedBy: sessionId,
        },
        userId,
      );

      // Audit log
      audit.log(userId, "document_store", "document", data.documentName, undefined, {
        sessionId,
        stateSize: state.length,
      });
    },
  };
}
