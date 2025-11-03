import React, { useState, useEffect } from "react";
import { View, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, Card, Button, ThemeControl } from "../components";
import { useTheme } from "../theme/ThemeProvider";
import { spacingPatterns, borderRadius } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { isComponentPlaygroundEnabled } from "../utils/isDev";

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        // Settings are now loaded by ThemeControl component
      } catch (error) {
        console.error("Error loading theme settings:", error);
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, []);

  if (loading) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + spacingPatterns.screen },
        ]}
      >
        <Text variant="body">Loading settings...</Text>
      </ScrollView>
    );
  }

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

        {isComponentPlaygroundEnabled() && (
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
            <View style={styles.sectionHeader}>
              <View style={styles.sectionText}>
                <Text
                  variant="h3"
                  style={[
                    styles.sectionTitle,
                    { color: seasonalTheme.textPrimary },
                  ]}
                >
                  Component Playground
                </Text>
                <Text
                  variant="body"
                  style={[
                    styles.sectionDescription,
                    { color: seasonalTheme.textSecondary },
                  ]}
                >
                  Test and iterate on UI components in isolation (Dev Only)
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
          </Card>
        )}

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
    marginBottom: spacingPatterns.md,
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
});
