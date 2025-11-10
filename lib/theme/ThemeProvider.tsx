import React, { createContext, useContext, ReactNode, useMemo } from "react";
import { useColorScheme, Platform } from "react-native";
import { theme, Theme } from "./index";

interface ThemeContextValue extends Theme {
  isDark: boolean;
  isHighContrast: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
  children: ReactNode;
  highContrast?: boolean;
}

export function ThemeProvider({
  children,
  highContrast = false,
}: ThemeProviderProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  // For now, we only support light mode
  // Dark mode can be added later by extending the theme
  const contextValue: ThemeContextValue = useMemo(
    () => ({
      ...theme,
      isDark: false, // Always light mode for now
      isHighContrast: highContrast,
    }),
    [highContrast]
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

