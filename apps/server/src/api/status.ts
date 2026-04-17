import { Router } from "express";
import { DocumentRepository } from "../db/repositories/documents.js";
import { SessionRepository } from "../db/repositories/sessions.js";
import Database from "../db/sqlite.js";
import { getCurrentVersion } from "../utils/updater.js";

export interface StatusResponse {
  ok: boolean;
  version: string;
  uptime: number;
  documents: number;
  sessions: number;
  activeSessions: number;
}

export function createStatusRouter(db: Database.Database, startTime: number): Router {
  const router = Router();
  const documentRepo = new DocumentRepository(db);
  const sessionRepo = new SessionRepository(db);

  router.get("/", (_req, res) => {
    const response: StatusResponse = {
      ok: true,
      version: getCurrentVersion(),
      uptime: Date.now() - startTime,
      documents: documentRepo.count(),
      sessions: sessionRepo.count(),
      activeSessions: sessionRepo.countActive(),
    };

    res.json(response);
  });

  return router;
}
