/**
 * Standardized Input Component
 *
 * Provides consistent styling for text inputs across the app.
 * Based on CountdownComposer's well-designed input pattern.
 */

import React from "react";
import {
  TextInput,
  TextInputProps,
  StyleSheet,
  StyleProp,
  TextStyle,
} from "react-native";
import { borderRadius, spacingPatterns } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";

export interface InputProps extends Omit<TextInputProps, "style"> {
  /** Additional style overrides */
  style?: StyleProp<TextStyle>;
  /** Whether this is a multiline text area */
  multiline?: boolean;
  /** Minimum height for multiline inputs */
  minHeight?: number;
}

export function Input({
  style,
  multiline = false,
  minHeight = 80,
  ...props
}: InputProps) {
  const seasonalTheme = useSeasonalTheme();

  return (
    <TextInput
      style={[
        styles.input,
        multiline && [styles.multiline, { minHeight }],
        {
          color: seasonalTheme.textPrimary,
          backgroundColor: seasonalTheme.isDark
            ? "rgba(255, 255, 255, 0.08)"
            : "rgba(255, 255, 255, 0.9)",
          borderColor: seasonalTheme.textSecondary + "40",
        },
        style,
      ]}
      placeholderTextColor={seasonalTheme.textSecondary}
      textAlignVertical={multiline ? "top" : "center"}
      multiline={multiline}
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacingPatterns.md,
    paddingVertical: spacingPatterns.sm,
    fontSize: 16,
  },
  multiline: {
    paddingTop: spacingPatterns.sm,
  },
});
