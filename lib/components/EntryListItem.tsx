import React from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import RenderHtml from "react-native-render-html";
import { Text } from "./Text";
import { Card } from "./Card";
import { useTheme } from "../theme/ThemeProvider";
import { spacingPatterns, borderRadius } from "../theme";
import { Entry, extractPreviewText } from "../db/entries";
import { type SeasonalTheme } from "../theme/seasonalTheme";

export interface EntryListItemProps {
  entry: Entry;
  onPress?: (entry: Entry) => void;
  onToggleFavorite?: (entry: Entry) => void;
  seasonalTheme?: SeasonalTheme;
}

export function EntryListItem({
  entry,
  onPress,
  onToggleFavorite,
  seasonalTheme,
}: EntryListItemProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const previewText = extractPreviewText(entry.blocks);

  // Check if content is HTML
  const markdownBlock = entry.blocks.find((b) => b.type === "markdown");
  const isHtmlContent = markdownBlock && markdownBlock.content.includes("<");

  const itemTheme = React.useMemo(
    () =>
      seasonalTheme || {
        cardBg: "rgba(255, 255, 255, 0.55)",
        textPrimary: theme.colors.textPrimary,
        textSecondary: theme.colors.textSecondary,
        subtleGlow: { shadowColor: "#000", shadowOpacity: 0.12 },
      },
    [seasonalTheme, theme.colors.textPrimary, theme.colors.textSecondary]
  );

  // Extract RGB values from cardBg for gradient (works with rgba, rgb, and hex)
  const gradientColors = React.useMemo(() => {
    const cardBg = itemTheme.cardBg;

    // Extract RGB values from rgba/rgb string or hex
    let r = 255,
      g = 255,
      b = 255;

    if (cardBg.startsWith("rgba") || cardBg.startsWith("rgb")) {
      const match = cardBg.match(/\d+/g);
      if (match && match.length >= 3) {
        r = parseInt(match[0]);
        g = parseInt(match[1]);
        b = parseInt(match[2]);
      }
    } else if (cardBg.startsWith("#")) {
      const hex = cardBg.replace("#", "");
      r = parseInt(hex.substring(0, 2), 16);
      g = parseInt(hex.substring(2, 4), 16);
      b = parseInt(hex.substring(4, 6), 16);
    }

    return [
      `rgba(${r}, ${g}, ${b}, 0)`, // Fully transparent
      `rgba(${r}, ${g}, ${b}, 0.7)`, // 70% opaque
      `rgba(${r}, ${g}, ${b}, 0.95)`, // 95% opaque
      `rgba(${r}, ${g}, ${b}, 1)`, // Fully opaque
    ] as const;
  }, [itemTheme.cardBg]);

  // Memoize RenderHtml props to prevent re-renders
  const htmlTagsStyles = React.useMemo(
    () => ({
      body: {
        color: itemTheme.textPrimary,
        fontSize: 14,
        lineHeight: 18,
        margin: 0,
        padding: 0,
      },
      p: {
        color: itemTheme.textPrimary,
        fontSize: 14,
        lineHeight: 18,
        marginTop: 0,
        marginBottom: 3,
      },
      b: { color: itemTheme.textPrimary, fontWeight: "bold" as const },
      strong: {
        color: itemTheme.textPrimary,
        fontWeight: "bold" as const,
      },
      i: { color: itemTheme.textPrimary, fontStyle: "italic" as const },
      em: { color: itemTheme.textPrimary, fontStyle: "italic" as const },
      u: {
        color: itemTheme.textPrimary,
        textDecorationLine: "underline" as const,
      },
      s: {
        color: itemTheme.textPrimary,
        textDecorationLine: "line-through" as const,
      },
      del: {
        color: itemTheme.textPrimary,
        textDecorationLine: "line-through" as const,
      },
      strike: {
        color: itemTheme.textPrimary,
        textDecorationLine: "line-through" as const,
      },
      h1: {
        color: itemTheme.textPrimary,
        fontSize: 16,
        lineHeight: 20,
        fontWeight: "bold" as const,
        marginTop: 0,
        marginBottom: 3,
      },
      h2: {
        color: itemTheme.textPrimary,
        fontSize: 15,
        lineHeight: 19,
        fontWeight: "bold" as const,
        marginTop: 0,
        marginBottom: 3,
      },
      h3: {
        color: itemTheme.textPrimary,
        fontSize: 14,
        lineHeight: 18,
        fontWeight: "bold" as const,
        marginTop: 0,
        marginBottom: 3,
      },
      ul: {
        color: itemTheme.textPrimary,
        marginLeft: 0,
        paddingLeft: 14,
        marginTop: 0,
        marginBottom: 3,
      },
      ol: {
        color: itemTheme.textPrimary,
        marginLeft: 0,
        paddingLeft: 14,
        marginTop: 0,
        marginBottom: 3,
      },
      li: {
        color: itemTheme.textPrimary,
        fontSize: 14,
        lineHeight: 18,
        marginBottom: 2,
        paddingLeft: 4,
      },
    }),
    [itemTheme.textPrimary]
  );

  const htmlContentWidth = React.useMemo(
    () => width - spacingPatterns.screen * 2 - spacingPatterns.md * 2,
    [width]
  );

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const entryDate = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    );

    // If today, show time
    if (entryDate.getTime() === today.getTime()) {
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    // If yesterday
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (entryDate.getTime() === yesterday.getTime()) {
      return "Yesterday";
    }

    // If this week, show day name
    const daysDiff = Math.floor(
      (today.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysDiff < 7) {
      return date.toLocaleDateString([], { weekday: "long" });
    }

    // Otherwise show date
    return date.toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  };

  return (
    <TouchableOpacity
      onPress={() => onPress?.(entry)}
      activeOpacity={0.7}
      style={styles.container}
    >
      <Card
        variant="borderless"
        style={[
          styles.card,
          {
            backgroundColor: itemTheme.cardBg,
            shadowColor: itemTheme.subtleGlow.shadowColor,
            shadowOpacity: itemTheme.subtleGlow.shadowOpacity,
          },
        ]}
      >
        <View style={styles.cardContent}>
          {/* Floating icons on the right */}
          <View style={styles.floatingIcons}>
            <View style={styles.iconsRow}>
              <View
                style={[
                  styles.badge,
                  {
                    backgroundColor: itemTheme.cardBg,
                    borderColor: itemTheme.textSecondary + "20",
                  },
                ]}
              >
                <Ionicons
                  name={
                    entry.type === "journal"
                      ? "book-outline"
                      : "chatbubble-ellipses-outline"
                  }
                  size={18}
                  color={itemTheme.textPrimary}
                />
              </View>
              {onToggleFavorite && (
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    onToggleFavorite(entry);
                  }}
                  style={[
                    styles.badge,
                    {
                      backgroundColor: entry.isFavorite
                        ? itemTheme.textSecondary + "15"
                        : itemTheme.cardBg,
                      borderColor: entry.isFavorite
                        ? itemTheme.textSecondary + "40"
                        : itemTheme.textSecondary + "20",
                    },
                  ]}
                >
                  <Ionicons
                    name={entry.isFavorite ? "star" : "star-outline"}
                    size={18}
                    color={entry.isFavorite ? "#FFA500" : itemTheme.textPrimary}
                  />
                </TouchableOpacity>
              )}
            </View>
            {/* Date badge below icons */}
            <View
              style={[
                styles.dateBadge,
                {
                  backgroundColor: itemTheme.cardBg,
                  borderColor: itemTheme.textSecondary + "20",
                },
              ]}
            >
              <Text
                variant="caption"
                style={[styles.dateBadgeText, { color: itemTheme.textPrimary }]}
              >
                {formatDate(entry.updatedAt)}
              </Text>
            </View>
          </View>

          {/* Title for non-journal entries */}
          {entry.type !== "journal" && (
            <Text
              variant="h3"
              numberOfLines={1}
              style={[
                styles.title,
                { color: itemTheme.textPrimary, paddingRight: 80 },
              ]}
            >
              {entry.title}
            </Text>
          )}

          {previewText || isHtmlContent ? (
            <View style={styles.previewContainer}>
              {isHtmlContent && markdownBlock ? (
                <RenderHtml
                  contentWidth={htmlContentWidth}
                  source={{ html: markdownBlock.content }}
                  tagsStyles={htmlTagsStyles}
                />
              ) : (
                <Text
                  variant="body"
                  numberOfLines={4}
                  style={[styles.preview, { color: itemTheme.textPrimary }]}
                >
                  {previewText}
                </Text>
              )}
            </View>
          ) : null}

          {entry.tags.length > 0 && (
            <View style={styles.tagsContainer}>
              {entry.tags.slice(0, 3).map((tag, index) => (
                <View
                  key={index}
                  style={[
                    styles.tag,
                    {
                      backgroundColor:
                        seasonalTheme?.chipBg || "rgba(0, 0, 0, 0.1)",
                    },
                  ]}
                >
                  <Text
                    variant="caption"
                    style={{
                      color: seasonalTheme?.chipText || itemTheme.textSecondary,
                    }}
                  >
                    {tag}
                  </Text>
                </View>
              ))}
              {entry.tags.length > 3 && (
                <Text
                  variant="caption"
                  style={{ color: itemTheme.textSecondary }}
                >
                  +{entry.tags.length - 3}
                </Text>
              )}
            </View>
          )}
        </View>

        <LinearGradient
          colors={gradientColors}
          locations={[0, 0.3, 0.7, 1]}
          style={styles.fadeOverlay}
          pointerEvents="none"
        />
      </Card>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacingPatterns.sm,
  },
  card: {
    padding: spacingPatterns.md,
    position: "relative",
    overflow: "hidden",
    minHeight: 100,
    maxHeight: 180,
  },
  cardContent: {
    position: "relative",
  },
  floatingIcons: {
    position: "absolute",
    top: 0,
    right: 0,
    flexDirection: "column",
    alignItems: "flex-end",
    gap: spacingPatterns.xs,
    zIndex: 10,
  },
  iconsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacingPatterns.xs,
  },
  title: {
    marginBottom: spacingPatterns.xs,
  },
  badge: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
  },
  dateBadge: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacingPatterns.xs,
    paddingVertical: spacingPatterns.xxs + 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 32,
  },
  dateBadgeText: {
    fontSize: 11,
  },
  previewContainer: {
    marginTop: spacingPatterns.xs,
    marginBottom: spacingPatterns.xs,
    paddingRight: 80, // Space for icons on right
  },
  preview: {
    lineHeight: 18,
    fontSize: 14,
  },
  fadeOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 80,
    pointerEvents: "none",
  },
  tagsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacingPatterns.xs,
    marginTop: spacingPatterns.xs,
    alignItems: "center",
  },
  tag: {
    paddingHorizontal: spacingPatterns.xs,
    paddingVertical: spacingPatterns.xxs,
    borderRadius: borderRadius.sm,
  },
});
