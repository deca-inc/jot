import { setupTestDatabase, TestDatabaseContext } from "./test/testDatabase";
import { ThemeSettingsRepository, type ThemeSettings } from "./themeSettings";

describe("ThemeSettingsRepository", () => {
  let ctx: TestDatabaseContext;
  let repo: ThemeSettingsRepository;

  beforeEach(async () => {
    ctx = await setupTestDatabase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    repo = new ThemeSettingsRepository(ctx.db as any);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  describe("get", () => {
    it("returns default settings when no settings exist", async () => {
      const settings = await repo.get();

      expect(settings).toEqual({ mode: "auto" });
    });

    it("returns stored settings", async () => {
      await repo.set({ mode: "manual", season: "summer", timeOfDay: "day" });

      const settings = await repo.get();

      expect(settings.mode).toBe("manual");
      expect(settings.season).toBe("summer");
      expect(settings.timeOfDay).toBe("day");
    });

    it("returns default on invalid JSON", async () => {
      // Manually insert invalid JSON
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (ctx.db as any).runAsync(
        `INSERT OR REPLACE INTO settings (key, value, updatedAt) VALUES (?, ?, ?)`,
        ["theme_settings", "invalid-json", Date.now()],
      );

      const settings = await repo.get();

      expect(settings).toEqual({ mode: "auto" });
    });
  });

  describe("set", () => {
    it("stores auto mode settings", async () => {
      const input: ThemeSettings = { mode: "auto" };

      await repo.set(input);

      const settings = await repo.get();
      expect(settings.mode).toBe("auto");
    });

    it("stores manual mode settings with season and time", async () => {
      const input: ThemeSettings = {
        mode: "manual",
        season: "winter",
        timeOfDay: "night",
      };

      await repo.set(input);

      const settings = await repo.get();
      expect(settings.mode).toBe("manual");
      expect(settings.season).toBe("winter");
      expect(settings.timeOfDay).toBe("night");
    });

    it("stores settings with system time of day", async () => {
      const input: ThemeSettings = {
        mode: "manual",
        season: "spring",
        timeOfDay: "system",
      };

      await repo.set(input);

      const settings = await repo.get();
      expect(settings.timeOfDay).toBe("system");
    });

    it("overwrites existing settings", async () => {
      await repo.set({ mode: "manual", season: "summer", timeOfDay: "day" });
      await repo.set({ mode: "auto" });

      const settings = await repo.get();
      expect(settings.mode).toBe("auto");
    });

    it("preserves useSystemTimeOfDay legacy field", async () => {
      const input: ThemeSettings = {
        mode: "manual",
        season: "autumn",
        useSystemTimeOfDay: true,
      };

      await repo.set(input);

      const settings = await repo.get();
      expect(settings.useSystemTimeOfDay).toBe(true);
    });
  });

  describe("all seasons", () => {
    it("stores spring season", async () => {
      await repo.set({ mode: "manual", season: "spring" });
      const settings = await repo.get();
      expect(settings.season).toBe("spring");
    });

    it("stores summer season", async () => {
      await repo.set({ mode: "manual", season: "summer" });
      const settings = await repo.get();
      expect(settings.season).toBe("summer");
    });

    it("stores autumn season", async () => {
      await repo.set({ mode: "manual", season: "autumn" });
      const settings = await repo.get();
      expect(settings.season).toBe("autumn");
    });

    it("stores winter season", async () => {
      await repo.set({ mode: "manual", season: "winter" });
      const settings = await repo.get();
      expect(settings.season).toBe("winter");
    });
  });

  describe("all time of day options", () => {
    it("stores day time", async () => {
      await repo.set({ mode: "manual", timeOfDay: "day" });
      const settings = await repo.get();
      expect(settings.timeOfDay).toBe("day");
    });

    it("stores night time", async () => {
      await repo.set({ mode: "manual", timeOfDay: "night" });
      const settings = await repo.get();
      expect(settings.timeOfDay).toBe("night");
    });

    it("stores system time", async () => {
      await repo.set({ mode: "manual", timeOfDay: "system" });
      const settings = await repo.get();
      expect(settings.timeOfDay).toBe("system");
    });
  });
});
