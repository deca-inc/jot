import React from "react";
import { TextInput, StyleSheet, TextInputProps } from "react-native";
import { spacingPatterns, borderRadius } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";

export interface ComposerInputProps extends Omit<TextInputProps, "style"> {
  multiline?: boolean;
}

export function ComposerInput({
  multiline = false,
  ...textInputProps
}: ComposerInputProps) {
  const seasonalTheme = useSeasonalTheme();

  return (
    <TextInput
      style={[
        styles.input,
        {
          color: seasonalTheme.textPrimary,
          backgroundColor: seasonalTheme.cardBg + "CC",
          borderColor: seasonalTheme.textSecondary + "30",
        },
        multiline && styles.inputMultiline,
      ]}
      placeholderTextColor={seasonalTheme.textSecondary + "CC"}
      multiline={multiline}
      {...textInputProps}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    flex: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacingPatterns.sm,
    paddingVertical: 10,
    fontSize: 16,
    lineHeight: 20,
    borderWidth: 1,
    minHeight: 36,
    maxHeight: 100,
  },
  inputMultiline: {
    textAlignVertical: "center",
  },
});

