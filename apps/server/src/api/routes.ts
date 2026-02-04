import Database from "better-sqlite3";
import { Router } from "express";
import { createChatRouter } from "./chat.js";
import { createDevicesRouter } from "./devices.js";
import { createStatusRouter } from "./status.js";

export function createApiRoutes(db: Database.Database, startTime: number): Router {
  const router = Router();

  router.use("/status", createStatusRouter(db, startTime));
  router.use("/devices", createDevicesRouter(db));
  router.use("/chat", createChatRouter());

  return router;
}
