/**
 * Synchronous theme cache using MMKV
 *
 * This allows us to restore the user's theme settings instantly on app start,
 * avoiding the flash/jarring theme change that occurs when loading from the
 * async SQLite database.
 */
import { createMMKV, type MMKV } from "react-native-mmkv";
import { type ThemeSettings } from "../db/themeSettings";

const storage: MMKV = createMMKV({ id: "theme-cache" });

const THEME_SETTINGS_KEY = "theme_settings";

/**
 * Cache theme settings synchronously for instant access on next app launch
 */
export function cacheThemeSettings(settings: ThemeSettings): void {
  storage.set(THEME_SETTINGS_KEY, JSON.stringify(settings));
}

/**
 * Get cached theme settings synchronously
 * Returns null if no cached settings exist (first launch)
 */
export function getCachedThemeSettings(): ThemeSettings | null {
  const cached = storage.getString(THEME_SETTINGS_KEY);
  if (!cached) {
    return null;
  }

  try {
    return JSON.parse(cached) as ThemeSettings;
  } catch {
    return null;
  }
}

/**
 * Clear the theme cache (useful for debugging or reset scenarios)
 */
export function clearThemeCache(): void {
  storage.remove(THEME_SETTINGS_KEY);
}
