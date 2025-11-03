import React, { useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Animated,
  TouchableOpacity,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Text, Button } from "../components";
import { useTheme } from "../theme/ThemeProvider";
import { spacingPatterns, borderRadius, springPresets } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { Entry, extractPreviewText, useEntryRepository } from "../db/entries";

export interface EntryDetailScreenProps {
  entryId: number;
  onBack: () => void;
  // Animation data from the tapped list item
  animationData?: {
    titleLayout: { x: number; y: number; width: number; height: number };
    previewLayout?: { x: number; y: number; width: number; height: number };
  };
}

export function EntryDetailScreen({
  entryId,
  onBack,
  animationData,
}: EntryDetailScreenProps) {
  const theme = useTheme();
  const seasonalTheme = useSeasonalTheme();
  const insets = useSafeAreaInsets();
  const [entry, setEntry] = React.useState<Entry | null>(null);
  const entryRepository = useEntryRepository();

  // Animation values - initialize based on whether we have animation data
  const hasAnimationData = !!animationData;
  // Start with initial values that will be set before animation begins
  const titleOpacity = useRef(new Animated.Value(hasAnimationData ? 0 : 1)).current;
  const titleTranslateY = useRef(new Animated.Value(0)).current;
  const titleScale = useRef(new Animated.Value(hasAnimationData ? 0.85 : 1)).current;
  const titleRotateX = useRef(new Animated.Value(hasAnimationData ? -90 : 0)).current;
  const previewOpacity = useRef(
    new Animated.Value(hasAnimationData && animationData?.previewLayout ? 0 : 1)
  ).current;
  const previewTranslateY = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(hasAnimationData ? 0 : 1)).current;
  const backgroundOpacity = useRef(new Animated.Value(hasAnimationData ? 0 : 1)).current;

  // Refs for measuring final positions
  const titleRef = useRef<View>(null);
  const previewRef = useRef<View>(null);
  
  // Refs for tracking animation state
  const layoutCompleteRef = useRef(false);
  const measurementsCompleteRef = useRef({
    title: false,
    preview: !animationData?.previewLayout,
  });

  useEffect(() => {
    const loadEntry = async () => {
      const loaded = await entryRepository.getById(entryId);
      if (loaded) {
        setEntry(loaded);
      }
    };
    loadEntry();
  }, [entryId, entryRepository]);

  const checkAndStartBackground = React.useCallback(() => {
    if (layoutCompleteRef.current) return;
    
    const { title, preview } = measurementsCompleteRef.current;
    if (!title || !preview) return;
    
    layoutCompleteRef.current = true;

    // Background and content fade in
    Animated.parallel([
      Animated.spring(backgroundOpacity, {
        toValue: 1,
        ...springPresets.modal,
        useNativeDriver: false,
      }),
      Animated.spring(contentOpacity, {
        toValue: 1,
        delay: 100,
        ...springPresets.modal,
        useNativeDriver: false,
      }),
    ]).start();
  }, [backgroundOpacity, contentOpacity]);

  // Handle title layout measurement
  const handleTitleLayout = React.useCallback(() => {
    if (!entry || !animationData || !titleRef.current) {
      return;
    }

    titleRef.current.measureInWindow((x, y, width, height) => {
      const startY = animationData.titleLayout.y;
      const endY = y;
      const deltaY = endY - startY;

      console.log("Title animation:", { startY, endY, deltaY });

      // Set initial animation values BEFORE rendering (if not already set)
      if (measurementsCompleteRef.current.title === false) {
        titleTranslateY.setValue(deltaY);
        titleScale.setValue(0.85);
        titleRotateX.setValue(-90);
        titleOpacity.setValue(0);
      }

      // Only animate if we haven't started yet
      if (measurementsCompleteRef.current.title === false) {
        measurementsCompleteRef.current.title = true;

        // Animate title with origami unfold effect
        Animated.parallel([
          Animated.spring(titleTranslateY, {
            toValue: 0,
            ...springPresets.modal,
            useNativeDriver: false,
          }),
          Animated.spring(titleScale, {
            toValue: 1,
            ...springPresets.modal,
            useNativeDriver: false,
          }),
          Animated.spring(titleRotateX, {
            toValue: 0,
            ...springPresets.modal,
            useNativeDriver: false,
          }),
          Animated.spring(titleOpacity, {
            toValue: 1,
            ...springPresets.modal,
            useNativeDriver: false,
          }),
        ]).start();

        checkAndStartBackground();
      }
    });
  }, [entry, animationData, titleTranslateY, titleScale, titleRotateX, titleOpacity, checkAndStartBackground]);

  // Handle preview layout measurement
  const handlePreviewLayout = React.useCallback(() => {
    if (!entry || !animationData || !previewRef.current || !animationData.previewLayout) {
      measurementsCompleteRef.current.preview = true;
      checkAndStartBackground();
      return;
    }

    previewRef.current.measureInWindow((x, y, width, height) => {
      const startY = animationData.previewLayout!.y;
      const endY = y;
      const deltaY = endY - startY;

      console.log("Preview animation:", { startY, endY, deltaY });

      if (measurementsCompleteRef.current.preview === false) {
        previewTranslateY.setValue(deltaY);
        previewOpacity.setValue(0);
        measurementsCompleteRef.current.preview = true;

        Animated.parallel([
          Animated.spring(previewTranslateY, {
            toValue: 0,
            ...springPresets.modal,
            useNativeDriver: false,
          }),
          Animated.spring(previewOpacity, {
            toValue: 1,
            ...springPresets.modal,
            useNativeDriver: false,
          }),
        ]).start();

        checkAndStartBackground();
      }
    });
  }, [entry, animationData, previewTranslateY, previewOpacity, checkAndStartBackground]);

  useEffect(() => {
    // Reset animation state when entry or animationData changes
    layoutCompleteRef.current = false;
    measurementsCompleteRef.current = {
      title: false,
      preview: !animationData?.previewLayout,
    };

    if (!entry || !animationData) {
      // No animation data - just fade in normally
      Animated.parallel([
        Animated.spring(backgroundOpacity, {
          toValue: 1,
          ...springPresets.modal,
          useNativeDriver: false,
        }),
        Animated.spring(contentOpacity, {
          toValue: 1,
          ...springPresets.modal,
          useNativeDriver: false,
        }),
      ]).start();
      return;
    }

    // Small delay to ensure component is mounted
    const timer = setTimeout(() => {
      handleTitleLayout();
      handlePreviewLayout();
    }, 100);

    return () => clearTimeout(timer);
  }, [entry, animationData, handleTitleLayout, handlePreviewLayout]);

  if (!entry) {
    return (
      <View style={[styles.container, { backgroundColor: seasonalTheme.gradient.middle }]}>
        <Text>Loading...</Text>
      </View>
    );
  }

  const previewText = extractPreviewText(entry.blocks);

  // Calculate origami rotation perspective (simulated with scaleX for fold effect)
  // When rotateX is -90, the title appears folded (scaleX close to 0)
  // When rotateX is 0, the title is flat (scaleX is 1)
  const rotateX = titleRotateX.interpolate({
    inputRange: [-90, 0],
    outputRange: [0.1, 1],
    extrapolate: "clamp",
  });

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: seasonalTheme.gradient.middle,
          opacity: backgroundOpacity,
        },
      ]}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons
            name="arrow-back"
            size={24}
            color={seasonalTheme.textPrimary}
          />
        </TouchableOpacity>
        {entry.isFavorite && (
          <View style={styles.favoriteBadge}>
            <Text style={styles.favoriteIcon}>★</Text>
          </View>
        )}
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + spacingPatterns.screen },
        ]}
      >
        {/* Title with origami animation */}
        <Animated.View
          ref={titleRef}
          collapsable={false}
          onLayout={handleTitleLayout}
          style={[
            styles.titleContainer,
            {
              opacity: titleOpacity,
              transform: [
                { translateY: titleTranslateY },
                { scale: titleScale },
                { scaleX: rotateX },
              ],
            },
          ]}
        >
          <Text variant="h1" style={{ color: seasonalTheme.textPrimary }}>
            {entry.title}
          </Text>
          <Text
            variant="caption"
            style={[styles.date, { color: seasonalTheme.textSecondary }]}
          >
            {formatDate(entry.updatedAt)}
          </Text>
        </Animated.View>

        {/* Preview/Intro with animation */}
        {previewText && (
          <Animated.View
            ref={previewRef}
            collapsable={false}
            onLayout={handlePreviewLayout}
            style={[
              styles.previewContainer,
              {
                opacity: previewOpacity,
                transform: [{ translateY: previewTranslateY }],
              },
            ]}
          >
            <Text
              variant="body"
              style={[styles.preview, { color: seasonalTheme.textSecondary }]}
            >
              {previewText}
            </Text>
          </Animated.View>
        )}

        {/* Full content */}
        <Animated.View
          style={[
            styles.contentContainer,
            {
              opacity: contentOpacity,
            },
          ]}
        >
          {entry.blocks.map((block, index) => {
            switch (block.type) {
              case "paragraph":
                return (
                  <Text
                    key={index}
                    variant="body"
                    style={[
                      styles.blockContent,
                      { color: seasonalTheme.textPrimary },
                    ]}
                  >
                    {block.content}
                  </Text>
                );
              case "heading1":
                return (
                  <Text
                    key={index}
                    variant="h1"
                    style={[
                      styles.blockHeading,
                      { color: seasonalTheme.textPrimary },
                    ]}
                  >
                    {block.content}
                  </Text>
                );
              case "heading2":
                return (
                  <Text
                    key={index}
                    variant="h2"
                    style={[
                      styles.blockHeading,
                      { color: seasonalTheme.textPrimary },
                    ]}
                  >
                    {block.content}
                  </Text>
                );
              case "heading3":
                return (
                  <Text
                    key={index}
                    variant="h3"
                    style={[
                      styles.blockHeading,
                      { color: seasonalTheme.textPrimary },
                    ]}
                  >
                    {block.content}
                  </Text>
                );
              case "markdown":
                return (
                  <Text
                    key={index}
                    variant="body"
                    style={[
                      styles.blockContent,
                      { color: seasonalTheme.textPrimary },
                    ]}
                  >
                    {block.content}
                  </Text>
                );
              case "quote":
                return (
                  <View
                    key={index}
                    style={[
                      styles.quoteContainer,
                      {
                        backgroundColor: seasonalTheme.cardBg,
                        borderLeftColor: seasonalTheme.textSecondary + "40",
                      },
                    ]}
                  >
                    <Text
                      variant="body"
                      style={[
                        styles.quoteText,
                        { color: seasonalTheme.textPrimary },
                      ]}
                    >
                      {block.content}
                    </Text>
                  </View>
                );
              case "list":
                return (
                  <View key={index} style={styles.listContainer}>
                    {block.items.map((item, itemIndex) => (
                      <View key={itemIndex} style={styles.listItem}>
                        <Text
                          style={[
                            styles.listBullet,
                            { color: seasonalTheme.textSecondary },
                          ]}
                        >
                          {block.ordered ? `${itemIndex + 1}.` : "•"}
                        </Text>
                        <Text
                          variant="body"
                          style={[
                            styles.listItemText,
                            { color: seasonalTheme.textPrimary },
                          ]}
                        >
                          {item}
                        </Text>
                      </View>
                    ))}
                  </View>
                );
              default:
                return null;
            }
          })}

          {/* Tags */}
          {entry.tags.length > 0 && (
            <View style={styles.tagsContainer}>
              {entry.tags.map((tag, index) => (
                <View
                  key={index}
                  style={[
                    styles.tag,
                    { backgroundColor: seasonalTheme.chipBg || "rgba(0, 0, 0, 0.1)" },
                  ]}
                >
                  <Text
                    variant="caption"
                    style={{
                      color: seasonalTheme.chipText || seasonalTheme.textSecondary,
                    }}
                  >
                    {tag}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </Animated.View>
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacingPatterns.screen,
    paddingBottom: spacingPatterns.md,
    position: "relative",
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: borderRadius.full,
  },
  favoriteBadge: {
    marginLeft: spacingPatterns.sm,
  },
  favoriteIcon: {
    fontSize: 20,
    color: "#FFA500",
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: spacingPatterns.screen,
  },
  titleContainer: {
    marginBottom: spacingPatterns.lg,
  },
  date: {
    marginTop: spacingPatterns.xs,
  },
  previewContainer: {
    marginBottom: spacingPatterns.xl,
  },
  preview: {
    fontSize: 18,
    lineHeight: 28,
  },
  contentContainer: {
    marginTop: spacingPatterns.md,
  },
  blockContent: {
    marginBottom: spacingPatterns.md,
    lineHeight: 26,
  },
  blockHeading: {
    marginTop: spacingPatterns.lg,
    marginBottom: spacingPatterns.md,
  },
  quoteContainer: {
    padding: spacingPatterns.md,
    marginVertical: spacingPatterns.md,
    borderLeftWidth: 4,
    borderRadius: borderRadius.md,
  },
  quoteText: {
    fontStyle: "italic",
  },
  listContainer: {
    marginVertical: spacingPatterns.md,
  },
  listItem: {
    flexDirection: "row",
    marginBottom: spacingPatterns.xs,
    alignItems: "flex-start",
  },
  listBullet: {
    marginRight: spacingPatterns.sm,
    marginTop: 4,
  },
  listItemText: {
    flex: 1,
  },
  tagsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacingPatterns.xs,
    marginTop: spacingPatterns.xl,
  },
  tag: {
    paddingHorizontal: spacingPatterns.sm,
    paddingVertical: spacingPatterns.xxs,
    borderRadius: borderRadius.sm,
  },
});

