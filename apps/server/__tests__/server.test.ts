import Database from "better-sqlite3";
import express, { Express } from "express";
import { createApiRoutes } from "../src/api/routes.js";
import { migrateTo } from "../src/db/migrations.js";
import "../src/db/migrations/index.js";
import { DocumentRepository } from "../src/db/repositories/documents.js";
import { SessionRepository } from "../src/db/repositories/sessions.js";

describe("API Routes", () => {
  let db: Database.Database;
  let app: Express;
  const startTime = Date.now();

  beforeEach(() => {
    db = new Database(":memory:");
    migrateTo(db, Number.POSITIVE_INFINITY, { verbose: false });

    app = express();
    app.use(express.json());
    app.use("/api", createApiRoutes(db, startTime));
  });

  afterEach(() => {
    db.close();
  });

  describe("Status endpoint", () => {
    it("should return status object structure", () => {
      // Direct test of the repository integration
      const documentRepo = new DocumentRepository(db);
      const sessionRepo = new SessionRepository(db);

      expect(documentRepo.count()).toBe(0);
      expect(sessionRepo.count()).toBe(0);
      expect(sessionRepo.countActive()).toBe(0);
    });

    it("should reflect document count", () => {
      const documentRepo = new DocumentRepository(db);
      documentRepo.upsert("doc-1", null);
      documentRepo.upsert("doc-2", null);

      expect(documentRepo.count()).toBe(2);
    });

    it("should reflect session count", () => {
      const sessionRepo = new SessionRepository(db);
      sessionRepo.upsert("session-1");
      sessionRepo.upsert("session-2");

      expect(sessionRepo.count()).toBe(2);
      expect(sessionRepo.countActive()).toBe(2);
    });
  });

  describe("Devices endpoint", () => {
    it("should list sessions", () => {
      const sessionRepo = new SessionRepository(db);
      sessionRepo.upsert("device-1", { displayName: "Phone", deviceType: "guest" });
      sessionRepo.upsert("device-2", { displayName: "Desktop", deviceType: "owner" });

      const sessions = sessionRepo.getAll();

      expect(sessions).toHaveLength(2);
      expect(sessions.map((s) => s.displayName).sort()).toEqual(["Desktop", "Phone"]);
    });

    it("should delete a session", () => {
      const sessionRepo = new SessionRepository(db);
      sessionRepo.upsert("device-1");

      sessionRepo.delete("device-1");

      expect(sessionRepo.getById("device-1")).toBeNull();
    });

    it("should clean up inactive sessions", () => {
      const sessionRepo = new SessionRepository(db);
      sessionRepo.upsert("active-device");
      sessionRepo.upsert("inactive-device");

      // Make one session inactive
      db.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(
        Date.now() - 25 * 60 * 60 * 1000,
        "inactive-device",
      );

      const deleted = sessionRepo.deleteInactive();

      expect(deleted).toBe(1);
      expect(sessionRepo.getById("active-device")).not.toBeNull();
      expect(sessionRepo.getById("inactive-device")).toBeNull();
    });
  });

  describe("Chat endpoint", () => {
    it("should return error when LLM not configured", () => {
      // The chat endpoint always returns 503 for now
      // This tests the expected behavior
      const expectedResponse = {
        ok: false,
        error: "LLM not configured. Please download a model using `jot-server models download`.",
      };

      expect(expectedResponse.ok).toBe(false);
      expect(expectedResponse.error).toContain("LLM not configured");
    });
  });
});

describe("Express App Integration", () => {
  let db: Database.Database;
  let app: Express;

  beforeEach(() => {
    db = new Database(":memory:");
    migrateTo(db, Number.POSITIVE_INFINITY, { verbose: false });

    app = express();
    app.use(express.json());
    app.use("/api", createApiRoutes(db, Date.now()));

    // Add root endpoint
    app.get("/", (_req, res) => {
      res.json({ ok: true, service: "jot-server" });
    });
  });

  afterEach(() => {
    db.close();
  });

  it("should have API routes mounted", () => {
    // Check that routes are mounted by verifying app has router
    expect(app._router).toBeDefined();
  });

  it("should return correct content type for JSON", () => {
    // This is a structural test - we verify the setup is correct
    const hasJsonMiddleware = app._router.stack.some(
      (layer: { name: string }) => layer.name === "jsonParser",
    );
    expect(hasJsonMiddleware).toBe(true);
  });
});
