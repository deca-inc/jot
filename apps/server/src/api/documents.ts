/**
 * Documents API
 *
 * Provides endpoints for document sync management.
 * Supports both HTTP bulk sync and WebSocket real-time sync.
 */

import { Router, Request, Response } from "express";
import { AuthService } from "../auth/authService.js";
import { DocumentRepository } from "../db/repositories/documents.js";
import { UserRepository } from "../db/repositories/users.js";
import Database from "../db/sqlite.js";
import { createAuthMiddleware } from "./middleware/authMiddleware.js";

// UUID validation regex
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createDocumentsRouter(
  db: Database.Database,
  authService: AuthService,
): Router {
  const router = Router();
  const documentRepo = new DocumentRepository(db);
  const userRepo = new UserRepository(db);
  const authMiddleware = createAuthMiddleware(authService);

  /**
   * GET /api/documents/manifest
   *
   * Returns a lightweight manifest of all documents for the authenticated user.
   * Client uses this to compare with local entries and determine what needs syncing.
   */
  router.get("/manifest", authMiddleware, (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const userId = req.user.userId;
      const since = req.query.since ? Number(req.query.since) : undefined;
      const manifest = since
        ? documentRepo.getManifestForUserSince(userId, since)
        : documentRepo.getManifestForUser(userId);

      // Get UEK version for stale key detection
      const uekData = userRepo.getUEK(userId);
      const uekVersion = uekData?.version ?? 0;

      res.json({
        documents: manifest,
        uekVersion,
        generatedAt: Date.now(),
      });
    } catch (error) {
      console.error("Error fetching document manifest:", error);
      res.status(500).json({ error: "Failed to fetch document manifest" });
    }
  });

  /**
   * GET /api/documents/:uuid/state
   *
   * Download the Yjs state for a single document.
   * Returns the raw Yjs state as a base64 string.
   */
  router.get("/:uuid/state", authMiddleware, (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { uuid } = req.params;
      if (!UUID_REGEX.test(uuid)) {
        res.status(400).json({ error: "Invalid document ID format" });
        return;
      }

      const doc = documentRepo.getByIdForUser(uuid, req.user.userId);
      if (!doc) {
        res.status(404).json({ error: "Document not found" });
        return;
      }

      res.json({
        uuid: doc.id,
        state: doc.yjsState
          ? Buffer.from(doc.yjsState).toString("base64")
          : null,
        metadata: doc.metadata,
        updatedAt: doc.updatedAt,
      });
    } catch (error) {
      console.error("Error fetching document state:", error);
      res.status(500).json({ error: "Failed to fetch document state" });
    }
  });

  /**
   * PUT /api/documents/:uuid/state
   *
   * Upload/update the Yjs state for a single document.
   * Body: { state: string (base64), metadata?: object }
   */
  router.put("/:uuid/state", authMiddleware, (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { uuid } = req.params;
      if (!UUID_REGEX.test(uuid)) {
        res.status(400).json({ error: "Invalid document ID format" });
        return;
      }

      const { state, metadata } = req.body as {
        state: string;
        metadata?: Record<string, unknown>;
      };

      if (!state) {
        res.status(400).json({ error: "Missing state" });
        return;
      }

      // Check document ownership
      const existing = documentRepo.getById(uuid);
      if (
        existing &&
        existing.userId &&
        existing.userId !== req.user.userId
      ) {
        res.status(403).json({ error: "Access denied" });
        return;
      }

      const yjsState = Buffer.from(state, "base64");
      documentRepo.upsert(uuid, yjsState, metadata, req.user.userId);

      res.json({ ok: true, uuid });
    } catch (error) {
      console.error("Error storing document state:", error);
      res.status(500).json({ error: "Failed to store document state" });
    }
  });

  /**
   * POST /api/documents/bulk-push
   *
   * Upload multiple document states in a single request.
   * Body: { documents: [{ uuid: string, state: string (base64), metadata?: object }] }
   */
  router.post(
    "/bulk-push",
    authMiddleware,
    (req: Request, res: Response) => {
      try {
        if (!req.user) {
          res.status(401).json({ error: "Unauthorized" });
          return;
        }

        const { documents } = req.body as {
          documents: Array<{
            uuid: string;
            state: string;
            metadata?: Record<string, unknown>;
          }>;
        };

        if (!Array.isArray(documents)) {
          res.status(400).json({ error: "Missing documents array" });
          return;
        }

        const results: Array<{ uuid: string; ok: boolean; error?: string }> =
          [];

        for (const doc of documents) {
          try {
            if (!UUID_REGEX.test(doc.uuid)) {
              results.push({
                uuid: doc.uuid,
                ok: false,
                error: "Invalid UUID",
              });
              continue;
            }

            // Check ownership
            const existing = documentRepo.getById(doc.uuid);
            if (
              existing &&
              existing.userId &&
              existing.userId !== req.user!.userId
            ) {
              results.push({
                uuid: doc.uuid,
                ok: false,
                error: "Access denied",
              });
              continue;
            }

            const yjsState = Buffer.from(doc.state, "base64");
            documentRepo.upsert(
              doc.uuid,
              yjsState,
              doc.metadata,
              req.user!.userId,
            );
            results.push({ uuid: doc.uuid, ok: true });
          } catch (err) {
            results.push({
              uuid: doc.uuid,
              ok: false,
              error: String(err),
            });
          }
        }

        res.json({
          ok: true,
          results,
          pushed: results.filter((r) => r.ok).length,
          failed: results.filter((r) => !r.ok).length,
        });
      } catch (error) {
        console.error("Error in bulk push:", error);
        res.status(500).json({ error: "Failed to push documents" });
      }
    },
  );

  /**
   * POST /api/documents/bulk-pull
   *
   * Download multiple document states in a single request.
   * Body: { uuids: string[] }
   */
  router.post(
    "/bulk-pull",
    authMiddleware,
    (req: Request, res: Response) => {
      try {
        if (!req.user) {
          res.status(401).json({ error: "Unauthorized" });
          return;
        }

        const { uuids } = req.body as { uuids: string[] };

        if (!Array.isArray(uuids)) {
          res.status(400).json({ error: "Missing uuids array" });
          return;
        }

        const documents: Array<{
          uuid: string;
          state: string | null;
          metadata: Record<string, unknown> | null;
          updatedAt: number;
        }> = [];

        for (const uuid of uuids) {
          if (!UUID_REGEX.test(uuid)) continue;

          const doc = documentRepo.getByIdForUser(uuid, req.user.userId);
          if (doc) {
            documents.push({
              uuid: doc.id,
              state: doc.yjsState
                ? Buffer.from(doc.yjsState).toString("base64")
                : null,
              metadata: doc.metadata as Record<string, unknown> | null,
              updatedAt: doc.updatedAt,
            });
          }
        }

        res.json({ documents });
      } catch (error) {
        console.error("Error in bulk pull:", error);
        res.status(500).json({ error: "Failed to pull documents" });
      }
    },
  );

  return router;
}
