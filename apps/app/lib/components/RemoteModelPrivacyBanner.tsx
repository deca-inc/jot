/**
 * Remote Model Privacy Banner
 *
 * Displays a privacy warning when users select or add remote API models.
 * Users must acknowledge that their data will be sent to external servers.
 */

import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import { borderRadius, spacingPatterns } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { useTheme } from "../theme/ThemeProvider";
import { Text } from "./Text";

export interface RemoteModelPrivacyBannerProps {
  /** The provider name (e.g., "OpenAI", "Anthropic") */
  providerName: string;
  /** Whether the user has already acknowledged privacy for this model */
  isAcknowledged: boolean;
  /** Called when user clicks "I Understand" */
  onAcknowledge: () => void;
  /** Called when user clicks "Cancel" or dismiss */
  onCancel?: () => void;
  /** Whether to show as a compact inline banner or full dialog style */
  variant?: "inline" | "dialog";
}

export function RemoteModelPrivacyBanner({
  providerName,
  isAcknowledged,
  onAcknowledge,
  onCancel,
  variant = "inline",
}: RemoteModelPrivacyBannerProps) {
  const theme = useTheme();
  const seasonalTheme = useSeasonalTheme();

  // Don't show if already acknowledged
  if (isAcknowledged) {
    return null;
  }

  const isDialog = variant === "dialog";

  return (
    <View
      style={[
        styles.container,
        isDialog && styles.dialogContainer,
        { backgroundColor: `${theme.colors.warning}15` },
      ]}
    >
      <View style={styles.iconRow}>
        <Ionicons
          name="cloud-upload-outline"
          size={isDialog ? 24 : 18}
          color={theme.colors.warning}
        />
        <Text
          variant={isDialog ? "body" : "caption"}
          style={[
            styles.title,
            { color: theme.colors.warning, fontWeight: "600" },
          ]}
        >
          Data Privacy Notice
        </Text>
      </View>

      <Text
        variant="caption"
        style={[styles.description, { color: seasonalTheme.textSecondary }]}
      >
        Using {providerName} will send your conversation data to external
        servers. Your messages will leave your device and be processed by{" "}
        {providerName}'s API.
      </Text>

      <View style={styles.bulletPoints}>
        <View style={styles.bulletPoint}>
          <Ionicons
            name="arrow-forward"
            size={12}
            color={seasonalTheme.textSecondary}
          />
          <Text
            variant="caption"
            style={{ color: seasonalTheme.textSecondary, flex: 1 }}
          >
            Your messages will be sent to {providerName}'s servers
          </Text>
        </View>
        <View style={styles.bulletPoint}>
          <Ionicons
            name="arrow-forward"
            size={12}
            color={seasonalTheme.textSecondary}
          />
          <Text
            variant="caption"
            style={{ color: seasonalTheme.textSecondary, flex: 1 }}
          >
            Review {providerName}'s privacy policy for data handling details
          </Text>
        </View>
        <View style={styles.bulletPoint}>
          <Ionicons
            name="arrow-forward"
            size={12}
            color={seasonalTheme.textSecondary}
          />
          <Text
            variant="caption"
            style={{ color: seasonalTheme.textSecondary, flex: 1 }}
          >
            You can switch back to local models anytime
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        {onCancel && (
          <TouchableOpacity
            style={[
              styles.button,
              styles.cancelButton,
              { borderColor: seasonalTheme.textSecondary + "40" },
            ]}
            onPress={onCancel}
          >
            <Text
              variant="caption"
              style={{ color: seasonalTheme.textSecondary, fontWeight: "600" }}
            >
              Cancel
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[
            styles.button,
            styles.acknowledgeButton,
            { backgroundColor: theme.colors.warning },
          ]}
          onPress={onAcknowledge}
        >
          <Ionicons name="checkmark" size={16} color="white" />
          <Text variant="caption" style={{ color: "white", fontWeight: "600" }}>
            I Understand
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.sm,
    padding: spacingPatterns.sm,
    gap: spacingPatterns.xs,
  },
  dialogContainer: {
    padding: spacingPatterns.md,
    gap: spacingPatterns.sm,
  },
  iconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacingPatterns.xs,
  },
  title: {
    fontSize: 13,
  },
  description: {
    fontSize: 12,
    lineHeight: 18,
  },
  bulletPoints: {
    gap: spacingPatterns.xxs,
    marginTop: spacingPatterns.xxs,
  },
  bulletPoint: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacingPatterns.xs,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacingPatterns.sm,
    marginTop: spacingPatterns.xs,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacingPatterns.sm,
    paddingVertical: spacingPatterns.xs,
    borderRadius: borderRadius.sm,
  },
  cancelButton: {
    borderWidth: 1,
  },
  acknowledgeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
});
