import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { LlmModelConfig, SpeechToTextModelConfig } from "../ai/modelConfig";
import { spacingPatterns, borderRadius } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { useTheme } from "../theme/ThemeProvider";
import { Button } from "./Button";
import { Text } from "./Text";

// Estimated file sizes in MB
const MODEL_SIZES: Record<string, number> = {
  // LLM models
  "llama-3.2-1b-instruct": 1083,
  "llama-3.2-3b-instruct": 2435,
  "qwen-3-0.6b": 900,
  "qwen-3-1.7b": 2064,
  "qwen-3-4b": 3527,
  "smollm2-135m": 535,
  "smollm2-360m": 1360,
  "smollm2-1.7b": 1220,
  // STT models
  "whisper-tiny-en": 233,
  "whisper-tiny-multi": 233,
};

type ModelConfig = LlmModelConfig | SpeechToTextModelConfig;

export interface ModelCardProps {
  model: ModelConfig;
  isDownloaded: boolean;
  isSelected: boolean;
  isDownloading: boolean;
  isLoading: boolean;
  isNotRecommended?: boolean;
  downloadProgress?: number;
  onDownload: () => void;
  onSelect: () => void;
  onRemove: () => void;
}

export function ModelCard({
  model,
  isDownloaded,
  isSelected,
  isDownloading,
  isLoading,
  isNotRecommended = false,
  downloadProgress,
  onDownload,
  onSelect,
  onRemove,
}: ModelCardProps) {
  const theme = useTheme();
  const seasonalTheme = useSeasonalTheme();

  const formatSize = (mb: number) => {
    if (mb < 1024) return `${mb} MB`;
    const gb = mb / 1024;
    return `${gb.toFixed(1)} GB`;
  };

  const estimatedSize = MODEL_SIZES[model.modelId] || 0;

  const renderActionButton = () => {
    if (isDownloading) {
      return (
        <View style={styles.iconButtonContainer}>
          <ActivityIndicator size="small" color={theme.colors.accent} />
        </View>
      );
    }

    if (!isDownloaded) {
      return (
        <Button
          variant="secondary"
          size="sm"
          label="Download Model"
          metadata={{ modelId: model.modelId, modelSize: model.size }}
          onPress={onDownload}
          style={styles.iconButton}
        >
          <Ionicons
            name="download-outline"
            size={16}
            color={theme.colors.accent}
          />
        </Button>
      );
    }

    return (
      <Button
        variant="secondary"
        size="sm"
        label="Remove Model"
        metadata={{ modelId: model.modelId, modelSize: model.size }}
        onPress={onRemove}
        disabled={isSelected}
        style={styles.iconButton}
      >
        <Ionicons
          name="trash-outline"
          size={16}
          color={
            isSelected ? theme.colors.textTertiary : seasonalTheme.textSecondary
          }
        />
      </Button>
    );
  };

  return (
    <View
      style={[
        styles.modelCard,
        {
          backgroundColor: seasonalTheme.cardBg,
          borderColor: isSelected
            ? theme.colors.accent
            : `${theme.colors.border}20`,
          borderWidth: isSelected ? 2 : 1,
        },
      ]}
    >
      {/* Main Row */}
      <TouchableOpacity
        style={styles.modelCardTouchable}
        onPress={() => isDownloaded && onSelect()}
        disabled={isDownloading || !isDownloaded}
        activeOpacity={0.7}
      >
        <View style={styles.modelCardContent}>
          {/* Checkbox or Spinner */}
          {isLoading ? (
            <View style={styles.checkboxContainer}>
              <ActivityIndicator size="small" color={theme.colors.accent} />
            </View>
          ) : (
            <View
              style={[
                styles.checkbox,
                {
                  borderColor: `${theme.colors.border}40`,
                  backgroundColor: isSelected
                    ? theme.colors.accent
                    : "transparent",
                },
              ]}
            >
              {isSelected && (
                <Text style={[styles.checkmark, { color: "white" }]}>✓</Text>
              )}
              {isDownloaded && !isSelected && (
                <View
                  style={[
                    styles.downloadedDot,
                    { backgroundColor: theme.colors.primaryLight },
                  ]}
                />
              )}
            </View>
          )}

          {/* Model Info */}
          <View style={styles.modelInfo}>
            <Text
              variant="body"
              style={[
                styles.modelName,
                {
                  color:
                    isNotRecommended && !isDownloaded
                      ? seasonalTheme.textSecondary
                      : seasonalTheme.textPrimary,
                  fontWeight: isSelected ? "600" : "400",
                },
              ]}
            >
              {model.displayName}
            </Text>
            <Text
              variant="caption"
              style={[
                styles.modelDescription,
                { color: seasonalTheme.textSecondary },
              ]}
            >
              {model.description}
            </Text>
            {isNotRecommended && !isDownloaded && (
              <View
                style={[
                  styles.warningBadge,
                  { backgroundColor: `${theme.colors.warning}20` },
                ]}
              >
                <Ionicons
                  name="warning"
                  size={10}
                  color={theme.colors.warning}
                />
                <Text
                  style={[styles.warningText, { color: theme.colors.warning }]}
                >
                  May crash on this device
                </Text>
              </View>
            )}
          </View>

          {/* Size and Action */}
          <View style={styles.rightSection}>
            <Text
              variant="caption"
              style={[styles.modelSize, { color: seasonalTheme.textSecondary }]}
            >
              {formatSize(estimatedSize)}
            </Text>
            {renderActionButton()}
          </View>
        </View>
      </TouchableOpacity>

      {/* Progress Bar (only shown when downloading) */}
      {isDownloading && downloadProgress !== undefined && (
        <View style={styles.progressContainer}>
          <View
            style={[
              styles.progressBar,
              { backgroundColor: `${theme.colors.accent}30` },
            ]}
          >
            <View
              style={[
                styles.progressFill,
                {
                  width: `${downloadProgress}%`,
                  backgroundColor: theme.colors.accent,
                },
              ]}
            />
          </View>
          <Text
            variant="caption"
            style={[
              styles.progressText,
              { color: seasonalTheme.textSecondary },
            ]}
          >
            {downloadProgress.toFixed(0)}%
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  modelCard: {
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    overflow: "hidden",
  },
  modelCardTouchable: {
    paddingHorizontal: spacingPatterns.sm,
    paddingVertical: spacingPatterns.xs,
  },
  modelCardContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacingPatterns.sm,
  },
  checkboxContainer: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  checkmark: {
    fontSize: 14,
    fontWeight: "bold",
    lineHeight: 14,
    textAlign: "center",
    marginTop: 2,
  },
  downloadedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  modelInfo: {
    flex: 1,
    gap: 2,
  },
  modelName: {
    fontSize: 14,
    lineHeight: 16,
  },
  warningBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 3,
    marginTop: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  warningText: {
    fontSize: 9,
    fontWeight: "600",
  },
  modelDescription: {
    fontSize: 11,
    lineHeight: 13,
  },
  rightSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacingPatterns.xs,
  },
  modelSize: {
    fontSize: 11,
    fontWeight: "500",
  },
  iconButton: {
    minWidth: 32,
    paddingHorizontal: spacingPatterns.xs,
    paddingVertical: 4,
  },
  iconButtonContainer: {
    width: 32,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  progressContainer: {
    marginHorizontal: spacingPatterns.sm,
    marginTop: spacingPatterns.xs,
    marginBottom: spacingPatterns.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: spacingPatterns.xs,
  },
  progressBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  progressText: {
    minWidth: 35,
    textAlign: "right",
    fontSize: 10,
    fontWeight: "600",
  },
});
