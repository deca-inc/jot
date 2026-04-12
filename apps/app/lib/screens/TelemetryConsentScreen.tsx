import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { View, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTrackScreenView } from "../analytics";
import { Text } from "../components";
import { useTelemetrySettings } from "../db/telemetrySettings";
import { useIsWideScreen } from "../hooks/useIsWideScreen";
import { spacingPatterns, borderRadius } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { useTheme } from "../theme/ThemeProvider";

interface TelemetryConsentScreenProps {
  onContinue: () => void;
}

export function TelemetryConsentScreen({
  onContinue,
}: TelemetryConsentScreenProps) {
  const seasonalTheme = useSeasonalTheme();
  const theme = useTheme();
  const telemetrySettings = useTelemetrySettings();
  const isWide = useIsWideScreen();

  // Track screen view (won't send yet as telemetry not enabled)
  useTrackScreenView("Telemetry Consent");

  const handleChoice = async (enabled: boolean) => {
    await telemetrySettings.setTelemetryEnabled(enabled);
    // Note: First telemetry event will be sent after this choice is made
    onContinue();
  };

  const iconSize = isWide ? 32 : 48;
  const bulletIconSize = isWide ? 18 : 20;

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
        contentContainerStyle={[styles.content, isWide && styles.contentWide]}
      >
        <View style={isWide ? styles.innerWide : undefined}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Ionicons
                name="analytics-outline"
                size={iconSize}
                color={seasonalTheme.textPrimary}
              />
            </View>

            <Text
              variant={isWide ? "h2" : "h1"}
              style={[styles.title, { color: seasonalTheme.textPrimary }]}
            >
              Help us improve
            </Text>
            <Text
              variant={isWide ? "bodySmall" : "body"}
              style={[styles.subtitle, { color: seasonalTheme.textSecondary }]}
            >
              We'd like to collect anonymous usage data to make the app better
              for everyone. We will never collect your journal entries, personal
              content, or AI conversations - that completely goes against the
              purpose of this app.
            </Text>
          </View>

          {/* What we collect section */}
          <View
            style={[
              styles.infoCard,
              {
                backgroundColor: seasonalTheme.cardBg,
                borderColor: seasonalTheme.textSecondary + "30",
              },
            ]}
          >
            <Text
              variant={isWide ? "body" : "h4"}
              style={[
                styles.infoTitle,
                { color: seasonalTheme.textPrimary, fontWeight: "600" },
              ]}
            >
              What we collect:
            </Text>

            <View style={styles.bulletList}>
              <View style={styles.bulletItem}>
                <Ionicons
                  name="checkmark-circle"
                  size={bulletIconSize}
                  color={theme.colors.accent}
                  style={styles.bulletIcon}
                />
                <Text
                  variant={isWide ? "bodySmall" : "body"}
                  style={[
                    styles.bulletText,
                    { color: seasonalTheme.textSecondary },
                  ]}
                >
                  App usage patterns and feature interactions
                </Text>
              </View>

              <View style={styles.bulletItem}>
                <Ionicons
                  name="checkmark-circle"
                  size={bulletIconSize}
                  color={theme.colors.accent}
                  style={styles.bulletIcon}
                />
                <Text
                  variant={isWide ? "bodySmall" : "body"}
                  style={[
                    styles.bulletText,
                    { color: seasonalTheme.textSecondary },
                  ]}
                >
                  Performance metrics and crash reports
                </Text>
              </View>

              <View style={styles.bulletItem}>
                <Ionicons
                  name="checkmark-circle"
                  size={bulletIconSize}
                  color={theme.colors.accent}
                  style={styles.bulletIcon}
                />
                <Text
                  variant={isWide ? "bodySmall" : "body"}
                  style={[
                    styles.bulletText,
                    { color: seasonalTheme.textSecondary },
                  ]}
                >
                  Device type and operating system version
                </Text>
              </View>
            </View>
          </View>

          {/* What we don't collect section */}
          <View
            style={[
              styles.infoCard,
              {
                backgroundColor: seasonalTheme.cardBg,
                borderColor: seasonalTheme.textSecondary + "30",
              },
            ]}
          >
            <Text
              variant={isWide ? "body" : "h4"}
              style={[
                styles.infoTitle,
                { color: seasonalTheme.textPrimary, fontWeight: "600" },
              ]}
            >
              What we don't collect:
            </Text>

            <View style={styles.bulletList}>
              <View style={styles.bulletItem}>
                <Ionicons
                  name="close-circle"
                  size={bulletIconSize}
                  color={seasonalTheme.textSecondary}
                  style={styles.bulletIcon}
                />
                <Text
                  variant={isWide ? "bodySmall" : "body"}
                  style={[
                    styles.bulletText,
                    { color: seasonalTheme.textSecondary },
                  ]}
                >
                  Your journal entries or personal content
                </Text>
              </View>

              <View style={styles.bulletItem}>
                <Ionicons
                  name="close-circle"
                  size={bulletIconSize}
                  color={seasonalTheme.textSecondary}
                  style={styles.bulletIcon}
                />
                <Text
                  variant={isWide ? "bodySmall" : "body"}
                  style={[
                    styles.bulletText,
                    { color: seasonalTheme.textSecondary },
                  ]}
                >
                  Personally identifiable information
                </Text>
              </View>

              <View style={styles.bulletItem}>
                <Ionicons
                  name="close-circle"
                  size={bulletIconSize}
                  color={seasonalTheme.textSecondary}
                  style={styles.bulletIcon}
                />
                <Text
                  variant={isWide ? "bodySmall" : "body"}
                  style={[
                    styles.bulletText,
                    { color: seasonalTheme.textSecondary },
                  ]}
                >
                  AI conversations or prompts
                </Text>
              </View>
            </View>
          </View>

          <Text
            variant="caption"
            style={[styles.disclaimer, { color: seasonalTheme.textSecondary }]}
          >
            You can change this setting anytime in Settings.
          </Text>
        </View>
      </ScrollView>

      {/* Fixed bottom buttons */}
      <View
        style={[
          styles.bottomContainer,
          {
            backgroundColor: seasonalTheme.gradient.middle,
            borderTopColor: seasonalTheme.textSecondary + "30",
          },
        ]}
      >
        <View style={[styles.buttonRow, isWide && styles.buttonRowWide]}>
          <TouchableOpacity
            onPress={() => handleChoice(false)}
            style={[
              styles.button,
              styles.secondaryButton,
              isWide && styles.buttonWide,
              {
                borderColor: seasonalTheme.textSecondary + "40",
              },
            ]}
            activeOpacity={0.8}
          >
            <Text
              variant="body"
              style={[
                styles.buttonText,
                isWide && styles.buttonTextWide,
                { color: seasonalTheme.textPrimary },
              ]}
            >
              No Thanks
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => handleChoice(true)}
            style={[
              styles.button,
              styles.primaryButton,
              isWide && styles.buttonWide,
              {
                borderColor: seasonalTheme.textPrimary,
              },
            ]}
            activeOpacity={0.8}
          >
            <Text
              variant="body"
              style={[
                styles.buttonText,
                isWide && styles.buttonTextWide,
                { color: seasonalTheme.textPrimary },
              ]}
            >
              Enable
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacingPatterns.screen,
    paddingTop: spacingPatterns.xl,
    paddingBottom: spacingPatterns.md,
  },
  contentWide: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  innerWide: {
    maxWidth: 520,
    width: "100%",
  },
  header: {
    marginBottom: spacingPatterns.xl,
    alignItems: "center",
  },
  iconContainer: {
    marginBottom: spacingPatterns.lg,
  },
  title: {
    marginBottom: spacingPatterns.sm,
    textAlign: "center",
  },
  subtitle: {
    lineHeight: 24,
    textAlign: "center",
  },
  infoCard: {
    padding: spacingPatterns.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginBottom: spacingPatterns.md,
  },
  infoTitle: {
    marginBottom: spacingPatterns.sm,
  },
  bulletList: {
    gap: spacingPatterns.sm,
  },
  bulletItem: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  bulletIcon: {
    marginRight: spacingPatterns.sm,
    marginTop: 2,
  },
  bulletText: {
    flex: 1,
    lineHeight: 20,
  },
  disclaimer: {
    textAlign: "center",
    lineHeight: 18,
    marginTop: spacingPatterns.lg,
  },
  bottomContainer: {
    paddingHorizontal: spacingPatterns.screen,
    paddingTop: spacingPatterns.md,
    paddingBottom: spacingPatterns.md,
    borderTopWidth: 1,
  },
  buttonRow: {
    flexDirection: "row",
    gap: spacingPatterns.sm,
  },
  buttonRowWide: {
    maxWidth: 520,
    alignSelf: "center",
    width: "100%",
  },
  button: {
    flex: 1,
    paddingVertical: spacingPatterns.md,
    paddingHorizontal: spacingPatterns.md,
    borderRadius: borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonWide: {
    paddingVertical: spacingPatterns.sm,
  },
  secondaryButton: {
    borderWidth: 1.5,
  },
  primaryButton: {
    borderWidth: 1.5,
  },
  buttonText: {
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  buttonTextWide: {
    fontSize: 15,
  },
});
