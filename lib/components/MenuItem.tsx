import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  TouchableOpacity,
  StyleSheet,
  Platform,
  ViewStyle,
  TextStyle,
  View,
} from "react-native";
import { spacingPatterns, borderRadius } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { Text } from "./Text";

export interface MenuItemProps {
  icon?: keyof typeof Ionicons.glyphMap;
  customIcon?: React.ReactNode;
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
  customIcon,
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
      {customIcon ? (
        <View style={styles.menuIcon}>{customIcon}</View>
      ) : icon ? (
        <Ionicons
          name={icon}
          size={20}
          color={finalIconColor}
          style={styles.menuIcon}
        />
      ) : null}
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

