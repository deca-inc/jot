/**
 * Inline prompt for resuming incomplete AI generations
 * Appears within the conversation, below the last message
 */

import React from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import { Text } from "./Text";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { spacingPatterns, borderRadius } from "../theme";
import type { IncompleteGeneration } from "../ai/generationResumption";

interface GenerationResumptionPromptProps {
  generation: IncompleteGeneration;
  onResume: (generation: IncompleteGeneration) => Promise<void>;
  onDismiss: (generation: IncompleteGeneration) => Promise<void>;
}

export function GenerationResumptionPrompt({
  generation,
  onResume,
  onDismiss,
}: GenerationResumptionPromptProps) {
  const seasonalTheme = useSeasonalTheme();
  const [isResuming, setIsResuming] = React.useState(false);

  const handleResume = async () => {
    try {
      setIsResuming(true);
      await onResume(generation);
    } catch (error) {
      console.error("Failed to resume generation:", error);
    } finally {
      setIsResuming(false);
    }
  };

  const handleDismiss = async () => {
    try {
      await onDismiss(generation);
    } catch (error) {
      console.error("Failed to dismiss generation:", error);
    }
  };

  const formatTime = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    if (minutes < 60) {
      return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;
    }
    const hours = Math.floor(minutes / 60);
    return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor:
            seasonalTheme.cardBg || seasonalTheme.gradient.middle,
          borderColor: seasonalTheme.textSecondary + "20",
        },
      ]}
    >
      <View style={styles.content}>
        <Text
          variant="bodySmall"
          style={[styles.message, { color: seasonalTheme.textSecondary }]}
        >
          Generation was interrupted {formatTime(generation.timeSinceStarted)}
        </Text>
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[
              styles.button,
              styles.dismissButton,
              { borderColor: seasonalTheme.textSecondary + "40" },
            ]}
            onPress={handleDismiss}
            disabled={isResuming}
          >
            <Text
              variant="bodySmall"
              style={[
                styles.buttonText,
                { color: seasonalTheme.textSecondary },
              ]}
            >
              Dismiss
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.button,
              styles.resumeButton,
              {
                backgroundColor: seasonalTheme.textPrimary + "15",
                borderWidth: 1,
                borderColor: seasonalTheme.textPrimary + "30",
              },
              isResuming && { opacity: 0.6 },
            ]}
            onPress={handleResume}
            disabled={isResuming}
          >
            <Text
              variant="bodySmall"
              style={[styles.buttonText, { color: seasonalTheme.textPrimary }]}
            >
              {isResuming ? "Resuming..." : "Resume"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacingPatterns.md,
    marginBottom: spacingPatterns.md,
    marginHorizontal: spacingPatterns.screen,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  content: {
    padding: spacingPatterns.md,
  },
  message: {
    textAlign: "center",
    marginBottom: spacingPatterns.sm,
  },
  buttonRow: {
    flexDirection: "row",
    gap: spacingPatterns.sm,
    justifyContent: "center",
  },
  button: {
    paddingVertical: spacingPatterns.xs,
    paddingHorizontal: spacingPatterns.md,
    borderRadius: borderRadius.sm,
    minWidth: 80,
    alignItems: "center",
  },
  dismissButton: {
    borderWidth: 1,
  },
  resumeButton: {
    // backgroundColor set dynamically
  },
  buttonText: {
    fontWeight: "600",
  },
});
