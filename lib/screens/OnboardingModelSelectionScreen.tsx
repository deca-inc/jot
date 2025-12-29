import { Ionicons } from "@expo/vector-icons";
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ALL_MODELS } from "../ai/modelConfig";
import { ensureModelPresent } from "../ai/modelManager";
import { useTrackScreenView, useTrackEvent } from "../analytics";
import { Text } from "../components";
import { useModelSettings } from "../db/modelSettings";
import { spacingPatterns, borderRadius } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { useTheme } from "../theme/ThemeProvider";
import { getRecommendedModel, getCompatibleModels } from "../utils/deviceInfo";

interface OnboardingModelSelectionScreenProps {
  onContinue: () => void;
}

// Model sizes in MB (for analytics tracking)
const MODEL_SIZES: Record<string, number> = {
  "llama-3.2-1b-instruct": 1083,
  "llama-3.2-3b-instruct": 2435,
  "qwen-3-0.6b": 900,
  "qwen-3-1.7b": 2064,
  "qwen-3-4b": 3527,
};

// Model descriptions for display
const MODEL_DESCRIPTIONS: Record<string, string> = {
  "qwen-3-0.6b": "Fastest responses, smallest download",
  "llama-3.2-1b-instruct": "Good balance of speed and quality",
  "qwen-3-1.7b": "Best quality, great for complex tasks",
};

export function OnboardingModelSelectionScreen({
  onContinue,
}: OnboardingModelSelectionScreenProps) {
  const seasonalTheme = useSeasonalTheme();
  const theme = useTheme();
  const modelSettings = useModelSettings();

  const [compatibleModelIds, setCompatibleModelIds] = useState<string[]>([]);
  const [recommendedModelId, setRecommendedModelId] = useState<string>("");
  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);

  // Track screen view
  useTrackScreenView("Model Selection");
  const trackEvent = useTrackEvent();

  useEffect(() => {
    const loadModels = async () => {
      try {
        const [compatible, recommended] = await Promise.all([
          getCompatibleModels(),
          getRecommendedModel(),
        ]);
        setCompatibleModelIds(compatible);
        setRecommendedModelId(recommended);
        setSelectedModelId(recommended);
      } catch (error) {
        console.error("Error loading compatible models:", error);
        // Fallback to default
        const fallback = "qwen-3-0.6b";
        setCompatibleModelIds([fallback]);
        setRecommendedModelId(fallback);
        setSelectedModelId(fallback);
      } finally {
        setIsLoading(false);
      }
    };

    loadModels();
  }, []);

  const handleDownload = useCallback(async () => {
    if (!selectedModelId || isDownloading) return;

    try {
      setIsDownloading(true);

      const modelConfig = ALL_MODELS.find((m) => m.modelId === selectedModelId);
      if (!modelConfig) throw new Error("Model not found");

      // Set as selected model in settings immediately
      await modelSettings.setSelectedModelId(selectedModelId);

      // Track model selection
      trackEvent("model_selected_onboarding", {
        modelId: selectedModelId,
        wasRecommended: selectedModelId === recommendedModelId,
        modelSize: MODEL_SIZES[selectedModelId] || 0,
        autoSelected: false,
      });

      // Start the download in the background (don't await it)
      ensureModelPresent(modelConfig, (progress: number) => {
        console.log(`Model download progress: ${Math.round(progress * 100)}%`);
      }).catch((error) => {
        console.error("Error downloading model in background:", error);
      });

      // Continue to app immediately - download will happen in background
      onContinue();
    } catch (error) {
      console.error("Error setting up model download:", error);
      setIsDownloading(false);
      // Could show an alert here, but for now just let user try again
    }
  }, [
    selectedModelId,
    isDownloading,
    modelSettings,
    trackEvent,
    recommendedModelId,
    onContinue,
  ]);

  const formatSize = (mb: number) => {
    if (mb < 1024) return `${mb} MB`;
    const gb = mb / 1024;
    return `${gb.toFixed(1)} GB`;
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

  const compatibleModels = ALL_MODELS.filter((m) =>
    compatibleModelIds.includes(m.modelId),
  );

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
            These models are compatible with your device. We recommend the one
            selected below.
          </Text>
          <Text
            variant="body"
            style={[
              styles.subtitle,
              {
                color: seasonalTheme.textSecondary,
                marginTop: spacingPatterns.xs,
              },
            ]}
          >
            You can change this later in settings.
          </Text>
        </View>

        {/* Model list */}
        <View style={styles.modelList}>
          {compatibleModels.map((model) => {
            const isSelected = model.modelId === selectedModelId;
            const isRecommended = model.modelId === recommendedModelId;
            const size = MODEL_SIZES[model.modelId] || 0;
            const description =
              MODEL_DESCRIPTIONS[model.modelId] || model.description;

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
                      : seasonalTheme.textSecondary + "30",
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
            borderTopColor: seasonalTheme.textSecondary + "30",
          },
        ]}
      >
        <TouchableOpacity
          onPress={handleDownload}
          disabled={!selectedModelId || isDownloading}
          style={[
            styles.downloadButton,
            {
              backgroundColor: isDownloading
                ? seasonalTheme.textSecondary + "40"
                : theme.colors.accent,
              opacity: !selectedModelId || isDownloading ? 0.6 : 1,
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
              Start Download
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
  bottomContainer: {
    paddingHorizontal: spacingPatterns.screen,
    paddingTop: spacingPatterns.md,
    paddingBottom: spacingPatterns.md,
    borderTopWidth: 1,
  },
  downloadButton: {
    width: "100%",
    paddingVertical: spacingPatterns.md,
    paddingHorizontal: spacingPatterns.lg,
    borderRadius: borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
});
