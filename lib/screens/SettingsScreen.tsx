import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Text,
  Card,
  Button,
  ThemeControl,
  ModelManagement,
} from "../components";
import { useTheme } from "../theme/ThemeProvider";
import { spacingPatterns, borderRadius } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { isComponentPlaygroundEnabled } from "../utils/isDev";
import { deleteModel } from "../ai/modelManager";
import { useModelSettings } from "../db/modelSettings";
import { ALL_MODELS, type LlmModelConfig } from "../ai/modelConfig";

interface SettingsScreenProps {
  onNavigateToPlayground?: () => void;
  onBack?: () => void;
}

export function SettingsScreen({
  onNavigateToPlayground,
  onBack,
}: SettingsScreenProps) {
  const theme = useTheme();
  const seasonalTheme = useSeasonalTheme();
  const insets = useSafeAreaInsets();
  const modelSettings = useModelSettings();
  const [isRemovingAllModels, setIsRemovingAllModels] = useState(false);

  const handleRemoveAllModels = async () => {
    Alert.alert(
      "Remove All Models?",
      "This will delete all downloaded AI models from your device. You will need to re-download them to use AI features. This action cannot be undone.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Remove All",
          style: "destructive",
          onPress: async () => {
            try {
              setIsRemovingAllModels(true);

              // Get all downloaded models
              const downloadedModels =
                await modelSettings.getDownloadedModels();

              // Delete each model
              for (const downloadedModel of downloadedModels) {
                const modelConfig = ALL_MODELS.find(
                  (m: LlmModelConfig) => m.modelId === downloadedModel.modelId
                );
                if (modelConfig) {
                  await deleteModel(modelConfig);
                  await modelSettings.removeDownloadedModel(
                    modelConfig.modelId
                  );
                }
              }

              setIsRemovingAllModels(false);

              Alert.alert(
                "Success",
                `Removed ${downloadedModels.length} model(s) successfully.`,
                [{ text: "OK" }]
              );
            } catch (error) {
              setIsRemovingAllModels(false);
              console.error("Error removing all models:", error);
              Alert.alert(
                "Error",
                "Failed to remove all models. Please try again or remove them individually.",
                [{ text: "OK" }]
              );
            }
          },
        },
      ]
    );
  };

  // Show UI shell immediately - settings are loaded by ThemeControl component
  return (
    <View
      style={[
        styles.gradient,
        { backgroundColor: seasonalTheme.gradient.middle },
      ]}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + spacingPatterns.screen },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.headerTop}>
            {onBack && (
              <TouchableOpacity onPress={onBack} style={styles.backButton}>
                <Text
                  variant="label"
                  style={[
                    styles.backButtonText,
                    { color: seasonalTheme.textPrimary },
                  ]}
                >
                  ← Back
                </Text>
              </TouchableOpacity>
            )}
            <Text
              variant="h1"
              style={[
                onBack && styles.headerWithBack,
                { color: seasonalTheme.textPrimary },
              ]}
            >
              Settings
            </Text>
          </View>
        </View>

        <Card
          variant="borderless"
          style={[
            styles.section,
            {
              backgroundColor: seasonalTheme.cardBg,
              shadowColor: seasonalTheme.subtleGlow.shadowColor,
              shadowOpacity: seasonalTheme.subtleGlow.shadowOpacity,
            },
          ]}
        >
          <Text
            variant="h3"
            style={[styles.sectionTitle, { color: seasonalTheme.textPrimary }]}
          >
            Theme
          </Text>
          <Text
            variant="body"
            style={[
              styles.sectionDescription,
              { color: seasonalTheme.textSecondary },
            ]}
          >
            Customize the app's seasonal theme
          </Text>

          <ThemeControl />
        </Card>

        <Card
          variant="borderless"
          style={[
            styles.section,
            {
              backgroundColor: seasonalTheme.cardBg,
              shadowColor: seasonalTheme.subtleGlow.shadowColor,
              shadowOpacity: seasonalTheme.subtleGlow.shadowOpacity,
            },
          ]}
        >
          <Text
            variant="h3"
            style={[styles.sectionTitle, { color: seasonalTheme.textPrimary }]}
          >
            AI Models
          </Text>
          <Text
            variant="body"
            style={[
              styles.sectionDescription,
              { color: seasonalTheme.textSecondary },
            ]}
          >
            Manage on-device AI models
          </Text>

          <ModelManagement />
        </Card>

        <Card
          variant="borderless"
          style={[
            styles.section,
            {
              backgroundColor: seasonalTheme.cardBg,
              shadowColor: seasonalTheme.subtleGlow.shadowColor,
              shadowOpacity: seasonalTheme.subtleGlow.shadowOpacity,
            },
          ]}
        >
          <Text
            variant="h3"
            style={[styles.sectionTitle, { color: seasonalTheme.textPrimary }]}
          >
            General
          </Text>
          <Text
            variant="body"
            style={[
              styles.sectionDescription,
              { color: seasonalTheme.textSecondary },
            ]}
          >
            General app settings and preferences
          </Text>
        </Card>

        <Card
          variant="borderless"
          style={[
            styles.section,
            {
              backgroundColor: seasonalTheme.cardBg,
              shadowColor: seasonalTheme.subtleGlow.shadowColor,
              shadowOpacity: seasonalTheme.subtleGlow.shadowOpacity,
            },
          ]}
        >
          <Text
            variant="h3"
            style={[styles.sectionTitle, { color: seasonalTheme.textPrimary }]}
          >
            Encryption
          </Text>
          <Text
            variant="body"
            style={[
              styles.sectionDescription,
              { color: seasonalTheme.textSecondary },
            ]}
          >
            Manage encryption settings and master key
          </Text>
          <Text
            variant="caption"
            style={[styles.comingSoon, { color: seasonalTheme.textSecondary }]}
          >
            Coming soon
          </Text>
        </Card>

        <Card
          variant="borderless"
          style={[
            styles.section,
            {
              backgroundColor: seasonalTheme.cardBg,
              shadowColor: seasonalTheme.subtleGlow.shadowColor,
              shadowOpacity: seasonalTheme.subtleGlow.shadowOpacity,
            },
          ]}
        >
          <Text
            variant="h3"
            style={[styles.sectionTitle, { color: seasonalTheme.textPrimary }]}
          >
            Backup
          </Text>
          <Text
            variant="body"
            style={[
              styles.sectionDescription,
              { color: seasonalTheme.textSecondary },
            ]}
          >
            Configure backup providers and schedule
          </Text>
          <Text
            variant="caption"
            style={[styles.comingSoon, { color: seasonalTheme.textSecondary }]}
          >
            Coming soon
          </Text>
        </Card>

        {/* Admin Section - Dev Only */}
        {isComponentPlaygroundEnabled() && (
          <Card
            variant="borderless"
            style={[
              styles.section,
              styles.adminSection,
              {
                backgroundColor: seasonalTheme.cardBg,
                shadowColor: seasonalTheme.subtleGlow.shadowColor,
                shadowOpacity: seasonalTheme.subtleGlow.shadowOpacity,
                borderColor: "#FF6B6B40",
              },
            ]}
          >
            <Text
              variant="h3"
              style={[
                styles.sectionTitle,
                { color: seasonalTheme.textPrimary },
              ]}
            >
              🔧 Admin (Dev Only)
            </Text>
            <Text
              variant="body"
              style={[
                styles.sectionDescription,
                { color: seasonalTheme.textSecondary },
              ]}
            >
              Developer tools and utilities
            </Text>

            {/* Component Playground */}
            <View style={[styles.adminItem, styles.adminItemFirst]}>
              <View style={styles.sectionText}>
                <Text
                  variant="body"
                  style={[
                    styles.adminItemTitle,
                    { color: seasonalTheme.textPrimary },
                  ]}
                >
                  Component Playground
                </Text>
                <Text
                  variant="caption"
                  style={[
                    styles.adminItemDescription,
                    { color: seasonalTheme.textSecondary },
                  ]}
                >
                  Test UI components in isolation
                </Text>
              </View>
              <Button
                variant="secondary"
                size="sm"
                onPress={onNavigateToPlayground}
              >
                Open
              </Button>
            </View>

            {/* Remove All Models */}
            <View style={styles.adminItem}>
              <View style={styles.sectionText}>
                <Text
                  variant="body"
                  style={[
                    styles.adminItemTitle,
                    { color: seasonalTheme.textPrimary },
                  ]}
                >
                  Remove All Models
                </Text>
                <Text
                  variant="caption"
                  style={[
                    styles.adminItemDescription,
                    { color: seasonalTheme.textSecondary },
                  ]}
                >
                  Delete all downloaded AI models
                </Text>
              </View>
              <Button
                variant="secondary"
                size="sm"
                onPress={handleRemoveAllModels}
                disabled={isRemovingAllModels}
              >
                {isRemovingAllModels ? (
                  <ActivityIndicator size="small" color={theme.colors.accent} />
                ) : (
                  "Remove All"
                )}
              </Button>
            </View>
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: spacingPatterns.screen,
  },
  header: {
    marginBottom: spacingPatterns.section,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacingPatterns.md,
  },
  headerWithBack: {
    flex: 1,
  },
  backButton: {
    paddingVertical: spacingPatterns.xs,
    paddingHorizontal: spacingPatterns.sm,
  },
  backButtonText: {
    fontSize: 16,
  },
  section: {
    marginBottom: spacingPatterns.md,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  sectionText: {
    flex: 1,
    marginRight: spacingPatterns.md,
  },
  sectionTitle: {
    marginBottom: spacingPatterns.xs,
  },
  sectionDescription: {
    marginTop: spacingPatterns.xs,
    marginBottom: spacingPatterns.xxs,
  },
  subsectionTitle: {
    marginTop: spacingPatterns.md,
    marginBottom: spacingPatterns.xs,
    fontSize: 18, // Slightly smaller than h4
    fontWeight: "500",
  },
  comingSoon: {
    marginTop: spacingPatterns.sm,
    fontStyle: "italic",
  },
  adminSection: {
    borderWidth: 2,
    borderStyle: "dashed",
  },
  adminItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: spacingPatterns.md,
    borderTopWidth: 1,
    borderTopColor: "#00000010",
  },
  adminItemFirst: {
    marginTop: spacingPatterns.md,
  },
  adminItemTitle: {
    fontWeight: "500",
    marginBottom: spacingPatterns.xxs,
  },
  adminItemDescription: {
    fontSize: 12,
  },
});
