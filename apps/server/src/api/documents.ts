/**
 * Documents API
 *
 * Provides endpoints for document sync management.
 */

import Database from "better-sqlite3";
import { Router, Request, Response } from "express";
import { AuthService } from "../auth/authService.js";
import { DocumentRepository } from "../db/repositories/documents.js";
import { createAuthMiddleware } from "./middleware/authMiddleware.js";

export function createDocumentsRouter(
  db: Database.Database,
  authService: AuthService,
): Router {
  const router = Router();
  const documentRepo = new DocumentRepository(db);
  const authMiddleware = createAuthMiddleware(authService);

  /**
   * GET /api/documents/manifest
   *
   * Returns a lightweight manifest of all documents for the authenticated user.
   * Client uses this to compare with local entries and determine what needs syncing.
   *
   * Response: { documents: [{ uuid: string, updatedAt: number }] }
   */
  router.get("/manifest", authMiddleware, (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const userId = req.user.userId;
      const manifest = documentRepo.getManifestForUser(userId);

      res.json({
        documents: manifest,
        generatedAt: Date.now(),
      });
    } catch (error) {
      console.error("Error fetching document manifest:", error);
      res.status(500).json({ error: "Failed to fetch document manifest" });
    }
  });

  return router;
}
