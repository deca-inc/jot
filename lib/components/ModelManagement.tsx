import { Ionicons } from "@expo/vector-icons";
import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Linking,
} from "react-native";
import { ALL_MODELS, LlmModelConfig } from "../ai/modelConfig";
import {
  ensureModelPresent,
  deleteModel,
  getModelSize,
} from "../ai/modelManager";
import { useModel } from "../ai/ModelProvider";
import { useModelSettings } from "../db/modelSettings";
import { spacingPatterns, borderRadius } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { useTheme } from "../theme/ThemeProvider";
import { getDeviceTier, getCompatibleModels } from "../utils/deviceInfo";
import { Button } from "./Button";
import { Text } from "./Text";
import { useToast } from "./ToastProvider";

// Estimated file sizes in MB
const MODEL_SIZES: Record<string, number> = {
  "llama-3.2-1b-instruct": 1083,
  "llama-3.2-3b-instruct": 2435,
  "qwen-3-0.6b": 900,
  "qwen-3-1.7b": 2064,
  "qwen-3-4b": 3527,
  "smollm2-135m": 535,
  "smollm2-360m": 1360,
  "smollm2-1.7b": 1220,
};

interface ModelCardProps {
  model: LlmModelConfig;
  isDownloaded: boolean;
  isSelected: boolean;
  isDownloading: boolean;
  isLoading: boolean;
  isNotRecommended: boolean; // Model may cause OOM on this device
  downloadProgress?: number; // 0-100
  onDownload: () => void;
  onSelect: () => void;
  onRemove: () => void;
  onViewDetails: () => void;
  downloadedSize?: number;
}

function ModelCard({
  model,
  isDownloaded,
  isSelected,
  isDownloading,
  isLoading,
  isNotRecommended,
  downloadProgress,
  onDownload,
  onSelect,
  onRemove,
  onViewDetails: _onViewDetails,
  downloadedSize: _downloadedSize,
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

    // Show delete button for all downloaded models
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

export function ModelManagement() {
  const theme = useTheme();
  const seasonalTheme = useSeasonalTheme();
  const modelSettings = useModelSettings();
  const { reloadModel } = useModel();
  const { showToast } = useToast();

  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [downloadedModels, setDownloadedModels] = useState<string[]>([]);
  const [compatibleModels, setCompatibleModels] = useState<string[]>([]);
  const [downloadingModels, setDownloadingModels] = useState<Set<string>>(
    new Set(),
  );
  const [downloadProgress, setDownloadProgress] = useState<Map<string, number>>(
    new Map(),
  );
  const [modelSizes, setModelSizes] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [loadingModelId, setLoadingModelId] = useState<string | null>(null);
  const [deviceTier, setDeviceTier] = useState<string>("mid");

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const [selectedId, downloaded, compatible, tier] = await Promise.all([
        modelSettings.getSelectedModelId(),
        modelSettings.getDownloadedModels(),
        getCompatibleModels(),
        getDeviceTier(),
      ]);

      setSelectedModelId(selectedId);
      setDownloadedModels(downloaded.map((m) => m.modelId));
      setCompatibleModels(compatible);
      setDeviceTier(tier);

      // Load sizes for downloaded models
      const sizes = new Map<string, number>();
      for (const modelInfo of downloaded) {
        sizes.set(modelInfo.modelId, modelInfo.size);
      }
      setModelSizes(sizes);
    } catch (error) {
      console.error("Failed to load model settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (model: LlmModelConfig) => {
    if (!model.available) {
      Alert.alert(
        "Model Not Available",
        "This model does not have ExecuTorch PTE files available yet. Check the model page for updates.",
      );
      return;
    }

    setDownloadingModels((prev) => new Set(prev).add(model.modelId));
    setDownloadProgress((prev) => new Map(prev).set(model.modelId, 0));

    try {
      // Simulate progress (actual implementation would track real download progress)
      const progressInterval = setInterval(() => {
        setDownloadProgress((prev) => {
          const current = prev.get(model.modelId) || 0;
          if (current >= 95) {
            clearInterval(progressInterval);
            return prev;
          }
          const next = new Map(prev);
          next.set(model.modelId, Math.min(95, current + Math.random() * 10));
          return next;
        });
      }, 500);

      const result = await ensureModelPresent(model);

      clearInterval(progressInterval);
      setDownloadProgress((prev) => new Map(prev).set(model.modelId, 100));

      const size = await getModelSize(model);

      // Save to database
      await modelSettings.addDownloadedModel({
        modelId: model.modelId,
        downloadedAt: Date.now(),
        ptePath: result.ptePath,
        tokenizerPath: result.tokenizerPath,
        tokenizerConfigPath: result.tokenizerConfigPath,
        size,
      });

      showToast(`${model.displayName} downloaded successfully`, "success");

      // Reload settings to update UI
      await loadSettings();
    } catch (error: unknown) {
      const err = error as { message?: string };
      showToast(err?.message || "Failed to download model", "error");
    } finally {
      setDownloadingModels((prev) => {
        const next = new Set(prev);
        next.delete(model.modelId);
        return next;
      });
      setDownloadProgress((prev) => {
        const next = new Map(prev);
        next.delete(model.modelId);
        return next;
      });
    }
  };

  const handleSelect = async (model: LlmModelConfig) => {
    try {
      await modelSettings.setSelectedModelId(model.modelId);
      setSelectedModelId(model.modelId);

      // Show loading state in the checkbox
      setLoadingModelId(model.modelId);

      // Reload model service with new model
      try {
        await reloadModel(model);
        showToast(`${model.displayName} is now active`, "success");
      } catch (error: unknown) {
        const err = error as { message?: string };
        showToast(
          `Failed to load ${model.displayName}: ${
            err?.message || "Unknown error"
          }`,
          "error",
        );
      } finally {
        setLoadingModelId(null);
      }
    } catch (_error) {
      showToast("Failed to select model", "error");
      setLoadingModelId(null);
    }
  };

  const handleRemove = async (model: LlmModelConfig) => {
    Alert.alert(
      "Remove Model",
      `Are you sure you want to remove ${model.displayName}? This will free up storage space but you'll need to download it again to use it.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteModel(model);
              await modelSettings.removeDownloadedModel(model.modelId);

              showToast(`${model.displayName} removed`, "success");

              // Reload settings
              await loadSettings();
            } catch (_error) {
              showToast("Failed to remove model", "error");
            }
          },
        },
      ],
    );
  };

  const handleViewDetails = (model: LlmModelConfig) => {
    if (model.huggingFaceUrl) {
      Linking.openURL(model.huggingFaceUrl);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={theme.colors.accent} />
      </View>
    );
  }

  const selectedModel = ALL_MODELS.find((m) => m.modelId === selectedModelId);

  // Hardcoded display order: alphabetical by family, then smallest to largest
  const MODEL_ORDER = [
    "llama-3.2-1b-instruct",
    "llama-3.2-3b-instruct",
    "qwen-3-0.6b",
    "qwen-3-1.7b",
    "qwen-3-4b",
    "smollm2-135m",
    "smollm2-360m",
    "smollm2-1.7b",
  ];
  const sortedModels = [...ALL_MODELS].sort((a, b) => {
    const indexA = MODEL_ORDER.indexOf(a.modelId);
    const indexB = MODEL_ORDER.indexOf(b.modelId);
    return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
  });

  return (
    <View style={styles.container}>
      {/* Collapsible Header */}
      <TouchableOpacity
        style={styles.collapseHeader}
        onPress={() => setIsExpanded(!isExpanded)}
        activeOpacity={0.7}
      >
        <View style={styles.collapseHeaderContent}>
          <Text
            variant="body"
            style={[styles.collapseTitle, { color: seasonalTheme.textPrimary }]}
          >
            {selectedModel
              ? `Active: ${selectedModel.displayName}`
              : "No model selected"}
          </Text>
          <Text
            variant="caption"
            style={[styles.expandIcon, { color: seasonalTheme.textSecondary }]}
          >
            {isExpanded ? "▼" : "▶"}
          </Text>
        </View>
      </TouchableOpacity>

      {/* Expanded Model List */}
      {isExpanded && (
        <>
          <Text
            variant="caption"
            style={[styles.description, { color: seasonalTheme.textSecondary }]}
          >
            Your device: {deviceTier}-end. Models marked "May crash" are not
            recommended.
          </Text>

          <View style={styles.modelsList}>
            {sortedModels.map((model) => (
              <ModelCard
                key={model.modelId}
                model={model}
                isDownloaded={downloadedModels.includes(model.modelId)}
                isSelected={selectedModelId === model.modelId}
                isDownloading={downloadingModels.has(model.modelId)}
                isLoading={loadingModelId === model.modelId}
                isNotRecommended={!compatibleModels.includes(model.modelId)}
                downloadProgress={downloadProgress.get(model.modelId)}
                onDownload={() => handleDownload(model)}
                onSelect={() => handleSelect(model)}
                onRemove={() => handleRemove(model)}
                onViewDetails={() => handleViewDetails(model)}
                downloadedSize={modelSizes.get(model.modelId)}
              />
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacingPatterns.xxs,
  },
  collapseHeader: {
    paddingVertical: spacingPatterns.xs,
  },
  collapseHeaderContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  collapseTitle: {
    flex: 1,
    fontWeight: "500",
    fontSize: 15,
  },
  expandIcon: {
    fontSize: 12,
    marginLeft: spacingPatterns.sm,
  },
  description: {
    marginTop: spacingPatterns.xs,
    marginBottom: spacingPatterns.sm,
    fontSize: 12,
  },
  loadingContainer: {
    padding: spacingPatterns.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  modelsList: {
    gap: spacingPatterns.xs,
  },
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
