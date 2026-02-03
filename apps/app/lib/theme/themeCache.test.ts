import { type ThemeSettings } from "../db/themeSettings";
import {
  cacheThemeSettings,
  getCachedThemeSettings,
  clearThemeCache,
} from "./themeCache";

// Mock react-native-mmkv
const mockStorage = new Map<string, string>();

jest.mock("react-native-mmkv", () => ({
  createMMKV: () => ({
    set: (key: string, value: string) => {
      mockStorage.set(key, value);
    },
    getString: (key: string) => {
      return mockStorage.get(key);
    },
    remove: (key: string) => {
      mockStorage.delete(key);
    },
  }),
}));

describe("themeCache", () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  describe("cacheThemeSettings", () => {
    it("caches auto mode settings", () => {
      const settings: ThemeSettings = { mode: "auto" };

      cacheThemeSettings(settings);

      expect(mockStorage.get("theme_settings")).toBe(JSON.stringify(settings));
    });

    it("caches manual mode settings with season and time", () => {
      const settings: ThemeSettings = {
        mode: "manual",
        season: "winter",
        timeOfDay: "night",
      };

      cacheThemeSettings(settings);

      expect(mockStorage.get("theme_settings")).toBe(JSON.stringify(settings));
    });

    it("overwrites existing cache", () => {
      const settings1: ThemeSettings = { mode: "auto" };
      const settings2: ThemeSettings = {
        mode: "manual",
        season: "summer",
        timeOfDay: "day",
      };

      cacheThemeSettings(settings1);
      cacheThemeSettings(settings2);

      expect(mockStorage.get("theme_settings")).toBe(JSON.stringify(settings2));
    });
  });

  describe("getCachedThemeSettings", () => {
    it("returns null when no cache exists", () => {
      const result = getCachedThemeSettings();

      expect(result).toBeNull();
    });

    it("returns cached settings", () => {
      const settings: ThemeSettings = {
        mode: "manual",
        season: "spring",
        timeOfDay: "system",
      };
      mockStorage.set("theme_settings", JSON.stringify(settings));

      const result = getCachedThemeSettings();

      expect(result).toEqual(settings);
    });

    it("returns null on invalid JSON", () => {
      mockStorage.set("theme_settings", "invalid-json");

      const result = getCachedThemeSettings();

      expect(result).toBeNull();
    });

    it("returns cached auto mode settings", () => {
      const settings: ThemeSettings = { mode: "auto" };
      mockStorage.set("theme_settings", JSON.stringify(settings));

      const result = getCachedThemeSettings();

      expect(result).toEqual({ mode: "auto" });
    });
  });

  describe("clearThemeCache", () => {
    it("removes cached settings", () => {
      const settings: ThemeSettings = { mode: "auto" };
      mockStorage.set("theme_settings", JSON.stringify(settings));

      clearThemeCache();

      expect(mockStorage.has("theme_settings")).toBe(false);
    });

    it("does not throw when cache is already empty", () => {
      expect(() => clearThemeCache()).not.toThrow();
    });
  });

  describe("round-trip", () => {
    it("caches and retrieves settings correctly", () => {
      const settings: ThemeSettings = {
        mode: "manual",
        season: "autumn",
        timeOfDay: "night",
        useSystemTimeOfDay: false,
      };

      cacheThemeSettings(settings);
      const retrieved = getCachedThemeSettings();

      expect(retrieved).toEqual(settings);
    });

    it("handles all seasons", () => {
      const seasons = ["spring", "summer", "autumn", "winter"] as const;

      for (const season of seasons) {
        const settings: ThemeSettings = { mode: "manual", season };
        cacheThemeSettings(settings);
        const retrieved = getCachedThemeSettings();
        expect(retrieved?.season).toBe(season);
      }
    });

    it("handles all time of day options", () => {
      const times = ["day", "night", "system"] as const;

      for (const timeOfDay of times) {
        const settings: ThemeSettings = { mode: "manual", timeOfDay };
        cacheThemeSettings(settings);
        const retrieved = getCachedThemeSettings();
        expect(retrieved?.timeOfDay).toBe(timeOfDay);
      }
    });
  });
});
