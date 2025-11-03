import React from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
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
  const previewText = extractPreviewText(entry.blocks);
  const itemTheme = seasonalTheme || {
    cardBg: "rgba(255, 255, 255, 0.55)",
    textPrimary: theme.colors.textPrimary,
    textSecondary: theme.colors.textSecondary,
    subtleGlow: { shadowColor: "#000", shadowOpacity: 0.12 },
  };

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
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text
              variant="h3"
              numberOfLines={1}
              style={[styles.title, { color: itemTheme.textPrimary }]}
            >
              {entry.title}
            </Text>
            {entry.isFavorite && <Text style={styles.favoriteIcon}>★</Text>}
          </View>
          <Text
            variant="caption"
            style={[styles.date, { color: itemTheme.textSecondary }]}
          >
            {formatDate(entry.updatedAt)}
          </Text>
        </View>

        {previewText ? (
          <Text
            variant="body"
            numberOfLines={2}
            style={[styles.preview, { color: itemTheme.textSecondary }]}
          >
            {previewText}
          </Text>
        ) : null}

        {entry.tags.length > 0 && (
          <View style={styles.tagsContainer}>
            {entry.tags.slice(0, 3).map((tag, index) => (
              <View
                key={index}
                style={[
                  styles.tag,
                  { backgroundColor: itemTheme.chipBg || "rgba(0, 0, 0, 0.1)" },
                ]}
              >
                <Text
                  variant="caption"
                  style={{
                    color: itemTheme.chipText || itemTheme.textSecondary,
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

        <View style={styles.footer}>
          <Text variant="caption" style={{ color: itemTheme.textSecondary }}>
            {entry.type === "journal" ? "Journal Entry" : "AI Chat"}
          </Text>
          {onToggleFavorite && (
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                onToggleFavorite(entry);
              }}
              style={styles.favoriteButton}
            >
              <Text
                variant="caption"
                style={{
                  color: entry.isFavorite ? "#FFA500" : itemTheme.textSecondary,
                }}
              >
                {entry.isFavorite ? "★" : "☆"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
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
  },
  header: {
    marginBottom: spacingPatterns.xs,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacingPatterns.xs,
  },
  title: {
    flex: 1,
  },
  favoriteIcon: {
    fontSize: 16,
    color: "#FFA500",
  },
  date: {
    marginTop: spacingPatterns.xxs,
  },
  preview: {
    marginTop: spacingPatterns.xs,
    marginBottom: spacingPatterns.xs,
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
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacingPatterns.sm,
  },
  favoriteButton: {
    padding: spacingPatterns.xxs,
  },
});
