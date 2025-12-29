import { Ionicons } from "@expo/vector-icons";
import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ALL_MODELS, type LlmModelConfig } from "../ai/modelConfig";
import { deleteModel } from "../ai/modelManager";
import { useTrackScreenView, useTrackEvent } from "../analytics";
import {
  Text,
  Card,
  Button,
  ThemeControl,
  ModelManagement,
  PendingDownloads,
} from "../components";
import { useModelSettings } from "../db/modelSettings";
import { useOnboardingSettings } from "../db/onboardingSettings";
import { useTelemetrySettings } from "../db/telemetrySettings";
import { spacingPatterns } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { useTheme } from "../theme/ThemeProvider";
import { isComponentPlaygroundEnabled } from "../utils/isDev";

interface SettingsScreenProps {
  onNavigateToPlayground?: () => void;
  onNavigateToQuillEditor?: () => void;
  onBack?: () => void;
}

export function SettingsScreen({
  onNavigateToPlayground,
  onNavigateToQuillEditor,
  onBack,
}: SettingsScreenProps) {
  const theme = useTheme();
  const seasonalTheme = useSeasonalTheme();
  const insets = useSafeAreaInsets();
  const modelSettings = useModelSettings();
  const onboardingSettings = useOnboardingSettings();
  const telemetrySettings = useTelemetrySettings();
  const [isRemovingAllModels, setIsRemovingAllModels] = useState(false);
  const [isResettingOnboarding, setIsResettingOnboarding] = useState(false);
  const [telemetryEnabled, setTelemetryEnabled] = useState<boolean | null>(
    null,
  );

  // Track screen view
  useTrackScreenView("Settings");
  const trackEvent = useTrackEvent();

  // Load telemetry settings
  useEffect(() => {
    const loadTelemetrySettings = async () => {
      const enabled = await telemetrySettings.isTelemetryEnabled();
      setTelemetryEnabled(enabled);
    };
    loadTelemetrySettings();
  }, [telemetrySettings]);

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
                  (m: LlmModelConfig) => m.modelId === downloadedModel.modelId,
                );
                if (modelConfig) {
                  await deleteModel(modelConfig);
                  await modelSettings.removeDownloadedModel(
                    modelConfig.modelId,
                  );
                }
              }

              setIsRemovingAllModels(false);

              Alert.alert(
                "Success",
                `Removed ${downloadedModels.length} model(s) successfully.`,
                [{ text: "OK" }],
              );
            } catch (error) {
              setIsRemovingAllModels(false);
              console.error("Error removing all models:", error);
              Alert.alert(
                "Error",
                "Failed to remove all models. Please try again or remove them individually.",
                [{ text: "OK" }],
              );
            }
          },
        },
      ],
    );
  };

  const handleResetOnboarding = async () => {
    Alert.alert(
      "Reset Onboarding?",
      "This will reset the onboarding flow. The next time you restart the app, you'll see the welcome screens again.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            try {
              setIsResettingOnboarding(true);

              // Reset onboarding settings
              await onboardingSettings.setSettings({
                hasCompletedOnboarding: false,
              });

              setIsResettingOnboarding(false);

              Alert.alert(
                "Success",
                "Onboarding has been reset. Restart the app to see the welcome screens again.",
                [{ text: "OK" }],
              );
            } catch (error) {
              setIsResettingOnboarding(false);
              console.error("Error resetting onboarding:", error);
              Alert.alert(
                "Error",
                "Failed to reset onboarding. Please try again.",
                [{ text: "OK" }],
              );
            }
          },
        },
      ],
    );
  };

  const handleTelemetryToggle = async () => {
    try {
      const newValue = !telemetryEnabled;
      setTelemetryEnabled(newValue);
      await telemetrySettings.setTelemetryEnabled(newValue);

      // Track telemetry toggle (will only send if currently enabled)
      trackEvent("telemetry_toggled", { enabled: newValue });
    } catch (error) {
      console.error("Error toggling telemetry:", error);
      // Revert the local state if the save failed
      setTelemetryEnabled(!telemetryEnabled);
      Alert.alert(
        "Error",
        "Failed to update telemetry setting. Please try again.",
        [{ text: "OK" }],
      );
    }
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
                <Ionicons
                  name="arrow-back"
                  size={24}
                  color={seasonalTheme.textPrimary}
                />
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

          {/* Pending Downloads */}
          <View style={styles.pendingDownloadsContainer}>
            <PendingDownloads />
          </View>

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
            Privacy
          </Text>
          <Text
            variant="body"
            style={[
              styles.sectionDescription,
              { color: seasonalTheme.textSecondary },
            ]}
          >
            Control your data and privacy preferences
          </Text>

          <View style={styles.settingRow}>
            <View style={styles.settingRowContent}>
              <Text
                variant="body"
                style={[
                  styles.settingRowTitle,
                  { color: seasonalTheme.textPrimary },
                ]}
              >
                App Telemetry
              </Text>
              <Text
                variant="caption"
                style={[
                  styles.settingRowDescription,
                  { color: seasonalTheme.textSecondary },
                ]}
              >
                Help improve the app by sharing anonymous usage data. We will
                never collect your journal entries, personal content, or AI
                conversations - that completely goes against the purpose of this
                app.
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleTelemetryToggle}
              style={[
                styles.toggle,
                {
                  backgroundColor: telemetryEnabled
                    ? seasonalTheme.textPrimary + "20"
                    : seasonalTheme.textSecondary + "20",
                  borderWidth: 1.5,
                  borderColor: telemetryEnabled
                    ? seasonalTheme.textPrimary
                    : seasonalTheme.textSecondary + "40",
                },
              ]}
              activeOpacity={0.8}
            >
              <View
                style={[
                  styles.toggleThumb,
                  {
                    backgroundColor: telemetryEnabled
                      ? seasonalTheme.textPrimary
                      : seasonalTheme.textSecondary,
                    transform: [{ translateX: telemetryEnabled ? 20 : 0 }],
                  },
                ]}
              />
            </TouchableOpacity>
          </View>
        </Card>

        {/* Links Section */}
        <View style={styles.linksSection}>
          <TouchableOpacity
            style={styles.linkItem}
            onPress={() => Linking.openURL("https://jot-ai.app")}
            activeOpacity={0.7}
          >
            <Text
              variant="body"
              style={[styles.linkText, { color: seasonalTheme.textSecondary }]}
            >
              About
            </Text>
            <Ionicons
              name="open-outline"
              size={16}
              color={seasonalTheme.textSecondary}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkItem}
            onPress={() => Linking.openURL("https://jot.canny.io/features-bugs")}
            activeOpacity={0.7}
          >
            <Text
              variant="body"
              style={[styles.linkText, { color: seasonalTheme.textSecondary }]}
            >
              Features & Feedback
            </Text>
            <Ionicons
              name="open-outline"
              size={16}
              color={seasonalTheme.textSecondary}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkItem}
            onPress={() => Linking.openURL("https://jot-ai.app/terms")}
            activeOpacity={0.7}
          >
            <Text
              variant="body"
              style={[styles.linkText, { color: seasonalTheme.textSecondary }]}
            >
              Terms & Conditions
            </Text>
            <Ionicons
              name="open-outline"
              size={16}
              color={seasonalTheme.textSecondary}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkItem}
            onPress={() => Linking.openURL("https://jot-ai.app/privacy")}
            activeOpacity={0.7}
          >
            <Text
              variant="body"
              style={[styles.linkText, { color: seasonalTheme.textSecondary }]}
            >
              Privacy Policy
            </Text>
            <Ionicons
              name="open-outline"
              size={16}
              color={seasonalTheme.textSecondary}
            />
          </TouchableOpacity>
        </View>

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

            {/* Quill Editor Test */}
            <View style={[styles.adminItem, styles.adminItemFirst]}>
              <View style={styles.sectionText}>
                <Text
                  variant="body"
                  style={[
                    styles.adminItemTitle,
                    { color: seasonalTheme.textPrimary },
                  ]}
                >
                  Quill Editor Test
                </Text>
                <Text
                  variant="caption"
                  style={[
                    styles.adminItemDescription,
                    { color: seasonalTheme.textSecondary },
                  ]}
                >
                  Test WebView-based rich text editor
                </Text>
              </View>
              <Button
                variant="secondary"
                size="sm"
                label="Open Quill Editor"
                onPress={onNavigateToQuillEditor}
              >
                Open
              </Button>
            </View>

            {/* Component Playground */}
            <View style={styles.adminItem}>
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
                label="Open Component Playground"
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
                label="Remove All Models"
                metadata={{ action: "remove_all_models" }}
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

            {/* Reset Onboarding */}
            <View style={styles.adminItem}>
              <View style={styles.sectionText}>
                <Text
                  variant="body"
                  style={[
                    styles.adminItemTitle,
                    { color: seasonalTheme.textPrimary },
                  ]}
                >
                  Reset Onboarding
                </Text>
                <Text
                  variant="caption"
                  style={[
                    styles.adminItemDescription,
                    { color: seasonalTheme.textSecondary },
                  ]}
                >
                  Show welcome screens again on restart
                </Text>
              </View>
              <Button
                variant="secondary"
                size="sm"
                label="Reset Onboarding"
                metadata={{ action: "reset_onboarding" }}
                onPress={handleResetOnboarding}
                disabled={isResettingOnboarding}
              >
                {isResettingOnboarding ? (
                  <ActivityIndicator size="small" color={theme.colors.accent} />
                ) : (
                  "Reset"
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
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacingPatterns.xs,
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
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacingPatterns.md,
  },
  settingRowContent: {
    flex: 1,
    marginRight: spacingPatterns.md,
  },
  settingRowTitle: {
    fontWeight: "500",
    marginBottom: spacingPatterns.xxs,
  },
  settingRowDescription: {
    fontSize: 12,
    lineHeight: 16,
  },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    padding: 4,
    justifyContent: "center",
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  pendingDownloadsContainer: {
    marginTop: spacingPatterns.md,
  },
  linksSection: {
    marginTop: spacingPatterns.lg,
    marginBottom: spacingPatterns.md,
    alignItems: "center",
  },
  linkItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 40,
    paddingHorizontal: spacingPatterns.md,
    gap: spacingPatterns.xs,
  },
  linkText: {
    fontSize: 14,
  },
});
