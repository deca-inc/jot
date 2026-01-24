import { describe, it, expect } from "vitest";
import {
  getSeason,
  getTimeOfDay,
  getSeasonalTheme,
  type Season,
} from "./seasonalTheme";

describe("getSeason", () => {
  it("returns winter for December", () => {
    const dec = new Date(2025, 11, 15); // Month is 0-indexed
    expect(getSeason(dec)).toBe("winter");
  });

  it("returns winter for January", () => {
    const jan = new Date(2025, 0, 15);
    expect(getSeason(jan)).toBe("winter");
  });

  it("returns winter for February", () => {
    const feb = new Date(2025, 1, 15);
    expect(getSeason(feb)).toBe("winter");
  });

  it("returns spring for March", () => {
    const mar = new Date(2025, 2, 15);
    expect(getSeason(mar)).toBe("spring");
  });

  it("returns spring for April", () => {
    const apr = new Date(2025, 3, 15);
    expect(getSeason(apr)).toBe("spring");
  });

  it("returns spring for May", () => {
    const may = new Date(2025, 4, 15);
    expect(getSeason(may)).toBe("spring");
  });

  it("returns summer for June", () => {
    const jun = new Date(2025, 5, 15);
    expect(getSeason(jun)).toBe("summer");
  });

  it("returns summer for July", () => {
    const jul = new Date(2025, 6, 15);
    expect(getSeason(jul)).toBe("summer");
  });

  it("returns summer for August", () => {
    const aug = new Date(2025, 7, 15);
    expect(getSeason(aug)).toBe("summer");
  });

  it("returns autumn for September", () => {
    const sep = new Date(2025, 8, 15);
    expect(getSeason(sep)).toBe("autumn");
  });

  it("returns autumn for October", () => {
    const oct = new Date(2025, 9, 15);
    expect(getSeason(oct)).toBe("autumn");
  });

  it("returns autumn for November", () => {
    const nov = new Date(2025, 10, 15);
    expect(getSeason(nov)).toBe("autumn");
  });
});

describe("getTimeOfDay", () => {
  it("returns day for morning hours (6 AM)", () => {
    const morning = new Date(2025, 0, 15, 6, 0, 0);
    expect(getTimeOfDay(morning)).toBe("day");
  });

  it("returns day for noon", () => {
    const noon = new Date(2025, 0, 15, 12, 0, 0);
    expect(getTimeOfDay(noon)).toBe("day");
  });

  it("returns day for afternoon (3 PM)", () => {
    const afternoon = new Date(2025, 0, 15, 15, 0, 0);
    expect(getTimeOfDay(afternoon)).toBe("day");
  });

  it("returns day for early evening (7 PM)", () => {
    const evening = new Date(2025, 0, 15, 19, 0, 0);
    expect(getTimeOfDay(evening)).toBe("day");
  });

  it("returns night for late evening (8 PM)", () => {
    const lateEvening = new Date(2025, 0, 15, 20, 0, 0);
    expect(getTimeOfDay(lateEvening)).toBe("night");
  });

  it("returns night for midnight", () => {
    const midnight = new Date(2025, 0, 15, 0, 0, 0);
    expect(getTimeOfDay(midnight)).toBe("night");
  });

  it("returns night for early morning (5 AM)", () => {
    const earlyMorning = new Date(2025, 0, 15, 5, 0, 0);
    expect(getTimeOfDay(earlyMorning)).toBe("night");
  });
});

describe("getSeasonalTheme", () => {
  const seasons: Season[] = ["spring", "summer", "autumn", "winter"];

  describe("theme structure", () => {
    it.each(seasons)("returns valid theme for %s day", (season) => {
      const theme = getSeasonalTheme(season, "day");

      expect(theme).toHaveProperty("gradient");
      expect(theme.gradient).toHaveProperty("start");
      expect(theme.gradient).toHaveProperty("middle");
      expect(theme.gradient).toHaveProperty("end");
      expect(theme).toHaveProperty("subtleGlow");
      expect(theme).toHaveProperty("chipBg");
      expect(theme).toHaveProperty("chipText");
      expect(theme).toHaveProperty("cardBg");
      expect(theme).toHaveProperty("glassFallbackBg");
      expect(theme).toHaveProperty("textPrimary");
      expect(theme).toHaveProperty("textSecondary");
      expect(theme).toHaveProperty("timeOfDay");
      expect(theme).toHaveProperty("isDark");
    });

    it.each(seasons)("returns valid theme for %s night", (season) => {
      const theme = getSeasonalTheme(season, "night");

      expect(theme).toHaveProperty("gradient");
      expect(theme).toHaveProperty("isDark");
    });
  });

  describe("isDark property", () => {
    it.each(seasons)("isDark is false for %s day", (season) => {
      const theme = getSeasonalTheme(season, "day");
      expect(theme.isDark).toBe(false);
    });

    it.each(seasons)("isDark is true for %s night", (season) => {
      const theme = getSeasonalTheme(season, "night");
      expect(theme.isDark).toBe(true);
    });
  });

  describe("timeOfDay property", () => {
    it.each(seasons)("timeOfDay matches input for %s", (season) => {
      const dayTheme = getSeasonalTheme(season, "day");
      expect(dayTheme.timeOfDay).toBe("day");

      const nightTheme = getSeasonalTheme(season, "night");
      expect(nightTheme.timeOfDay).toBe("night");
    });
  });

  describe("caching", () => {
    it("returns same object reference for same inputs", () => {
      const theme1 = getSeasonalTheme("winter", "day");
      const theme2 = getSeasonalTheme("winter", "day");

      expect(theme1).toBe(theme2); // Same reference due to caching
    });

    it("returns different objects for different seasons", () => {
      const winter = getSeasonalTheme("winter", "day");
      const summer = getSeasonalTheme("summer", "day");

      expect(winter).not.toBe(summer);
      expect(winter.gradient).not.toEqual(summer.gradient);
    });

    it("returns different objects for different times", () => {
      const day = getSeasonalTheme("winter", "day");
      const night = getSeasonalTheme("winter", "night");

      expect(day).not.toBe(night);
      expect(day.isDark).not.toBe(night.isDark);
    });
  });

  describe("color values", () => {
    it("day themes have lighter backgrounds", () => {
      const dayTheme = getSeasonalTheme("winter", "day");

      // Day gradient should start with lighter colors (higher hex values)
      expect(dayTheme.gradient.start).toMatch(/^#[ef]/i);
    });

    it("night themes have darker backgrounds", () => {
      const nightTheme = getSeasonalTheme("winter", "night");

      // Night gradient should start with darker colors (lower hex values)
      expect(nightTheme.gradient.start).toMatch(/^#[0-3]/i);
    });
  });
});
