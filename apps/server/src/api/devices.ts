import Database from "better-sqlite3";
import { Router } from "express";
import { SessionRepository } from "../db/repositories/sessions.js";

export interface DeviceResponse {
  id: string;
  displayName: string | null;
  deviceType: string;
  lastSeenAt: number;
  createdAt: number;
  isActive: boolean;
}

export function createDevicesRouter(db: Database.Database): Router {
  const router = Router();
  const sessionRepo = new SessionRepository(db);

  // List all sessions/devices
  router.get("/", (_req, res) => {
    const sessions = sessionRepo.getAll();
    const activeSessions = new Set(sessionRepo.getActive().map((s) => s.id));

    const response: DeviceResponse[] = sessions.map((session) => ({
      id: session.id,
      displayName: session.displayName,
      deviceType: session.deviceType,
      lastSeenAt: session.lastSeenAt,
      createdAt: session.createdAt,
      isActive: activeSessions.has(session.id),
    }));

    res.json(response);
  });

  // Get a specific session
  router.get("/:id", (req, res) => {
    const session = sessionRepo.getById(req.params.id);

    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const activeSessions = new Set(sessionRepo.getActive().map((s) => s.id));

    const response: DeviceResponse = {
      id: session.id,
      displayName: session.displayName,
      deviceType: session.deviceType,
      lastSeenAt: session.lastSeenAt,
      createdAt: session.createdAt,
      isActive: activeSessions.has(session.id),
    };

    res.json(response);
  });

  // Delete a session
  router.delete("/:id", (req, res) => {
    const session = sessionRepo.getById(req.params.id);

    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    sessionRepo.delete(req.params.id);
    res.json({ ok: true, deleted: req.params.id });
  });

  // Clean up inactive sessions
  router.post("/cleanup", (_req, res) => {
    const deleted = sessionRepo.deleteInactive();
    res.json({ ok: true, deleted });
  });

  return router;
}
