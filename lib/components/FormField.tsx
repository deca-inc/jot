/**
 * FormField Component
 *
 * Wrapper for form inputs with consistent label and hint styling.
 * Based on CountdownComposer's form group pattern.
 */

import React from "react";
import { View, StyleSheet } from "react-native";
import { spacingPatterns } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { Text } from "./Text";

export interface FormFieldProps {
  /** Label text shown above the input */
  label: string;
  /** Optional hint text shown below the input */
  hint?: string;
  /** The input or control element */
  children: React.ReactNode;
  /** Whether to add bottom margin (default: true) */
  marginBottom?: boolean;
}

export function FormField({
  label,
  hint,
  children,
  marginBottom = true,
}: FormFieldProps) {
  const seasonalTheme = useSeasonalTheme();

  return (
    <View style={[styles.container, marginBottom && styles.marginBottom]}>
      <Text
        variant="caption"
        style={[styles.label, { color: seasonalTheme.textSecondary }]}
      >
        {label}
      </Text>
      {children}
      {hint && (
        <Text
          variant="caption"
          style={[styles.hint, { color: seasonalTheme.textSecondary }]}
        >
          {hint}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  marginBottom: {
    marginBottom: spacingPatterns.lg,
  },
  label: {
    marginBottom: spacingPatterns.sm,
    fontWeight: "600",
  },
  hint: {
    marginTop: spacingPatterns.xs,
    fontSize: 12,
  },
});
