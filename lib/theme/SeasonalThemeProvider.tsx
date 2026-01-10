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
import { getCachedThemeSettings, cacheThemeSettings } from "./themeCache";

interface SeasonalThemeContextValue {
  theme: SeasonalTheme;
  settings: ThemeSettings | null;
  refreshTheme: () => Promise<void>;
}

const SeasonalThemeContext = createContext<SeasonalThemeContextValue | null>(
  null,
);

interface SeasonalThemeProviderProps {
  children: React.ReactNode;
}

/**
 * Calculate theme from settings - module-level function for use during initialization
 */
function calculateThemeFromSettings(
  currentSettings: ThemeSettings,
  scheme: string | null | undefined,
): SeasonalTheme {
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
}

/**
 * Get initial theme state synchronously from cache
 * This prevents the jarring theme flash on app start
 */
function getInitialThemeState(colorScheme: string | null | undefined): {
  settings: ThemeSettings | null;
  theme: SeasonalTheme | null;
} {
  const cachedSettings = getCachedThemeSettings();

  if (cachedSettings) {
    return {
      settings: cachedSettings,
      theme: calculateThemeFromSettings(cachedSettings, colorScheme),
    };
  }

  return {
    settings: null,
    theme: null,
  };
}

export function SeasonalThemeProvider({
  children,
}: SeasonalThemeProviderProps) {
  const { getSettings } = useThemeSettings();
  const colorScheme = useColorScheme();

  // Initialize with cached settings for instant theme on app start
  // This avoids the flash/jarring theme change on 2nd+ launches
  const initialState = getInitialThemeState(colorScheme);
  const [settings, setSettings] = useState<ThemeSettings | null>(
    initialState.settings,
  );
  const [theme, setTheme] = useState<SeasonalTheme | null>(initialState.theme);

  const refreshTheme = useCallback(async () => {
    try {
      const currentSettings = await getSettings();
      const newTheme = calculateThemeFromSettings(currentSettings, colorScheme);

      // Cache settings for next app launch
      cacheThemeSettings(currentSettings);

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
      const defaultTheme = calculateThemeFromSettings(
        defaultSettings,
        colorScheme,
      );
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
      theme: theme || calculateThemeFromSettings({ mode: "auto" }, colorScheme),
      settings,
      refreshTheme,
    }),
    [theme, settings, refreshTheme, colorScheme],
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
      "useSeasonalThemeContext must be used within a SeasonalThemeProvider",
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
