import {
  ComposerSettingsRepository,
  type ComposerSettings,
} from "./composerSettings";
import { setupTestDatabase, TestDatabaseContext } from "./test/testDatabase";

describe("ComposerSettingsRepository", () => {
  let ctx: TestDatabaseContext;
  let repo: ComposerSettingsRepository;

  beforeEach(async () => {
    ctx = await setupTestDatabase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    repo = new ComposerSettingsRepository(ctx.db as any);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  describe("get", () => {
    it("returns default settings when no settings exist", async () => {
      const settings = await repo.get();

      expect(settings).toEqual({ lastUsedMode: "journal" });
    });

    it("returns stored settings", async () => {
      await repo.set({ lastUsedMode: "ai" });

      const settings = await repo.get();

      expect(settings.lastUsedMode).toBe("ai");
    });

    it("returns default on invalid JSON", async () => {
      // Manually insert invalid JSON
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (ctx.db as any).runAsync(
        `INSERT OR REPLACE INTO settings (key, value, updatedAt) VALUES (?, ?, ?)`,
        ["composer_settings", "invalid-json", Date.now()],
      );

      const settings = await repo.get();

      expect(settings).toEqual({ lastUsedMode: "journal" });
    });
  });

  describe("set", () => {
    it("stores settings", async () => {
      const input: ComposerSettings = { lastUsedMode: "ai" };

      await repo.set(input);

      const settings = await repo.get();
      expect(settings.lastUsedMode).toBe("ai");
    });

    it("overwrites existing settings", async () => {
      await repo.set({ lastUsedMode: "journal" });
      await repo.set({ lastUsedMode: "ai" });

      const settings = await repo.get();
      expect(settings.lastUsedMode).toBe("ai");
    });
  });

  describe("getLastUsedMode", () => {
    it("returns default mode when no settings exist", async () => {
      const mode = await repo.getLastUsedMode();

      expect(mode).toBe("journal");
    });

    it("returns stored mode", async () => {
      await repo.set({ lastUsedMode: "ai" });

      const mode = await repo.getLastUsedMode();

      expect(mode).toBe("ai");
    });
  });

  describe("setLastUsedMode", () => {
    it("sets the last used mode to journal", async () => {
      await repo.setLastUsedMode("journal");

      const mode = await repo.getLastUsedMode();
      expect(mode).toBe("journal");
    });

    it("sets the last used mode to ai", async () => {
      await repo.setLastUsedMode("ai");

      const mode = await repo.getLastUsedMode();
      expect(mode).toBe("ai");
    });

    it("updates existing mode", async () => {
      await repo.setLastUsedMode("journal");
      await repo.setLastUsedMode("ai");
      await repo.setLastUsedMode("journal");

      const mode = await repo.getLastUsedMode();
      expect(mode).toBe("journal");
    });
  });
});
