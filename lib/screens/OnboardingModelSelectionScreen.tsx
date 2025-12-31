import { Ionicons } from "@expo/vector-icons";
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ALL_MODELS } from "../ai/modelConfig";
import { ensureModelPresent } from "../ai/modelManager";
import { useTrackScreenView, useTrackEvent } from "../analytics";
import { Text } from "../components";
import { useModelSettings } from "../db/modelSettings";
import { spacingPatterns, borderRadius } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { useTheme } from "../theme/ThemeProvider";
import { getRecommendedModel, getCompatibleModels, logModelCompatibilityDebug } from "../utils/deviceInfo";

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
  "smollm2-135m": 535,
  "smollm2-360m": 1360,
  "smollm2-1.7b": 1220,
};

export function OnboardingModelSelectionScreen({
  onContinue,
}: OnboardingModelSelectionScreenProps) {
  const seasonalTheme = useSeasonalTheme();
  const theme = useTheme();
  const modelSettings = useModelSettings();
  const insets = useSafeAreaInsets();

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
        // Log detailed debug info about RAM and model compatibility
        await logModelCompatibilityDebug();

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
        const fallback = "smollm2-135m";
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
      ensureModelPresent(modelConfig).catch((error) => {
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
        edges={["top"]}
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
      edges={["top"]}
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
                  {model.description}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Fixed bottom buttons */}
      <View
        style={[
          styles.bottomContainer,
          {
            backgroundColor: seasonalTheme.gradient.middle,
            borderTopColor: seasonalTheme.textSecondary + "30",
            paddingBottom: Math.max(insets.bottom, spacingPatterns.sm),
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
        <TouchableOpacity
          onPress={onContinue}
          disabled={isDownloading}
          style={styles.skipButton}
          activeOpacity={0.7}
        >
          <Text
            variant="body"
            style={[styles.skipButtonText, { color: seasonalTheme.textSecondary }]}
          >
            Skip for now
          </Text>
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
    // paddingBottom is set dynamically based on safe area insets
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
  skipButton: {
    marginTop: spacingPatterns.xs,
    paddingVertical: spacingPatterns.xs,
    alignItems: "center",
  },
  skipButtonText: {
    fontSize: 15,
    fontWeight: "500",
  },
});
