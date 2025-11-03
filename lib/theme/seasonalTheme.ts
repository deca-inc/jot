/**
 * Seasonal and time-of-day aware theme system
 * Provides colors, gradients, and styling based on season and time
 */

// Note: React import removed as we're using a context provider now

export type Season = "spring" | "summer" | "autumn" | "winter";
export type TimeOfDay = "day" | "night";

export interface SeasonalTheme {
  gradient: {
    start: string;
    middle: string;
    end: string;
  };
  subtleGlow: {
    shadowColor: string;
    shadowOpacity: number;
  };
  chipBg: string;
  chipText: string;
  cardBg: string;
  textPrimary: string;
  textSecondary: string;
}

/**
 * Get current season based on month (Northern hemisphere)
 */
export function getSeason(date: Date = new Date()): Season {
  const month = date.getMonth(); // 0-11
  if (month <= 1 || month === 11) return "winter";
  if (month <= 4) return "spring";
  if (month <= 7) return "summer";
  return "autumn";
}

/**
 * Get time of day based on hour
 */
export function getTimeOfDay(date: Date = new Date()): TimeOfDay {
  const hour = date.getHours();
  return hour >= 6 && hour < 20 ? "day" : "night";
}

/**
 * Get seasonal theme colors
 */
export function getSeasonalTheme(
  season: Season,
  timeOfDay: TimeOfDay
): SeasonalTheme {
  const isNight = timeOfDay === "night";

  switch (season) {
    case "spring":
      return {
        gradient: isNight
          ? { start: "#0f172a", middle: "#1e293b", end: "#0f172a" }
          : { start: "#ecfdf5", middle: "#d1fae5", end: "#f0fdf4" },
        subtleGlow: {
          shadowColor: isNight ? "#10b981" : "#10b981",
          shadowOpacity: isNight ? 0.15 : 0.25,
        },
        chipBg: isNight
          ? "rgba(16, 185, 129, 0.2)"
          : "rgba(16, 185, 129, 0.15)",
        chipText: isNight ? "#6ee7b7" : "#065f46",
        cardBg: isNight
          ? "rgba(255, 255, 255, 0.05)"
          : "rgba(255, 255, 255, 0.55)",
        textPrimary: isNight ? "#f1f5f9" : "#0f172a",
        textSecondary: isNight ? "#94a3b8" : "#475569",
      };

    case "summer":
      return {
        gradient: isNight
          ? { start: "#0f172a", middle: "#1e293b", end: "#0c4a6e" }
          : { start: "#f0f9ff", middle: "#e0f2fe", end: "#bae6fd" },
        subtleGlow: {
          shadowColor: isNight ? "#38bdf8" : "#0ea5e9",
          shadowOpacity: isNight ? 0.12 : 0.25,
        },
        chipBg: isNight
          ? "rgba(56, 189, 248, 0.15)"
          : "rgba(14, 165, 233, 0.15)",
        chipText: isNight ? "#93c5fd" : "#0c4a6e",
        cardBg: isNight
          ? "rgba(255, 255, 255, 0.05)"
          : "rgba(255, 255, 255, 0.55)",
        textPrimary: isNight ? "#f1f5f9" : "#0f172a",
        textSecondary: isNight ? "#94a3b8" : "#475569",
      };

    case "autumn":
      return {
        gradient: isNight
          ? { start: "#1c1917", middle: "#292524", end: "#1c1917" }
          : { start: "#faf8f3", middle: "#f5f1e8", end: "#ede7d6" },
        subtleGlow: {
          shadowColor: isNight ? "#a78b5d" : "#c9a677",
          shadowOpacity: isNight ? 0.12 : 0.2,
        },
        chipBg: isNight
          ? "rgba(167, 139, 93, 0.15)"
          : "rgba(201, 166, 119, 0.12)",
        chipText: isNight ? "#d4b896" : "#6b5d47",
        cardBg: isNight
          ? "rgba(255, 255, 255, 0.05)"
          : "rgba(255, 255, 255, 0.55)",
        textPrimary: isNight ? "#f1f5f9" : "#0f172a",
        textSecondary: isNight ? "#94a3b8" : "#475569",
      };

    case "winter":
    default:
      return {
        gradient: isNight
          ? { start: "#0f172a", middle: "#1e293b", end: "#312e81" }
          : { start: "#f8fafc", middle: "#e2e8f0", end: "#cbd5e1" },
        subtleGlow: {
          shadowColor: isNight ? "#6366f1" : "#6366f1",
          shadowOpacity: isNight ? 0.1 : 0.2,
        },
        chipBg: isNight
          ? "rgba(99, 102, 241, 0.2)"
          : "rgba(99, 102, 241, 0.15)",
        chipText: isNight ? "#a5b4fc" : "#4c1d95",
        cardBg: isNight
          ? "rgba(255, 255, 255, 0.05)"
          : "rgba(255, 255, 255, 0.55)",
        textPrimary: isNight ? "#f1f5f9" : "#0f172a",
        textSecondary: isNight ? "#94a3b8" : "#475569",
      };
  }
}

// Note: useSeasonalTheme is now re-exported from SeasonalThemeProvider
// This file only contains the theme calculation functions
