import React from "react";
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
  ViewStyle,
} from "react-native";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { spacingPatterns, borderRadius } from "../theme";

export interface DialogProps {
  visible: boolean;
  onRequestClose: () => void;
  children: React.ReactNode;
  style?: ViewStyle;
  containerStyle?: ViewStyle;
}

/**
 * Helper function to make a color more opaque
 * Extracts RGB values and sets alpha to a higher value
 */
function makeOpaque(color: string, alpha: number = 0.95): string {
  // Handle rgba format
  if (color.startsWith("rgba")) {
    const match = color.match(/[\d.]+/g);
    if (match && match.length >= 3) {
      const r = match[0];
      const g = match[1];
      const b = match[2];
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  }
  // Handle rgb format
  if (color.startsWith("rgb")) {
    const match = color.match(/\d+/g);
    if (match && match.length >= 3) {
      const r = match[0];
      const g = match[1];
      const b = match[2];
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  }
  // Handle hex format
  if (color.startsWith("#")) {
    const hex = color.replace("#", "");
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  // Fallback: return original color
  return color;
}

/**
 * Reusable Dialog/Menu component with proper Android styling
 * Handles transparency, dark mode, and elevation correctly
 */
export function Dialog({
  visible,
  onRequestClose,
  children,
  style,
  containerStyle,
}: DialogProps) {
  const seasonalTheme = useSeasonalTheme();

  // Make background more opaque for better visibility
  const dialogBackground =
    Platform.OS === "android"
      ? seasonalTheme.gradient.middle
      : makeOpaque(seasonalTheme.cardBg, 0.95);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onRequestClose}
    >
      <Pressable style={styles.overlay} onPress={onRequestClose}>
        <Pressable
          style={[
            styles.container,
            {
              backgroundColor: dialogBackground,
            },
            containerStyle,
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    minWidth: 200,
    borderRadius: borderRadius.lg,
    padding: spacingPatterns.xs,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
        shadowColor: "#000",
      },
    }),
  },
});

