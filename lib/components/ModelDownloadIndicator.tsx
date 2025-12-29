import React from "react";
import { View, StyleSheet, ActivityIndicator } from "react-native";
import { useModelDownloadStatus } from "../ai/useModelDownloadStatus";
import { spacingPatterns, borderRadius } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { useTheme } from "../theme/ThemeProvider";
import { Text } from "./Text";

interface ModelDownloadIndicatorProps {
  variant?: "banner" | "inline";
}

/**
 * Shows download progress when a model is downloading
 * - banner: Card-style component with rounded edges and shadow (for top of screen)
 * - inline: Compact version without borders (for embedding in settings)
 */
export function ModelDownloadIndicator({
  variant = "banner",
}: ModelDownloadIndicatorProps = {}) {
  const downloadStatus = useModelDownloadStatus();
  const seasonalTheme = useSeasonalTheme();
  const theme = useTheme();

  // Don't show if no download in progress
  if (!downloadStatus || !downloadStatus.isDownloading) {
    return null;
  }

  const isBanner = variant === "banner";

  return (
    <View
      style={[
        isBanner ? styles.container : styles.inlineContainer,
        isBanner && {
          backgroundColor: seasonalTheme.cardBg,
        },
      ]}
    >
      <View style={styles.content}>
        <ActivityIndicator size="small" color={theme.colors.accent} />
        <View style={styles.textContainer}>
          <Text
            variant="body"
            style={[styles.title, { color: seasonalTheme.textPrimary }]}
          >
            Downloading {downloadStatus.modelName}
          </Text>
          <Text
            variant="caption"
            style={[styles.subtitle, { color: seasonalTheme.textSecondary }]}
          >
            {downloadStatus.progress}% complete •{" "}
            {downloadStatus.error ? "Failed" : "In progress"}
          </Text>
        </View>
      </View>

      {/* Progress bar */}
      <View
        style={[
          styles.progressBarBg,
          {
            backgroundColor: seasonalTheme.isDark
              ? "rgba(255, 255, 255, 0.1)"
              : "rgba(0, 0, 0, 0.1)",
          },
        ]}
      >
        <View
          style={[
            styles.progressBarFill,
            {
              width: `${downloadStatus.progress}%`,
              backgroundColor: downloadStatus.error
                ? "#FF6B6B"
                : theme.colors.accent,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: spacingPatterns.screen,
    marginTop: spacingPatterns.md,
    marginBottom: spacingPatterns.md,
    padding: spacingPatterns.md,
    borderRadius: borderRadius.lg,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  inlineContainer: {
    paddingHorizontal: spacingPatterns.md,
    paddingVertical: spacingPatterns.sm,
    borderRadius: borderRadius.md,
    backgroundColor: "rgba(0, 0, 0, 0.03)",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacingPatterns.sm,
    marginBottom: spacingPatterns.xs,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontWeight: "500",
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 11,
  },
  progressBarBg: {
    height: 3,
    borderRadius: borderRadius.sm,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: borderRadius.sm,
  },
});
