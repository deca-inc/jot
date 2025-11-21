/**
 * Dialog for prompting user to resume incomplete AI generations
 */

import React from "react";
import { View, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { Dialog } from "./Dialog";
import { Text } from "./Text";
import { Button } from "./Button";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { spacingPatterns, borderRadius } from "../theme";
import type { IncompleteGeneration } from "../ai/generationResumption";

interface GenerationResumptionDialogProps {
  generation: IncompleteGeneration | null;
  onResume: (generation: IncompleteGeneration) => Promise<void>;
  onDismiss: (generation: IncompleteGeneration) => Promise<void>;
  onClose: () => void;
}

export function GenerationResumptionDialog({
  generation,
  onResume,
  onDismiss,
  onClose,
}: GenerationResumptionDialogProps) {
  const seasonalTheme = useSeasonalTheme();
  const [isResuming, setIsResuming] = React.useState(false);

  if (!generation) {
    return null;
  }

  const handleResume = async () => {
    try {
      setIsResuming(true);
      await onResume(generation);
      onClose();
    } catch (error) {
      console.error("Failed to resume generation:", error);
      Alert.alert(
        "Resume Failed",
        `Failed to resume generation: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      setIsResuming(false);
    }
  };

  const handleDismiss = async () => {
    try {
      await onDismiss(generation);
      onClose();
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
    <Dialog visible={true} onRequestClose={onClose}>
      <View
        style={[
          styles.content,
          { backgroundColor: seasonalTheme.gradient.middle },
        ]}
      >
        {/* Title */}
        <Text
          variant="h3"
          style={[styles.title, { color: seasonalTheme.textPrimary }]}
        >
          Resume Generation?
        </Text>

        {/* Message */}
        <View style={styles.messageContainer}>
          <Text
            variant="body"
            style={[styles.message, { color: seasonalTheme.textSecondary }]}
          >
            An AI response was interrupted{" "}
            {formatTime(generation.timeSinceStarted)}.
          </Text>
          <Text
            variant="body"
            style={[styles.entryTitle, { color: seasonalTheme.textPrimary }]}
          >
            "{generation.entry.title}"
          </Text>
          <Text
            variant="body"
            style={[styles.message, { color: seasonalTheme.textSecondary }]}
          >
            Would you like to continue generating?
          </Text>
        </View>

        {/* Model info */}
        <View style={styles.metaInfo}>
          <Text
            variant="caption"
            style={{ color: seasonalTheme.textSecondary }}
          >
            Model: {generation.modelName}
          </Text>
        </View>

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
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
              variant="body"
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
              { backgroundColor: seasonalTheme.chipBg },
              isResuming && { opacity: 0.6 },
            ]}
            onPress={handleResume}
            disabled={isResuming}
          >
            <Text
              variant="body"
              style={[
                styles.buttonText,
                { color: seasonalTheme.chipText || seasonalTheme.textPrimary },
              ]}
            >
              {isResuming ? "Resuming..." : "Resume"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacingPatterns.lg,
    borderRadius: borderRadius.lg,
    maxWidth: 400,
    width: "90%",
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: spacingPatterns.sm,
    textAlign: "center",
  },
  messageContainer: {
    marginBottom: spacingPatterns.md,
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: spacingPatterns.xs,
  },
  entryTitle: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: spacingPatterns.xs,
  },
  metaInfo: {
    alignItems: "center",
    marginBottom: spacingPatterns.lg,
  },
  buttonContainer: {
    flexDirection: "row",
    gap: spacingPatterns.sm,
    justifyContent: "space-between",
  },
  button: {
    flex: 1,
    paddingVertical: spacingPatterns.md,
    paddingHorizontal: spacingPatterns.lg,
    borderRadius: borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  dismissButton: {
    borderWidth: 1,
  },
  resumeButton: {
    // backgroundColor set dynamically
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "600",
  },
});
