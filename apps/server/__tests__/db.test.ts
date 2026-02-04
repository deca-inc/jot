import Database from "better-sqlite3";
import { migrateTo } from "../src/db/migrations.js";
import "../src/db/migrations/index.js";
import { DocumentRepository } from "../src/db/repositories/documents.js";
import { SessionRepository } from "../src/db/repositories/sessions.js";
import { SettingsRepository } from "../src/db/repositories/settings.js";

describe("Database", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    migrateTo(db, Number.POSITIVE_INFINITY, { verbose: false });
  });

  afterEach(() => {
    db.close();
  });

  describe("Migrations", () => {
    it("should create required tables", () => {
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
        )
        .all() as { name: string }[];

      const tableNames = tables.map((t) => t.name);

      expect(tableNames).toContain("documents");
      expect(tableNames).toContain("sessions");
      expect(tableNames).toContain("settings");
      expect(tableNames).toContain("migrations");
    });
  });

  describe("DocumentRepository", () => {
    let repo: DocumentRepository;

    beforeEach(() => {
      repo = new DocumentRepository(db);
    });

    it("should create a document", () => {
      const doc = repo.upsert("doc-1", Buffer.from("test"), { title: "Test Doc" });

      expect(doc.id).toBe("doc-1");
      expect(doc.metadata?.title).toBe("Test Doc");
      expect(doc.yjsState?.toString()).toBe("test");
    });

    it("should update an existing document", () => {
      repo.upsert("doc-1", Buffer.from("v1"), { title: "V1" });
      const updated = repo.upsert("doc-1", Buffer.from("v2"), { title: "V2" });

      expect(updated.yjsState?.toString()).toBe("v2");
      expect(updated.metadata?.title).toBe("V2");
    });

    it("should get a document by id", () => {
      repo.upsert("doc-1", Buffer.from("test"), { title: "Test" });

      const doc = repo.getById("doc-1");

      expect(doc).not.toBeNull();
      expect(doc?.id).toBe("doc-1");
    });

    it("should return null for non-existent document", () => {
      const doc = repo.getById("non-existent");

      expect(doc).toBeNull();
    });

    it("should get all documents", () => {
      repo.upsert("doc-1", null, { title: "Doc 1" });
      repo.upsert("doc-2", null, { title: "Doc 2" });

      const docs = repo.getAll();

      expect(docs).toHaveLength(2);
    });

    it("should delete a document", () => {
      repo.upsert("doc-1", null, { title: "Test" });
      repo.delete("doc-1");

      const doc = repo.getById("doc-1");

      expect(doc).toBeNull();
    });

    it("should count documents", () => {
      repo.upsert("doc-1", null);
      repo.upsert("doc-2", null);

      expect(repo.count()).toBe(2);
    });

    it("should update metadata only", () => {
      repo.upsert("doc-1", Buffer.from("state"), { title: "Original" });
      repo.updateMetadata("doc-1", { title: "Updated" });

      const doc = repo.getById("doc-1");

      expect(doc?.metadata?.title).toBe("Updated");
      expect(doc?.yjsState?.toString()).toBe("state");
    });
  });

  describe("SessionRepository", () => {
    let repo: SessionRepository;

    beforeEach(() => {
      repo = new SessionRepository(db);
    });

    it("should create a session", () => {
      const session = repo.upsert("session-1", {
        displayName: "Test User",
        deviceType: "owner",
      });

      expect(session.id).toBe("session-1");
      expect(session.displayName).toBe("Test User");
      expect(session.deviceType).toBe("owner");
    });

    it("should update last seen on upsert", () => {
      const session1 = repo.upsert("session-1");
      const firstSeen = session1.lastSeenAt;

      // Small delay to ensure different timestamp
      const session2 = repo.upsert("session-1");

      expect(session2.lastSeenAt).toBeGreaterThanOrEqual(firstSeen);
    });

    it("should get active sessions", () => {
      repo.upsert("session-1");
      repo.upsert("session-2");

      // Make session-1 inactive by setting last_seen_at to long ago
      db.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(
        Date.now() - 10 * 60 * 1000, // 10 minutes ago
        "session-1",
      );

      const active = repo.getActive(5 * 60 * 1000); // 5 minute threshold

      expect(active).toHaveLength(1);
      expect(active[0].id).toBe("session-2");
    });

    it("should touch a session", () => {
      const session = repo.upsert("session-1");
      const originalLastSeen = session.lastSeenAt;

      // Set to old time
      db.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(
        Date.now() - 60000,
        "session-1",
      );

      const touched = repo.touch("session-1");

      expect(touched?.lastSeenAt).toBeGreaterThan(originalLastSeen - 60000);
    });

    it("should delete a session", () => {
      repo.upsert("session-1");
      repo.delete("session-1");

      expect(repo.getById("session-1")).toBeNull();
    });

    it("should delete inactive sessions", () => {
      repo.upsert("session-1");
      repo.upsert("session-2");

      // Make session-1 inactive
      db.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(
        Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
        "session-1",
      );

      const deleted = repo.deleteInactive(24 * 60 * 60 * 1000); // 24 hour threshold

      expect(deleted).toBe(1);
      expect(repo.getById("session-1")).toBeNull();
      expect(repo.getById("session-2")).not.toBeNull();
    });

    it("should count sessions", () => {
      repo.upsert("session-1");
      repo.upsert("session-2");

      expect(repo.count()).toBe(2);
    });
  });

  describe("SettingsRepository", () => {
    let repo: SettingsRepository;

    beforeEach(() => {
      repo = new SettingsRepository(db);
    });

    it("should set and get a setting", () => {
      repo.set("theme", { mode: "dark" });

      const value = repo.get<{ mode: string }>("theme");

      expect(value).toEqual({ mode: "dark" });
    });

    it("should return null for non-existent setting", () => {
      const value = repo.get("non-existent");

      expect(value).toBeNull();
    });

    it("should overwrite existing setting", () => {
      repo.set("count", 1);
      repo.set("count", 2);

      expect(repo.get("count")).toBe(2);
    });

    it("should get setting with metadata", () => {
      repo.set("key", "value");

      const setting = repo.getWithMetadata("key");

      expect(setting).not.toBeNull();
      expect(setting?.key).toBe("key");
      expect(setting?.value).toBe("value");
      expect(setting?.updatedAt).toBeGreaterThan(0);
    });

    it("should get all settings", () => {
      repo.set("a", 1);
      repo.set("b", 2);

      const all = repo.getAll();

      expect(all).toHaveLength(2);
    });

    it("should delete a setting", () => {
      repo.set("key", "value");
      repo.delete("key");

      expect(repo.get("key")).toBeNull();
    });

    it("should check if setting exists", () => {
      repo.set("exists", true);

      expect(repo.has("exists")).toBe(true);
      expect(repo.has("not-exists")).toBe(false);
    });
  });
});
