import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "../components";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { spacingPatterns, borderRadius } from "../theme";
import { useTheme } from "../theme/ThemeProvider";
import { ALL_MODELS, LlmModelConfig } from "../ai/modelConfig";
import { getRecommendedModel } from "../utils/deviceInfo";
import { useModelSettings } from "../db/modelSettings";
import { ensureModelPresent } from "../ai/modelManager";

interface OnboardingModelSelectionScreenProps {
  onContinue: () => void;
}

// Model sizes in MB
const MODEL_SIZES: Record<string, number> = {
  "llama-3.2-1b-instruct": 1083,
  "llama-3.2-3b-instruct": 2435,
  "qwen-3-0.6b": 900,
  "qwen-3-1.7b": 2064,
  "qwen-3-4b": 3527,
};

// Simplified descriptions for onboarding
const MODEL_DESCRIPTIONS: Record<string, string> = {
  "llama-3.2-1b-instruct": "Fast responses, good for everyday use",
  "llama-3.2-3b-instruct": "Better quality, slightly slower",
  "qwen-3-0.6b": "Fastest, smallest download",
  "qwen-3-1.7b": "Great balance of speed and quality",
  "qwen-3-4b": "Best quality, largest download",
};

export function OnboardingModelSelectionScreen({
  onContinue,
}: OnboardingModelSelectionScreenProps) {
  const seasonalTheme = useSeasonalTheme();
  const theme = useTheme();
  const modelSettings = useModelSettings();
  
  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [recommendedModelId, setRecommendedModelId] = useState<string>("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadRecommendation = async () => {
      try {
        const recommended = await getRecommendedModel();
        setRecommendedModelId(recommended);
        setSelectedModelId(recommended);
      } catch (error) {
        console.error("Error getting recommended model:", error);
        // Fallback to default
        setRecommendedModelId("qwen-3-0.6b");
        setSelectedModelId("qwen-3-0.6b");
      } finally {
        setIsLoading(false);
      }
    };

    loadRecommendation();
  }, []);

  const formatSize = (mb: number) => {
    if (mb < 1024) return `${mb} MB`;
    const gb = mb / 1024;
    return `${gb.toFixed(1)} GB`;
  };

  const handleContinue = async () => {
    if (!selectedModelId) return;

    try {
      setIsDownloading(true);

      const modelConfig = ALL_MODELS.find((m) => m.modelId === selectedModelId);
      if (!modelConfig) throw new Error("Model not found");

      // Set as selected model in settings immediately
      await modelSettings.setSelectedModelId(selectedModelId);

      // Start the download in the background (don't await it)
      ensureModelPresent(
        modelConfig,
        (progress: number) => {
          console.log(`Model download progress: ${Math.round(progress * 100)}%`);
        }
      ).catch((error) => {
        console.error("Error downloading model in background:", error);
      });

      // Continue to app immediately - download will happen in background
      onContinue();
    } catch (error) {
      console.error("Error setting up model download:", error);
      setIsDownloading(false);
      // Could show an alert here, but for now just let user try again
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView
        style={[
          styles.container,
          { backgroundColor: seasonalTheme.gradient.middle },
        ]}
        edges={["top", "bottom"]}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[
        styles.container,
        { backgroundColor: seasonalTheme.gradient.middle },
      ]}
      edges={["top", "bottom"]}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text
            variant="h1"
            style={[styles.title, { color: seasonalTheme.textPrimary }]}
          >
            Choose your AI model
          </Text>
          <Text
            variant="body"
            style={[styles.subtitle, { color: seasonalTheme.textSecondary }]}
          >
            All models run completely offline on your device. You can change
            this later in settings.
          </Text>
        </View>

        {/* Model list - Qwen models first (better for on-device inference) */}
        <View style={styles.modelList}>
          {ALL_MODELS.filter((m) => m.available)
            .sort((a, b) => {
              // Qwen models first
              const aIsQwen = a.modelId.startsWith("qwen");
              const bIsQwen = b.modelId.startsWith("qwen");
              if (aIsQwen && !bIsQwen) return -1;
              if (!aIsQwen && bIsQwen) return 1;
              return 0;
            })
            .map((model) => {
            const isSelected = model.modelId === selectedModelId;
            const isRecommended = model.modelId === recommendedModelId;
            const size = MODEL_SIZES[model.modelId] || 0;
            const description = MODEL_DESCRIPTIONS[model.modelId] || model.description;

            return (
              <TouchableOpacity
                key={model.modelId}
                onPress={() => setSelectedModelId(model.modelId)}
                disabled={isDownloading}
                style={[
                  styles.modelCard,
                  {
                    backgroundColor: seasonalTheme.cardBg,
                    borderColor: isSelected
                      ? theme.colors.accent
                      : seasonalTheme.border,
                    borderWidth: isSelected ? 2 : 1,
                    opacity: isDownloading ? 0.6 : 1,
                  },
                ]}
              >
                {/* Selection indicator */}
                <View style={styles.modelCardHeader}>
                  <View style={styles.modelCardTitle}>
                    <Text
                      variant="h4"
                      style={[
                        styles.modelName,
                        { color: seasonalTheme.textPrimary },
                      ]}
                    >
                      {model.displayName}
                    </Text>
                    {isRecommended && (
                      <View
                        style={[
                          styles.recommendedBadge,
                          { backgroundColor: theme.colors.accentLight },
                        ]}
                      >
                        <Text
                          variant="caption"
                          style={[
                            styles.recommendedText,
                            { color: theme.colors.accent },
                          ]}
                        >
                          Recommended
                        </Text>
                      </View>
                    )}
                  </View>
                  {isSelected && (
                    <Ionicons
                      name="checkmark-circle"
                      size={24}
                      color={theme.colors.accent}
                    />
                  )}
                </View>

                {/* Model info */}
                <Text
                  variant="caption"
                  style={[
                    styles.modelSize,
                    { color: seasonalTheme.textSecondary },
                  ]}
                >
                  {model.size} • {formatSize(size)} download
                </Text>
                <Text
                  variant="body"
                  style={[
                    styles.modelDescription,
                    { color: seasonalTheme.textSecondary },
                  ]}
                >
                  {description}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

      </ScrollView>

      {/* Fixed bottom button */}
      <View
        style={[
          styles.bottomContainer,
          {
            backgroundColor: seasonalTheme.gradient.middle,
            borderTopColor: seasonalTheme.border,
          },
        ]}
      >
        <TouchableOpacity
          onPress={handleContinue}
          disabled={!selectedModelId || isDownloading}
          style={[
            styles.continueButton,
            {
              borderColor: seasonalTheme.textPrimary,
              opacity: !selectedModelId || isDownloading ? 0.4 : 1,
            },
          ]}
          activeOpacity={0.8}
        >
          {isDownloading ? (
            <ActivityIndicator size="small" color={seasonalTheme.textPrimary} />
          ) : (
            <Text
              variant="body"
              style={[styles.buttonText, { color: seasonalTheme.textPrimary }]}
            >
              Continue
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacingPatterns.screen,
    paddingTop: spacingPatterns.xl,
    paddingBottom: spacingPatterns.md,
  },
  header: {
    marginBottom: spacingPatterns.xl,
  },
  title: {
    marginBottom: spacingPatterns.sm,
  },
  subtitle: {
    lineHeight: 24,
  },
  modelList: {
    gap: spacingPatterns.md,
    marginBottom: spacingPatterns.xl,
  },
  modelCard: {
    padding: spacingPatterns.md,
    borderRadius: borderRadius.lg,
  },
  modelCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacingPatterns.xs,
  },
  modelCardTitle: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacingPatterns.sm,
  },
  modelName: {
    flex: 0,
  },
  recommendedBadge: {
    paddingHorizontal: spacingPatterns.sm,
    paddingVertical: spacingPatterns.xxs,
    borderRadius: borderRadius.sm,
  },
  recommendedText: {
    fontWeight: "600",
    fontSize: 11,
  },
  modelSize: {
    marginBottom: spacingPatterns.xs,
  },
  modelDescription: {
    lineHeight: 20,
  },
  progressContainer: {
    padding: spacingPatterns.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacingPatterns.md,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacingPatterns.sm,
  },
  progressText: {
    fontWeight: "500",
  },
  progressPercent: {
    fontWeight: "600",
  },
  progressBarBg: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  bottomContainer: {
    paddingHorizontal: spacingPatterns.screen,
    paddingTop: spacingPatterns.md,
    paddingBottom: spacingPatterns.md,
    borderTopWidth: 1,
  },
  continueButton: {
    width: "100%",
    paddingVertical: spacingPatterns.md,
    paddingHorizontal: spacingPatterns.lg,
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
});

