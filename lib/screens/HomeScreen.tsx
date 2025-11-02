import React from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import { Text, Button, Card } from "../components";
import { useTheme } from "../theme/ThemeProvider";
import { spacingPatterns } from "../theme";

export function HomeScreen() {
  const theme = useTheme();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text variant="h1" style={styles.title}>
          Journal
        </Text>
        <Text variant="body" color="textSecondary" style={styles.subtitle}>
          Your private journaling space
        </Text>
      </View>

      <Card variant="elevated" style={styles.welcomeCard}>
        <Text variant="h3" style={styles.welcomeTitle}>
          Welcome
        </Text>
        <Text variant="body" color="textSecondary" style={styles.welcomeText}>
          Start by creating your first entry or exploring the app.
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
  title: {
    marginBottom: spacingPatterns.xs,
  },
  subtitle: {
    marginTop: 0,
  },
  welcomeCard: {
    marginTop: spacingPatterns.md,
  },
  welcomeTitle: {
    marginBottom: spacingPatterns.sm,
  },
  welcomeText: {
    marginTop: spacingPatterns.xs,
  },
});
