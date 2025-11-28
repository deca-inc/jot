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
import { marked } from "marked";
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
import { useTrackEvent } from "../analytics";

export interface EntryListItemProps {
  entry: Entry;
  onPress?: (entry: Entry) => void;
  onToggleFavorite?: (entry: Entry) => void;
  seasonalTheme?: SeasonalTheme;
}

function EntryListItemComponent({
  entry,
  onPress,
  onToggleFavorite,
  seasonalTheme,
}: EntryListItemProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();

  // For AI chats, show the assistant's response if available, otherwise show user's message
  const previewText = React.useMemo(() => {
    if (entry.type === "ai_chat") {
      // Find the first assistant message (AI response)
      const assistantBlock = entry.blocks.find((b) => b.role === "assistant");
      if (assistantBlock && assistantBlock.type === "markdown" && assistantBlock.content.trim()) {
        // Strip HTML and think tags for preview
        const strippedContent = assistantBlock.content
          .replace(/<think>[\s\S]*?<\/think>/g, "") // Remove think tags
          .replace(/<\/?think>/g, "") // Remove any remaining think tags
          .replace(/<[^>]*>/g, " ") // Remove HTML tags
          .replace(/\s+/g, " ") // Normalize whitespace
          .trim();
        return strippedContent;
      }
    }
    // Fall back to default preview text extraction
    return extractPreviewText(entry.blocks);
  }, [entry.blocks, entry.type]);

  // Menu state
  const [showMenu, setShowMenu] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [renameText, setRenameText] = useState("");

  // Mutations
  const deleteEntryMutation = useDeleteEntry();
  const updateEntryMutation = useUpdateEntry();
  const trackEvent = useTrackEvent();

  // Action context
  const actionContext = useMemo<EntryActionContext>(
    () => ({
      updateEntry: updateEntryMutation,
      deleteEntry: deleteEntryMutation,
    }),
    [updateEntryMutation, deleteEntryMutation]
  );

  // Check if we should render markdown
  // For AI chats, use assistant's response for preview; otherwise use first markdown block
  const markdownBlock = React.useMemo(() => {
    if (entry.type === "ai_chat") {
      // Find the first assistant message (AI response)
      return entry.blocks.find((b) => b.role === "assistant" && b.type === "markdown");
    }
    return entry.blocks.find((b) => b.type === "markdown");
  }, [entry.blocks, entry.type]);

  // For AI chats, always try to render markdown if we have an assistant block
  // For other entries, check if content includes HTML tags
  const shouldRenderMarkdown = React.useMemo(() => {
    if (entry.type === "ai_chat" && markdownBlock) {
      return true; // Always render AI responses as markdown
    }
    return markdownBlock && markdownBlock.content.includes("<");
  }, [entry.type, markdownBlock]);

  // Strip <think> tags from markdown content and convert to HTML for preview rendering
  const htmlContent = React.useMemo(() => {
    if (!markdownBlock) return "";

    const cleanedMarkdown = markdownBlock.content
      .replace(/<think>[\s\S]*?<\/think>/g, "") // Remove complete <think>...</think> blocks
      .replace(/<\/?think>/g, "") // Remove any remaining <think> or </think> tags
      .trim();

    // For AI chats, parse markdown to HTML
    if (shouldRenderMarkdown && cleanedMarkdown) {
      try {
        return marked.parse(cleanedMarkdown) as string;
      } catch (error) {
        console.error("[EntryListItem] Error parsing markdown:", error);
        return cleanedMarkdown; // Fallback to plain text
      }
    }

    return cleanedMarkdown;
  }, [markdownBlock, shouldRenderMarkdown]);

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

    // Extract RGB and alpha values from rgba/rgb string or hex
    let r = 255,
      g = 255,
      b = 255,
      a = 1;

    if (cardBg.startsWith("rgba")) {
      const match = cardBg.match(/[\d.]+/g);
      if (match && match.length >= 4) {
        r = parseInt(match[0]);
        g = parseInt(match[1]);
        b = parseInt(match[2]);
        a = parseFloat(match[3]);
      }
    } else if (cardBg.startsWith("rgb")) {
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

    // Fade from transparent (top) to card color at its actual opacity (bottom)
    return [
      `rgba(${r}, ${g}, ${b}, 0)`, // Top: fully transparent
      `rgba(${r}, ${g}, ${b}, ${a * 0.5})`, // Lightly opaque (50% of card opacity)
      `rgba(${r}, ${g}, ${b}, ${a * 0.85})`, // More opaque (85% of card opacity)
      `rgba(${r}, ${g}, ${b}, ${a})`, // Bottom: exactly match card's actual color/opacity
    ] as const;
  }, [itemTheme.cardBg]);

  // Memoize RenderHtml props to prevent re-renders
  const htmlTagsStyles = React.useMemo(
    () => ({
      body: {
        color: itemTheme.textPrimary,
        fontSize: 13, // Smaller for compact previews
        lineHeight: 18,
        margin: 0,
        padding: 0,
      },
      p: {
        color: itemTheme.textPrimary,
        fontSize: 13,
        lineHeight: 18,
        marginTop: 0,
        marginBottom: 2, // Minimal spacing for compact previews
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
        fontSize: 16, // Still distinct but compact
        lineHeight: 22,
        fontWeight: "bold" as const,
        marginTop: 0,
        marginBottom: 2,
      },
      h2: {
        color: itemTheme.textPrimary,
        fontSize: 15,
        lineHeight: 21,
        fontWeight: "bold" as const,
        marginTop: 0,
        marginBottom: 2,
      },
      h3: {
        color: itemTheme.textPrimary,
        fontSize: 14,
        lineHeight: 20,
        fontWeight: "bold" as const,
        marginTop: 0,
        marginBottom: 2,
      },
      ul: {
        color: itemTheme.textPrimary,
        marginLeft: 0,
        paddingLeft: 10,
        marginTop: 0,
        marginBottom: 2,
      },
      ol: {
        color: itemTheme.textPrimary,
        marginLeft: 0,
        paddingLeft: 10,
        marginTop: 0,
        marginBottom: 2,
      },
      li: {
        color: itemTheme.textPrimary,
        fontSize: 13, // Match body text
        lineHeight: 18,
        marginBottom: 1,
        paddingLeft: 6,
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
      trackEvent("Delete Entry", { entryType: entry.type });
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
      trackEvent("Rename Entry", { entryType: entry.type });
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

            {previewText || shouldRenderMarkdown ? (
              <View style={styles.previewContainer}>
                {shouldRenderMarkdown && htmlContent ? (
                  <RenderHtml
                    contentWidth={htmlContentWidth}
                    source={{ html: htmlContent }}
                    tagsStyles={htmlTagsStyles}
                    ignoredDomTags={["think"]}
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

// Memoized comparison function to prevent unnecessary re-renders
function arePropsEqual(
  prevProps: EntryListItemProps,
  nextProps: EntryListItemProps
): boolean {
  // Compare entry by checking key fields that affect rendering
  const prevEntry = prevProps.entry;
  const nextEntry = nextProps.entry;

  if (
    prevEntry.id !== nextEntry.id ||
    prevEntry.title !== nextEntry.title ||
    prevEntry.updatedAt !== nextEntry.updatedAt ||
    prevEntry.isFavorite !== nextEntry.isFavorite ||
    prevEntry.type !== nextEntry.type ||
    prevEntry.tags.length !== nextEntry.tags.length ||
    prevEntry.blocks.length !== nextEntry.blocks.length
  ) {
    return false;
  }

  // Deep compare tags array
  if (prevEntry.tags.some((tag, i) => tag !== nextEntry.tags[i])) {
    return false;
  }

  // Deep compare blocks array using JSON comparison for simplicity and correctness
  // This handles all block types uniformly
  if (JSON.stringify(prevEntry.blocks) !== JSON.stringify(nextEntry.blocks)) {
    return false;
  }

  // Compare callbacks by reference (they should be stable via useCallback)
  if (
    prevProps.onPress !== nextProps.onPress ||
    prevProps.onToggleFavorite !== nextProps.onToggleFavorite
  ) {
    return false;
  }

  // Compare seasonalTheme by reference or key properties
  if (prevProps.seasonalTheme !== nextProps.seasonalTheme) {
    // If both are undefined, they're equal
    if (!prevProps.seasonalTheme && !nextProps.seasonalTheme) {
      return true;
    }
    // If one is undefined, they're not equal
    if (!prevProps.seasonalTheme || !nextProps.seasonalTheme) {
      return false;
    }
    // Compare key properties that affect rendering
    const prevTheme = prevProps.seasonalTheme;
    const nextTheme = nextProps.seasonalTheme;
    if (
      prevTheme.textPrimary !== nextTheme.textPrimary ||
      prevTheme.textSecondary !== nextTheme.textSecondary ||
      prevTheme.cardBg !== nextTheme.cardBg ||
      prevTheme.chipBg !== nextTheme.chipBg ||
      prevTheme.chipText !== nextTheme.chipText
    ) {
      return false;
    }
  }

  return true;
}

// Export memoized component
export const EntryListItem = React.memo(EntryListItemComponent, arePropsEqual);

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
    fontSize: 13, // Smaller for compact previews
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
