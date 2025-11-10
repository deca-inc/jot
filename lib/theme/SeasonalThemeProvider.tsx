import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import { useColorScheme } from "react-native";
import { type ThemeSettings, useThemeSettings } from "../db/themeSettings";
import {
  type Season,
  type TimeOfDay,
  getSeason,
  getTimeOfDay,
  getSeasonalTheme,
  type SeasonalTheme,
} from "./seasonalTheme";

interface SeasonalThemeContextValue {
  theme: SeasonalTheme;
  settings: ThemeSettings | null;
  refreshTheme: () => Promise<void>;
}

const SeasonalThemeContext = createContext<SeasonalThemeContextValue | null>(
  null
);

interface SeasonalThemeProviderProps {
  children: React.ReactNode;
}

export function SeasonalThemeProvider({
  children,
}: SeasonalThemeProviderProps) {
  const { getSettings } = useThemeSettings();
  const colorScheme = useColorScheme();
  const [settings, setSettings] = useState<ThemeSettings | null>(null);
  const [theme, setTheme] = useState<SeasonalTheme | null>(null);

  // Use a stable function that doesn't need to be memoized
  const calculateThemeInternal = (
    currentSettings: ThemeSettings,
    scheme: string | null | undefined
  ) => {
    const now = new Date();
    let season: Season;
    let timeOfDay: TimeOfDay;

    if (currentSettings.mode === "manual" && currentSettings.season) {
      season = currentSettings.season;

      // Handle timeOfDay: can be "system", TimeOfDay, or undefined
      if (
        currentSettings.timeOfDay === "system" ||
        currentSettings.useSystemTimeOfDay
      ) {
        // Use system color scheme to determine time of day
        timeOfDay = scheme === "dark" ? "night" : "day";
      } else if (currentSettings.timeOfDay) {
        // In this branch, timeOfDay cannot be "system" due to the previous check
        timeOfDay = currentSettings.timeOfDay as TimeOfDay;
      } else {
        timeOfDay = getTimeOfDay(now);
      }
    } else {
      // Auto mode: season rotates automatically
      season = getSeason(now);

      // Handle timeOfDay: can respect manual selection even in auto mode
      if (
        currentSettings.timeOfDay === "system" ||
        currentSettings.useSystemTimeOfDay
      ) {
        // Use system color scheme to determine time of day
        timeOfDay = scheme === "dark" ? "night" : "day";
      } else if (currentSettings.timeOfDay) {
        // In this branch, timeOfDay cannot be "system" due to the previous check
        // Respect manual timeOfDay selection even in auto mode
        timeOfDay = currentSettings.timeOfDay as TimeOfDay;
      } else {
        // Fall back to time-based calculation
        timeOfDay = getTimeOfDay(now);
      }
    }

    return getSeasonalTheme(season, timeOfDay);
  };

  const refreshTheme = useCallback(async () => {
    try {
      const currentSettings = await getSettings();
      const newTheme = calculateThemeInternal(currentSettings, colorScheme);

      // Only update state if theme reference actually changed (thanks to caching)
      setTheme((prevTheme) => {
        if (prevTheme === newTheme) {
          return prevTheme;
        }
        return newTheme;
      });

      setSettings((prevSettings) => {
        // Simple comparison - only update if mode or season changed
        if (
          prevSettings?.mode === currentSettings.mode &&
          prevSettings?.season === currentSettings.season &&
          prevSettings?.timeOfDay === currentSettings.timeOfDay
        ) {
          return prevSettings;
        }
        return currentSettings;
      });
    } catch (error) {
      console.error("Error loading theme settings:", error);
      // Default to auto mode on error
      const defaultSettings = { mode: "auto" as const };
      setSettings(defaultSettings);
      const defaultTheme = calculateThemeInternal(defaultSettings, colorScheme);
      setTheme(defaultTheme);
    }
  }, [getSettings, colorScheme]);

  useEffect(() => {
    refreshTheme();
  }, [refreshTheme]);

  // Listen for theme changes - refresh every minute to update time of day in auto mode
  // Also refresh when color scheme changes (for system timeOfDay)
  useEffect(() => {
    if (!settings) {
      return;
    }

    // Refresh when color scheme changes if using system timeOfDay
    const shouldUseSystem =
      settings.timeOfDay === "system" || settings.useSystemTimeOfDay;
    if (shouldUseSystem) {
      refreshTheme();
    }

    // Auto-refresh interval logic:
    // - Always refresh in auto mode (to update season)
    // - Also refresh if using system timeOfDay (to update day/night)
    // - Skip if manual mode and not using system timeOfDay
    if (settings.mode === "manual" && !shouldUseSystem) {
      return;
    }

    const interval = setInterval(() => {
      refreshTheme();
    }, 60000); // Refresh every minute

    return () => clearInterval(interval);
  }, [settings, refreshTheme, colorScheme]);

  const contextValue = useMemo(
    () => ({
      theme: theme || calculateThemeInternal({ mode: "auto" }, colorScheme),
      settings,
      refreshTheme,
    }),
    [theme, settings, refreshTheme, colorScheme]
  );

  return (
    <SeasonalThemeContext.Provider value={contextValue}>
      {children}
    </SeasonalThemeContext.Provider>
  );
}

export function useSeasonalThemeContext(): SeasonalThemeContextValue {
  const context = useContext(SeasonalThemeContext);
  if (!context) {
    throw new Error(
      "useSeasonalThemeContext must be used within a SeasonalThemeProvider"
    );
  }
  return context;
}

/**
 * Hook to get current seasonal theme
 * This is a convenience wrapper around useSeasonalThemeContext
 */
export function useSeasonalTheme(): SeasonalTheme {
  const { theme } = useSeasonalThemeContext();
  return theme;
}
