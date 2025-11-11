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
              backgroundColor:
                Platform.OS === "android"
                  ? seasonalTheme.gradient.middle
                  : seasonalTheme.cardBg,
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

