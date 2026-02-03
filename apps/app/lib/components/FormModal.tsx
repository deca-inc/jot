/**
 * FormModal Component
 *
 * Standardized modal for forms with consistent styling, header, and footer.
 * Handles keyboard avoidance, tap-outside-to-close, and theming.
 */

import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  TouchableOpacity,
  Platform,
  KeyboardAvoidingView,
  useWindowDimensions,
} from "react-native";
import { borderRadius, spacingPatterns } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { Text } from "./Text";

export interface FormModalProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Called when the modal should close (X button, tap outside, back button) */
  onClose: () => void;
  /** Title shown in the header */
  title: string;
  /** Modal content */
  children: React.ReactNode;
  /** Optional footer content (typically action buttons) */
  footer?: React.ReactNode;
  /** Optional back button handler - shows back arrow if provided */
  onBack?: () => void;
  /** Maximum height as percentage of screen (default: 0.85) */
  maxHeightRatio?: number;
  /** Whether to show the close button (default: true) */
  showCloseButton?: boolean;
}

export function FormModal({
  visible,
  onClose,
  title,
  children,
  footer,
  onBack,
  maxHeightRatio = 0.85,
  showCloseButton = true,
}: FormModalProps) {
  const seasonalTheme = useSeasonalTheme();
  const { height: screenHeight } = useWindowDimensions();

  const dialogBackground = seasonalTheme.gradient.middle;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardView}
        >
          <View
            style={[
              styles.container,
              {
                backgroundColor: dialogBackground,
                maxHeight: screenHeight * maxHeightRatio,
              },
            ]}
          >
            {/* Header */}
            <View style={styles.header}>
              {onBack ? (
                <TouchableOpacity onPress={onBack} style={styles.headerButton}>
                  <Ionicons
                    name="arrow-back"
                    size={24}
                    color={seasonalTheme.textSecondary}
                  />
                </TouchableOpacity>
              ) : (
                <View style={styles.headerSpacer} />
              )}
              <Text
                variant="h3"
                style={[styles.title, { color: seasonalTheme.textPrimary }]}
              >
                {title}
              </Text>
              {showCloseButton ? (
                <TouchableOpacity onPress={onClose} style={styles.headerButton}>
                  <Ionicons
                    name="close"
                    size={24}
                    color={seasonalTheme.textSecondary}
                  />
                </TouchableOpacity>
              ) : (
                <View style={styles.headerSpacer} />
              )}
            </View>

            {/* Content */}
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>

            {/* Footer */}
            {footer && <View style={styles.footer}>{footer}</View>}
          </View>
        </KeyboardAvoidingView>
      </View>
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
  keyboardView: {
    width: "100%",
    alignItems: "center",
  },
  container: {
    width: "90%",
    maxWidth: 480,
    borderRadius: borderRadius.lg,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacingPatterns.md,
    paddingBottom: spacingPatterns.sm,
  },
  headerButton: {
    padding: spacingPatterns.xxs,
    width: 32,
    alignItems: "center",
  },
  headerSpacer: {
    width: 32,
  },
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "600",
  },
  scrollView: {
    flexShrink: 1,
  },
  scrollContent: {
    paddingHorizontal: spacingPatterns.md,
    paddingBottom: spacingPatterns.sm,
  },
  footer: {
    padding: spacingPatterns.md,
    paddingTop: spacingPatterns.sm,
  },
});
