import Database from "better-sqlite3";
import * as Y from "yjs";
import { DocumentRepository } from "../db/repositories/documents.js";
import { SessionRepository } from "../db/repositories/sessions.js";
import { logger } from "../utils/logger.js";
import type { Configuration, onConnectPayload, onDisconnectPayload, onLoadDocumentPayload, onStoreDocumentPayload } from "@hocuspocus/server";

/**
 * Create Hocuspocus configuration for the given database
 */
export function createHocuspocusConfig(db: Database.Database): Partial<Configuration> {
  const documentRepo = new DocumentRepository(db);
  const sessionRepo = new SessionRepository(db);

  return {
    async onConnect(data: onConnectPayload) {
      const sessionId = data.connection.readOnly
        ? `readonly-${Date.now()}`
        : data.requestParameters.get("sessionId") || `anon-${Date.now()}`;
      const displayName = data.requestParameters.get("displayName") || null;

      // Create or update session
      sessionRepo.upsert(sessionId, {
        displayName: displayName || undefined,
        deviceType: "guest",
      });

      logger.info(`Client connected: ${sessionId} to document ${data.documentName}`);

      // Store session ID in connection context for later use
      data.connection.readOnly = false;

      return {
        sessionId,
      };
    },

    async onDisconnect(data: onDisconnectPayload) {
      const sessionId = data.requestParameters.get("sessionId");
      if (sessionId) {
        // Update last seen time
        sessionRepo.touch(sessionId);
        logger.info(`Client disconnected: ${sessionId} from document ${data.documentName}`);
      }
    },

    async onLoadDocument(data: onLoadDocumentPayload) {
      const doc = documentRepo.getById(data.documentName);

      if (doc?.yjsState) {
        // Load existing Yjs state
        logger.debug(`Loading existing document: ${data.documentName}`);
        Y.applyUpdate(data.document, doc.yjsState);
      } else {
        logger.debug(`Creating new document: ${data.documentName}`);
      }

      return data.document;
    },

    async onStoreDocument(data: onStoreDocumentPayload) {
      const state = Y.encodeStateAsUpdate(data.document);

      documentRepo.upsert(data.documentName, Buffer.from(state), {
        updatedBy: data.requestParameters.get("sessionId") || "unknown",
      });

      logger.debug(`Stored document: ${data.documentName} (${state.length} bytes)`);
    },
  };
}
