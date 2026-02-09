import Database from "better-sqlite3";
import { Router } from "express";
import { AuthService } from "../auth/authService.js";
import { createAssetsRouter } from "./assets.js";
import { createAuthRouter } from "./auth.js";
import { createChatRouter } from "./chat.js";
import { createDevicesRouter } from "./devices.js";
import { createDocumentsRouter } from "./documents.js";
import { createKeysRouter } from "./keys.js";
import { createStatusRouter } from "./status.js";

export interface ApiRoutesConfig {
  db: Database.Database;
  startTime: number;
  authService: AuthService;
}

export function createApiRoutes(config: ApiRoutesConfig): Router {
  const { db, startTime, authService } = config;
  const router = Router();

  router.use("/status", createStatusRouter(db, startTime));
  router.use("/devices", createDevicesRouter(db));
  router.use("/chat", createChatRouter());
  router.use("/auth", createAuthRouter(authService));
  router.use("/assets", createAssetsRouter(db, authService));
  router.use("/documents", createDocumentsRouter(db, authService));
  router.use("/keys", createKeysRouter(db, authService));

  return router;
}
