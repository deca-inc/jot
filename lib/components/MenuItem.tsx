import React from "react";
import {
  TouchableOpacity,
  StyleSheet,
  Platform,
  ViewStyle,
  TextStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./Text";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { spacingPatterns, borderRadius } from "../theme";

export interface MenuItemProps {
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  label: string;
  onPress: () => void;
  variant?: "default" | "destructive";
  style?: ViewStyle;
  textStyle?: TextStyle;
}

/**
 * Reusable MenuItem component for dialogs/menus
 * Handles Android styling with proper backgrounds and text weight
 */
export function MenuItem({
  icon,
  iconColor,
  label,
  onPress,
  variant = "default",
  style,
  textStyle,
}: MenuItemProps) {
  const seasonalTheme = useSeasonalTheme();

  const isDestructive = variant === "destructive";
  const finalIconColor = iconColor || (isDestructive ? "#FF3B30" : seasonalTheme.textPrimary);
  const textColor = isDestructive ? "#FF3B30" : seasonalTheme.textPrimary;

  return (
    <TouchableOpacity
      style={[
        styles.menuItem,
        isDestructive &&
          Platform.OS === "android" && {
            backgroundColor: seasonalTheme.isDark
              ? "rgba(255, 59, 48, 0.15)" // Dark mode - more visible
              : "rgba(255, 59, 48, 0.08)", // Light mode - subtle
          },
        style,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {icon && (
        <Ionicons
          name={icon}
          size={20}
          color={finalIconColor}
          style={styles.menuIcon}
        />
      )}
      <Text
        style={[
          {
            color: textColor,
            fontWeight: Platform.OS === "android" ? "600" : "400",
          },
          textStyle,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacingPatterns.md,
    borderRadius: borderRadius.md,
  },
  menuIcon: {
    marginRight: spacingPatterns.sm,
  },
});

