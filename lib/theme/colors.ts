/**
 * Color palette for the Journal app
 * Designed for excellent readability, contrast, and a premium feel
 */

export const colors = {
  // Base colors
  white: "#FFFFFF",
  black: "#000000",

  // Grayscale palette (light mode)
  gray50: "#FAFAFA",
  gray100: "#F5F5F5",
  gray200: "#E5E5E5",
  gray300: "#D4D4D4",
  gray400: "#A3A3A3",
  gray500: "#737373",
  gray600: "#525252",
  gray700: "#404040",
  gray800: "#262626",
  gray900: "#171717",
  gray950: "#0A0A0A",

  // Semantic colors
  primary: "#2563EB", // Blue 600
  primaryLight: "#3B82F6", // Blue 500
  primaryDark: "#1D4ED8", // Blue 700

  // Text colors
  textPrimary: "#171717", // gray900
  textSecondary: "#525252", // gray600
  textTertiary: "#737373", // gray500
  textInverse: "#FFFFFF",

  // Background colors
  background: "#FFFFFF",
  backgroundSecondary: "#FAFAFA", // gray50
  backgroundTertiary: "#F5F5F5", // gray100

  // Border colors
  border: "#E5E5E5", // gray200
  borderLight: "#F5F5F5", // gray100
  borderDark: "#D4D4D4", // gray300

  // Accent colors
  accent: "#2563EB",
  accentLight: "#DBEAFE", // Blue 100
  success: "#16A34A", // Green 600
  warning: "#F59E0B", // Amber 500
  error: "#DC2626", // Red 600

  // Interactive states
  hover: "#F5F5F5", // gray100
  pressed: "#E5E5E5", // gray200
  focus: "#2563EB", // primary

  // Favorite/Star
  favorite: "#FBBF24", // Amber 400

  // High contrast mode overrides (can be applied via theme context)
  highContrast: {
    textPrimary: "#000000",
    textSecondary: "#1A1A1A",
    background: "#FFFFFF",
    border: "#000000",
  },
} as const;

export type ColorName = keyof typeof colors;

