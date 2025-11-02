import React, { useState, useRef } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Animated,
  TouchableOpacity,
} from "react-native";
import { Text, Button, Card } from "../components";
import { useTheme } from "../theme/ThemeProvider";
import { spacingPatterns, springPresets } from "../theme";

export function ComponentPlaygroundScreen() {
  const theme = useTheme();
  const [buttonLoading, setButtonLoading] = useState(false);

  // Animation demo values
  const scaleDemo = useRef(new Animated.Value(1)).current;
  const fadeDemo = useRef(new Animated.Value(1)).current;
  const slideDemo = useRef(new Animated.Value(0)).current;

  const triggerScaleDemo = () => {
    Animated.sequence([
      Animated.spring(scaleDemo, {
        toValue: 1.1,
        ...springPresets.feedback,
      }),
      Animated.spring(scaleDemo, {
        toValue: 1,
        ...springPresets.feedback,
      }),
    ]).start();
  };

  const triggerFadeDemo = () => {
    Animated.sequence([
      Animated.spring(fadeDemo, {
        toValue: 0.3,
        ...springPresets.gentle,
      }),
      Animated.spring(fadeDemo, {
        toValue: 1,
        ...springPresets.gentle,
      }),
    ]).start();
  };

  const triggerSlideDemo = () => {
    Animated.sequence([
      Animated.spring(slideDemo, {
        toValue: 20,
        ...springPresets.modal,
      }),
      Animated.spring(slideDemo, {
        toValue: 0,
        ...springPresets.modal,
      }),
    ]).start();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text variant="h1">Component Playground</Text>
        <Text variant="body" color="textSecondary">
          Test and iterate on UI components in isolation
        </Text>
      </View>

      {/* Typography Section */}
      <Card variant="outlined" style={styles.section}>
        <Text variant="h3" style={styles.sectionTitle}>
          Typography
        </Text>
        <View style={styles.componentGrid}>
          <Text variant="h1">Heading 1</Text>
          <Text variant="h2">Heading 2</Text>
          <Text variant="h3">Heading 3</Text>
          <Text variant="h4">Heading 4</Text>
          <Text variant="body">
            Body text - The quick brown fox jumps over the lazy dog
          </Text>
          <Text variant="bodyLarge">
            Body Large - The quick brown fox jumps over the lazy dog
          </Text>
          <Text variant="bodySmall">
            Body Small - The quick brown fox jumps over the lazy dog
          </Text>
          <Text variant="label">Label Text</Text>
          <Text variant="caption">Caption text</Text>
        </View>
      </Card>

      {/* Colors Section */}
      <Card variant="outlined" style={styles.section}>
        <Text variant="h3" style={styles.sectionTitle}>
          Text Colors
        </Text>
        <View style={styles.componentGrid}>
          <Text color="textPrimary">Primary Text</Text>
          <Text color="textSecondary">Secondary Text</Text>
          <Text color="textTertiary">Tertiary Text</Text>
          <Text color="primary">Primary Color</Text>
          <Text color="success">Success Color</Text>
          <Text color="error">Error Color</Text>
          <Text color="warning">Warning Color</Text>
        </View>
      </Card>

      {/* Buttons Section */}
      <Card variant="outlined" style={styles.section}>
        <Text variant="h3" style={styles.sectionTitle}>
          Buttons
        </Text>
        <View style={styles.componentGrid}>
          <Button variant="primary">Primary Button</Button>
          <Button variant="secondary">Secondary Button</Button>
          <Button variant="ghost">Ghost Button</Button>
          <Button variant="primary" size="sm">
            Small
          </Button>
          <Button variant="primary" size="md">
            Medium
          </Button>
          <Button variant="primary" size="lg">
            Large
          </Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
          <Button
            variant="primary"
            loading={buttonLoading}
            onPress={() => {
              setButtonLoading(true);
              setTimeout(() => setButtonLoading(false), 2000);
            }}
          >
            Loading State
          </Button>
        </View>
      </Card>

      {/* Cards Section */}
      <Card variant="outlined" style={styles.section}>
        <Text variant="h3" style={styles.sectionTitle}>
          Cards
        </Text>
        <View style={styles.componentGrid}>
          <Card variant="default" padding="md">
            <Text variant="body">Default Card</Text>
          </Card>
          <Card variant="elevated" padding="md">
            <Text variant="body">Elevated Card</Text>
          </Card>
          <Card variant="outlined" padding="md">
            <Text variant="body">Outlined Card</Text>
          </Card>
        </View>
      </Card>

      {/* Animations Section */}
      <Card variant="outlined" style={styles.section}>
        <Text variant="h3" style={styles.sectionTitle}>
          Spring Animations
        </Text>
        <Text
          variant="body"
          color="textSecondary"
          style={{ marginBottom: spacingPatterns.md }}
        >
          Subtle spring-based animations for premium feel. Tap to see them in
          action!
        </Text>
        <View style={styles.componentGrid}>
          <View>
            <Text variant="label" style={{ marginBottom: spacingPatterns.xs }}>
              Scale Animation
            </Text>
            <TouchableOpacity onPress={triggerScaleDemo} activeOpacity={0.7}>
              <Animated.View
                style={[
                  {
                    width: 100,
                    height: 100,
                    backgroundColor: theme.colors.primary,
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                  },
                  {
                    transform: [{ scale: scaleDemo }],
                  },
                ]}
              >
                <Text color="textInverse" variant="label">
                  Tap me!
                </Text>
              </Animated.View>
            </TouchableOpacity>
          </View>

          <View>
            <Text variant="label" style={{ marginBottom: spacingPatterns.xs }}>
              Fade Animation
            </Text>
            <TouchableOpacity onPress={triggerFadeDemo} activeOpacity={0.7}>
              <Animated.View
                style={[
                  {
                    width: 100,
                    height: 100,
                    backgroundColor: theme.colors.success,
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: fadeDemo,
                  },
                ]}
              >
                <Text color="textInverse" variant="label">
                  Tap me!
                </Text>
              </Animated.View>
            </TouchableOpacity>
          </View>

          <View>
            <Text variant="label" style={{ marginBottom: spacingPatterns.xs }}>
              Slide Animation
            </Text>
            <TouchableOpacity onPress={triggerSlideDemo} activeOpacity={0.7}>
              <Animated.View
                style={[
                  {
                    width: 100,
                    height: 100,
                    backgroundColor: theme.colors.warning,
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                    transform: [{ translateX: slideDemo }],
                  },
                ]}
              >
                <Text color="textInverse" variant="label">
                  Tap me!
                </Text>
              </Animated.View>
            </TouchableOpacity>
          </View>

          <View>
            <Text variant="label" style={{ marginBottom: spacingPatterns.xs }}>
              Button Press (built-in)
            </Text>
            <Text
              variant="caption"
              color="textSecondary"
              style={{ marginBottom: spacingPatterns.xs }}
            >
              Buttons have automatic spring scale on press
            </Text>
            <Button variant="primary" size="md">
              Try Pressing
            </Button>
          </View>

          <View>
            <Text variant="label" style={{ marginBottom: spacingPatterns.xs }}>
              Card Fade-in (built-in)
            </Text>
            <Text
              variant="caption"
              color="textSecondary"
              style={{ marginBottom: spacingPatterns.xs }}
            >
              Cards fade in on mount with spring animation
            </Text>
            <Card variant="elevated" padding="sm">
              <Text variant="caption">This card animated in</Text>
            </Card>
          </View>
        </View>
      </Card>

      {/* Spacing Examples */}
      <Card variant="outlined" style={styles.section}>
        <Text variant="h3" style={styles.sectionTitle}>
          Spacing
        </Text>
        <View style={styles.componentGrid}>
          <View
            style={{
              marginBottom: spacingPatterns.xs,
              backgroundColor: theme.colors.gray200,
              padding: spacingPatterns.xs,
            }}
          >
            <Text variant="caption">xs: {spacingPatterns.xs}px</Text>
          </View>
          <View
            style={{
              marginBottom: spacingPatterns.sm,
              backgroundColor: theme.colors.gray200,
              padding: spacingPatterns.sm,
            }}
          >
            <Text variant="caption">sm: {spacingPatterns.sm}px</Text>
          </View>
          <View
            style={{
              marginBottom: spacingPatterns.md,
              backgroundColor: theme.colors.gray200,
              padding: spacingPatterns.md,
            }}
          >
            <Text variant="caption">md: {spacingPatterns.md}px</Text>
          </View>
          <View
            style={{
              marginBottom: spacingPatterns.lg,
              backgroundColor: theme.colors.gray200,
              padding: spacingPatterns.lg,
            }}
          >
            <Text variant="caption">lg: {spacingPatterns.lg}px</Text>
          </View>
        </View>
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
    marginBottom: spacingPatterns.lg,
  },
  sectionTitle: {
    marginBottom: spacingPatterns.md,
  },
  componentGrid: {
    gap: spacingPatterns.md,
  },
});
