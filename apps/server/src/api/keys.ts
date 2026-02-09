/**
 * Keys API
 *
 * Endpoints for E2EE key management and sharing.
 */

import Database from "better-sqlite3";
import { Router, Request, Response } from "express";
import { AuthService } from "../auth/authService.js";
import { KeysRepository } from "../db/repositories/keys.js";
import { createAuthMiddleware } from "./middleware/authMiddleware.js";

export function createKeysRouter(
  db: Database.Database,
  authService: AuthService,
): Router {
  const router = Router();
  const keysRepo = new KeysRepository(db);
  const authMiddleware = createAuthMiddleware(authService);

  /**
   * POST /api/keys
   * Upload or update a device's public key
   */
  router.post("/", authMiddleware, (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { publicKey, keyType, deviceId } = req.body as {
        publicKey?: string;
        keyType?: string;
        deviceId?: string;
      };

      if (!publicKey) {
        res.status(400).json({ error: "publicKey is required" });
        return;
      }

      if (!deviceId) {
        res.status(400).json({ error: "deviceId is required for multi-device E2EE" });
        return;
      }

      const userKey = keysRepo.upsertUserKey(
        req.user.userId,
        deviceId,
        publicKey,
        keyType ?? "RSA-OAEP",
      );

      res.status(201).json({
        userId: userKey.userId,
        deviceId: userKey.deviceId,
        keyType: userKey.keyType,
        createdAt: userKey.createdAt,
      });
    } catch (error) {
      console.error("Error uploading public key:", error);
      res.status(500).json({ error: "Failed to upload public key" });
    }
  });

  /**
   * GET /api/keys/:userId
   * Get all device keys for a user (for multi-device E2EE)
   */
  router.get("/:userId", authMiddleware, (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { userId } = req.params;
      const userKeys = keysRepo.getUserKeys(userId);

      if (userKeys.length === 0) {
        res.status(404).json({ error: "User keys not found" });
        return;
      }

      // Return all device keys for multi-device E2EE
      res.json({
        userId,
        keys: userKeys.map((k) => ({
          deviceId: k.deviceId,
          publicKey: k.publicKey,
          keyType: k.keyType,
        })),
        // Also include legacy single-key format for backwards compatibility
        publicKey: userKeys[0].publicKey,
        keyType: userKeys[0].keyType,
      });
    } catch (error) {
      console.error("Error fetching public keys:", error);
      res.status(500).json({ error: "Failed to fetch public keys" });
    }
  });

  /**
   * GET /api/keys/me
   * Get current user's device keys
   * Note: This route is caught by /:userId with userId="me" due to route ordering
   */
  router.get("/me", authMiddleware, (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const userKeys = keysRepo.getUserKeys(req.user.userId);

      if (userKeys.length === 0) {
        res.status(404).json({ error: "No public keys registered" });
        return;
      }

      res.json({
        userId: req.user.userId,
        keys: userKeys.map((k) => ({
          deviceId: k.deviceId,
          publicKey: k.publicKey,
          keyType: k.keyType,
        })),
      });
    } catch (error) {
      console.error("Error fetching public keys:", error);
      res.status(500).json({ error: "Failed to fetch public keys" });
    }
  });

  /**
   * DELETE /api/keys
   * Delete a device key (or all device keys if no deviceId provided)
   */
  router.delete("/", authMiddleware, (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { deviceId } = req.body as { deviceId?: string };

      if (deviceId) {
        keysRepo.deleteDeviceKey(req.user.userId, deviceId);
      } else {
        keysRepo.deleteUserKeys(req.user.userId);
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting public key:", error);
      res.status(500).json({ error: "Failed to delete public key" });
    }
  });

  // ===== Document Sharing =====

  /**
   * POST /api/keys/grants
   * Grant access to a document (share with a user)
   *
   * Body: { documentId, userId, wrappedDek, ephemeralPublicKey }
   */
  router.post("/grants", authMiddleware, (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { documentId, userId, wrappedDek, ephemeralPublicKey } = req.body as {
        documentId?: string;
        userId?: string;
        wrappedDek?: string;
        ephemeralPublicKey?: string;
      };

      if (!documentId || !userId || !wrappedDek || !ephemeralPublicKey) {
        res.status(400).json({
          error: "documentId, userId, wrappedDek, and ephemeralPublicKey are required",
        });
        return;
      }

      // Verify the granting user has access to the document
      const existingGrant = keysRepo.getGrant(documentId, req.user.userId);
      if (!existingGrant) {
        res.status(403).json({ error: "You do not have access to this document" });
        return;
      }

      const grant = keysRepo.upsertGrant(
        documentId,
        userId,
        wrappedDek,
        ephemeralPublicKey,
        req.user.userId,
      );

      res.status(201).json({
        documentId: grant.documentId,
        userId: grant.userId,
        grantedBy: grant.grantedBy,
        grantedAt: grant.grantedAt,
      });
    } catch (error) {
      console.error("Error granting access:", error);
      res.status(500).json({ error: "Failed to grant access" });
    }
  });

  /**
   * POST /api/keys/grants/bulk
   * Bulk create grants (for initial sync)
   *
   * Body: { grants: [{ documentId, userId, wrappedDek, ephemeralPublicKey }] }
   */
  router.post("/grants/bulk", authMiddleware, (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { grants } = req.body as {
        grants?: Array<{
          documentId: string;
          userId: string;
          wrappedDek: string;
          ephemeralPublicKey: string;
        }>;
      };

      if (!grants || !Array.isArray(grants)) {
        res.status(400).json({ error: "grants array is required" });
        return;
      }

      const grantsWithGrantor = grants.map((g) => ({
        ...g,
        grantedBy: req.user!.userId,
      }));

      keysRepo.bulkUpsertGrants(grantsWithGrantor);

      res.status(201).json({ created: grants.length });
    } catch (error) {
      console.error("Error bulk creating grants:", error);
      res.status(500).json({ error: "Failed to create grants" });
    }
  });

  /**
   * GET /api/keys/grants/:documentId
   * Get all grants for a document
   */
  router.get("/grants/:documentId", authMiddleware, (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { documentId } = req.params;

      // Verify the user has access to the document
      const userGrant = keysRepo.getGrant(documentId, req.user.userId);
      if (!userGrant) {
        res.status(403).json({ error: "You do not have access to this document" });
        return;
      }

      const grants = keysRepo.getGrantsForDocument(documentId);

      res.json({
        grants: grants.map((g) => ({
          userId: g.userId,
          grantedBy: g.grantedBy,
          grantedAt: g.grantedAt,
        })),
      });
    } catch (error) {
      console.error("Error fetching grants:", error);
      res.status(500).json({ error: "Failed to fetch grants" });
    }
  });

  /**
   * GET /api/keys/grants/document/:documentId/user/:userId
   * Get a specific grant (for decryption)
   */
  router.get(
    "/grants/document/:documentId/user/:userId",
    authMiddleware,
    (req: Request, res: Response) => {
      try {
        if (!req.user) {
          res.status(401).json({ error: "Unauthorized" });
          return;
        }

        const { documentId, userId } = req.params;

        // Only allow fetching own grant or if user has access
        if (userId !== req.user.userId) {
          const userGrant = keysRepo.getGrant(documentId, req.user.userId);
          if (!userGrant) {
            res.status(403).json({ error: "You do not have access to this document" });
            return;
          }
        }

        const grant = keysRepo.getGrant(documentId, userId);
        if (!grant) {
          res.status(404).json({ error: "Grant not found" });
          return;
        }

        res.json({
          documentId: grant.documentId,
          userId: grant.userId,
          wrappedDek: grant.wrappedDek,
          ephemeralPublicKey: grant.ephemeralPublicKey,
          grantedBy: grant.grantedBy,
          grantedAt: grant.grantedAt,
        });
      } catch (error) {
        console.error("Error fetching grant:", error);
        res.status(500).json({ error: "Failed to fetch grant" });
      }
    },
  );

  /**
   * DELETE /api/keys/grants/:documentId/:userId
   * Revoke access (remove grant)
   */
  router.delete("/grants/:documentId/:userId", authMiddleware, (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { documentId, userId } = req.params;

      // Verify the user has access to revoke
      const userGrant = keysRepo.getGrant(documentId, req.user.userId);
      if (!userGrant) {
        res.status(403).json({ error: "You do not have access to this document" });
        return;
      }

      // Can't revoke own access through this endpoint
      if (userId === req.user.userId) {
        res.status(400).json({ error: "Cannot revoke your own access" });
        return;
      }

      keysRepo.deleteGrant(documentId, userId);

      res.json({ success: true });
    } catch (error) {
      console.error("Error revoking access:", error);
      res.status(500).json({ error: "Failed to revoke access" });
    }
  });

  return router;
}
