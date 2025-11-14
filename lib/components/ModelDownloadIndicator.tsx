import React from "react";
import { View, StyleSheet, ActivityIndicator } from "react-native";
import { Text } from "./Text";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { useTheme } from "../theme/ThemeProvider";
import { spacingPatterns, borderRadius } from "../theme";
import { useModelDownloadStatus } from "../ai/useModelDownloadStatus";

/**
 * Shows a banner at the top of the screen when a model is downloading
 */
export function ModelDownloadIndicator() {
  const downloadStatus = useModelDownloadStatus();
  const seasonalTheme = useSeasonalTheme();
  const theme = useTheme();

  // Don't show if no download in progress
  if (!downloadStatus || !downloadStatus.isDownloading) {
    return null;
  }

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: seasonalTheme.cardBg,
          borderBottomColor: seasonalTheme.border,
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
            {downloadStatus.progress}% complete
          </Text>
        </View>
      </View>
      
      {/* Progress bar */}
      <View
        style={[styles.progressBarBg, { backgroundColor: seasonalTheme.border }]}
      >
        <View
          style={[
            styles.progressBarFill,
            {
              width: `${downloadStatus.progress}%`,
              backgroundColor: theme.colors.accent,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacingPatterns.screen,
    paddingTop: spacingPatterns.sm,
    paddingBottom: spacingPatterns.xs,
    borderBottomWidth: 1,
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
    borderRadius: borderRadius.xs,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: borderRadius.xs,
  },
});

