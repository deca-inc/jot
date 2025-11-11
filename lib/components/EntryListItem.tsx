import React, { useState, useMemo } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  Alert,
  TextInput,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import RenderHtml from "react-native-render-html";
import { Text } from "./Text";
import { Card } from "./Card";
import { Dialog } from "./Dialog";
import { MenuItem } from "./MenuItem";
import { useTheme } from "../theme/ThemeProvider";
import { spacingPatterns, borderRadius } from "../theme";
import { Entry, extractPreviewText } from "../db/entries";
import { type SeasonalTheme } from "../theme/seasonalTheme";
import { useDeleteEntry, useUpdateEntry } from "../db/useEntries";
import {
  renameEntry,
  deleteEntryWithConfirmation,
  type EntryActionContext,
} from "../screens/entryActions";

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

  // Menu state
  const [showMenu, setShowMenu] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [renameText, setRenameText] = useState("");

  // Mutations
  const deleteEntryMutation = useDeleteEntry();
  const updateEntryMutation = useUpdateEntry();

  // Action context
  const actionContext = useMemo<EntryActionContext>(
    () => ({
      updateEntry: updateEntryMutation,
      deleteEntry: deleteEntryMutation,
    }),
    [updateEntryMutation, deleteEntryMutation]
  );

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
    // Determine if we're in dark mode by checking text brightness
    const textColor = itemTheme.textPrimary;
    let isDarkMode = false;

    if (textColor.startsWith("#")) {
      const hex = textColor.replace("#", "");
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      // Calculate relative luminance
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      isDarkMode = luminance > 0.5; // Light text = dark mode
    } else if (textColor.startsWith("rgb")) {
      const match = textColor.match(/\d+/g);
      if (match && match.length >= 3) {
        const r = parseInt(match[0]);
        const g = parseInt(match[1]);
        const b = parseInt(match[2]);
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        isDarkMode = luminance > 0.5; // Light text = dark mode
      }
    }

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

    // In dark mode, use dark gradient; in light mode, use light gradient
    if (isDarkMode) {
      // Use black with softer opacity to blend gently with dark backgrounds
      return [
        `rgba(0, 0, 0, 0)`, // Fully transparent
        `rgba(0, 0, 0, 0.25)`, // 25% opaque black - softer
        `rgba(0, 0, 0, 0.5)`, // 50% opaque black - softer
        `rgba(0, 0, 0, 0.7)`, // 70% opaque black - softer
      ] as const;
    }

    return [
      `rgba(${r}, ${g}, ${b}, 0)`, // Fully transparent
      `rgba(${r}, ${g}, ${b}, 0.7)`, // 70% opaque
      `rgba(${r}, ${g}, ${b}, 0.95)`, // 95% opaque
      `rgba(${r}, ${g}, ${b}, 1)`, // Fully opaque
    ] as const;
  }, [itemTheme.cardBg, itemTheme.textPrimary]);

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

  // Event handler: Delete entry
  const handleDelete = async () => {
    try {
      await deleteEntryWithConfirmation(entry.id, actionContext);
    } catch (error) {
      // Error already handled in action (logged and shown to user)
      if (error instanceof Error && error.message !== "Deletion cancelled") {
        Alert.alert("Error", "Failed to delete entry");
      }
    }
  };

  // Event handler: Rename entry (AI chat only)
  const handleRename = () => {
    setRenameText(entry.title);
    setShowRenameDialog(true);
  };

  // Event handler: Submit rename
  const handleRenameSubmit = async () => {
    if (!renameText.trim()) {
      Alert.alert("Error", "Title cannot be empty");
      return;
    }

    try {
      await renameEntry(entry.id, renameText.trim(), actionContext);
      setShowRenameDialog(false);
      setRenameText("");
    } catch (error) {
      console.error("[EntryListItem] Error renaming entry:", error);
      Alert.alert("Error", "Failed to rename entry");
    }
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
        {/* Floating icon in top-left corner - outside content wrapper for true floating */}
        <View style={styles.floatingIconLeft}>
          <View
            style={[
              styles.badgeSmall,
              styles.floatingBadge,
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
              size={16}
              color={itemTheme.textPrimary}
            />
          </View>
        </View>

        {/* Floating icons cluster in top-right corner - outside content for proper z-index */}
        <View style={styles.floatingIconsRight}>
          <View style={styles.iconsRow}>
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
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                setShowMenu(true);
              }}
              style={[
                styles.badge,
                {
                  backgroundColor: itemTheme.cardBg,
                  borderColor: itemTheme.textSecondary + "20",
                },
              ]}
            >
              <Ionicons
                name="ellipsis-vertical"
                size={18}
                color={itemTheme.textPrimary}
              />
            </TouchableOpacity>
          </View>

          {/* Date badge below icon cluster */}
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

        {/* Fade overlay - positioned above content, below icons */}
        <LinearGradient
          colors={gradientColors}
          locations={[0, 0.3, 0.7, 1]}
          style={styles.fadeOverlay}
          pointerEvents="none"
        />

        <View style={styles.cardContent}>
          <View style={styles.contentInner}>
            {/* Title for non-journal entries */}
            {entry.type !== "journal" && (
              <Text
                variant="body"
                numberOfLines={1}
                style={[
                  styles.title,
                  styles.conversationTitle,
                  {
                    color: itemTheme.textPrimary,
                    paddingRight: 70, // Space for icons on right
                  },
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
                        color:
                          seasonalTheme?.chipText || itemTheme.textSecondary,
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
        </View>
      </Card>

      {/* Menu Modal */}
      <Dialog visible={showMenu} onRequestClose={() => setShowMenu(false)}>
        {entry.type === "ai_chat" && (
          <MenuItem
            icon="pencil-outline"
            label="Rename"
            onPress={() => {
              setShowMenu(false);
              handleRename();
            }}
          />
        )}
        <MenuItem
          icon="trash-outline"
          label="Delete"
          variant="destructive"
          onPress={() => {
            setShowMenu(false);
            handleDelete();
          }}
        />
      </Dialog>

      {/* Rename Dialog Modal */}
      <Dialog
        visible={showRenameDialog}
        onRequestClose={() => setShowRenameDialog(false)}
        containerStyle={styles.renameDialog}
      >
        <Text
          variant="h3"
          style={{
            color: itemTheme.textPrimary,
            marginBottom: spacingPatterns.md,
          }}
        >
          Rename Entry
        </Text>
        <TextInput
          style={[
            styles.renameInput,
            {
              color: itemTheme.textPrimary,
              borderColor: itemTheme.textSecondary + "40",
              backgroundColor:
                Platform.OS === "android"
                  ? "transparent"
                  : itemTheme.cardBg + "80",
            },
          ]}
          placeholder="Enter new title..."
          placeholderTextColor={itemTheme.textSecondary}
          value={renameText}
          onChangeText={setRenameText}
          autoFocus
          onSubmitEditing={handleRenameSubmit}
        />
        <View style={styles.renameButtons}>
          <TouchableOpacity
            style={[
              styles.renameButton,
              {
                backgroundColor: itemTheme.textSecondary + "20",
              },
            ]}
            onPress={() => {
              setShowRenameDialog(false);
              setRenameText("");
            }}
          >
            <Text style={{ color: itemTheme.textPrimary }}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.renameButton,
              {
                backgroundColor: itemTheme.textPrimary,
              },
            ]}
            onPress={handleRenameSubmit}
            disabled={!renameText.trim()}
          >
            <Text
              style={{
                color:
                  Platform.OS === "android"
                    ? seasonalTheme?.gradient.middle || itemTheme.cardBg
                    : itemTheme.cardBg,
                opacity: !renameText.trim() ? 0.5 : 1,
              }}
            >
              Save
            </Text>
          </TouchableOpacity>
        </View>
      </Dialog>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacingPatterns.md, // Increased margin between cards
  },
  card: {
    padding: spacingPatterns.md,
    position: "relative",
    overflow: "visible", // Changed to visible to allow floating icon to extend beyond card edge
    borderRadius: borderRadius.lg, // Ensure rounded corners
  },
  cardContent: {
    position: "relative",
    overflow: "hidden",
    borderRadius: borderRadius.lg, // Match card border radius for clipping
    minHeight: 76,
    maxHeight: 180, // Reduced for more compact entries
    // No z-index - allows children to participate in parent stacking context
  },
  contentInner: {
    position: "relative",
    maxHeight: 140, // Reduced for more compact entries
    zIndex: 1, // Base content layer, below fade (5) and icons (10)
  },
  floatingIconLeft: {
    position: "absolute",
    top: -6, // Negative offset to float on the corner (adjusted for smaller icon)
    left: -6, // Negative offset to float on the corner (adjusted for smaller icon)
    zIndex: 10,
  },
  floatingIconsRight: {
    position: "absolute",
    top: spacingPatterns.xs,
    right: spacingPatterns.xs,
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
  conversationTitle: {
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 20,
  },
  badge: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
  },
  badgeSmall: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
  },
  floatingBadge: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
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
    paddingRight: 70, // Space for icons on right (reduced from 80)
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
    height: 55, // Reduced by ~1/3rd (from 80)
    borderBottomLeftRadius: borderRadius.lg, // Match card border radius
    borderBottomRightRadius: borderRadius.lg, // Match card border radius
    zIndex: 5, // Above content (z-index 1), below icons (z-index 10)
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
  renameDialog: {
    width: "80%",
    maxWidth: 400,
    padding: spacingPatterns.lg,
  },
  renameInput: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacingPatterns.md,
    paddingVertical: spacingPatterns.sm,
    fontSize: 16,
    marginBottom: spacingPatterns.md,
  },
  renameButtons: {
    flexDirection: "row",
    gap: spacingPatterns.sm,
  },
  renameButton: {
    flex: 1,
    paddingVertical: spacingPatterns.sm,
    paddingHorizontal: spacingPatterns.md,
    borderRadius: borderRadius.md,
    alignItems: "center",
  },
});
