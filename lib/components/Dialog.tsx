import React from "react";
import {
  StyleSheet,
  Modal,
  Pressable,
  Platform,
  ViewStyle,
} from "react-native";
import { spacingPatterns, borderRadius } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";

export interface DialogProps {
  visible: boolean;
  onRequestClose: () => void;
  children: React.ReactNode;
  style?: ViewStyle;
  containerStyle?: ViewStyle;
}

/**
 * Reusable Dialog/Menu component with proper theming
 * Uses gradient.middle for a solid, theme-aware background in both light and dark modes
 */
export function Dialog({
  visible,
  onRequestClose,
  children,
  style: _style,
  containerStyle,
}: DialogProps) {
  const seasonalTheme = useSeasonalTheme();

  // Use gradient.middle for a solid, theme-aware background
  // cardBg is translucent white in both light/dark modes, which doesn't work for dialogs
  // gradient.middle provides the correct solid color for the current theme
  const dialogBackground = seasonalTheme.gradient.middle;

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
