import React from "react";
import { View, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { Text, Card, Button } from "../components";
import { useTheme } from "../theme/ThemeProvider";
import { spacingPatterns } from "../theme";
import { isComponentPlaygroundEnabled } from "../utils/isDev";

interface SettingsScreenProps {
  onNavigateToPlayground?: () => void;
}

export function SettingsScreen({
  onNavigateToPlayground,
}: SettingsScreenProps) {
  const theme = useTheme();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text variant="h1">Settings</Text>
      </View>

      <Card variant="outlined" style={styles.section}>
        <Text variant="h4" style={styles.sectionTitle}>
          General
        </Text>
        <Text
          variant="body"
          color="textSecondary"
          style={styles.sectionDescription}
        >
          General app settings and preferences
        </Text>
      </Card>

      {isComponentPlaygroundEnabled() && (
        <Card variant="outlined" style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionText}>
              <Text variant="h4" style={styles.sectionTitle}>
                Component Playground
              </Text>
              <Text
                variant="body"
                color="textSecondary"
                style={styles.sectionDescription}
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

      <Card variant="outlined" style={styles.section}>
        <Text variant="h4" style={styles.sectionTitle}>
          Encryption
        </Text>
        <Text
          variant="body"
          color="textSecondary"
          style={styles.sectionDescription}
        >
          Manage encryption settings and master key
        </Text>
        <Text variant="caption" color="textTertiary" style={styles.comingSoon}>
          Coming soon
        </Text>
      </Card>

      <Card variant="outlined" style={styles.section}>
        <Text variant="h4" style={styles.sectionTitle}>
          Backup
        </Text>
        <Text
          variant="body"
          color="textSecondary"
          style={styles.sectionDescription}
        >
          Configure backup providers and schedule
        </Text>
        <Text variant="caption" color="textTertiary" style={styles.comingSoon}>
          Coming soon
        </Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacingPatterns.screen,
  },
  header: {
    marginBottom: spacingPatterns.section,
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
  },
  comingSoon: {
    marginTop: spacingPatterns.sm,
    fontStyle: "italic",
  },
});
