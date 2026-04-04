import React from "react";
import { TouchableOpacity, View, StyleSheet } from "react-native";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";

export interface ToggleProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}

/**
 * Cross-platform toggle switch.
 * RN's Switch has rendering/interaction issues on web, so we use a custom implementation.
 */
export function Toggle({
  value,
  onValueChange,
  disabled = false,
}: ToggleProps) {
  const seasonalTheme = useSeasonalTheme();

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      style={[
        styles.track,
        {
          backgroundColor: value
            ? seasonalTheme.chipText || seasonalTheme.textPrimary
            : seasonalTheme.textSecondary + "30",
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.thumb,
          value ? styles.thumbOn : styles.thumbOff,
          {
            backgroundColor: "#fff",
          },
        ]}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 44,
    height: 24,
    borderRadius: 12,
    padding: 2,
    justifyContent: "center",
  },
  thumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  thumbOn: {
    alignSelf: "flex-end",
  },
  thumbOff: {
    alignSelf: "flex-start",
  },
});
