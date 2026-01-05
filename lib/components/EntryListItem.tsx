/* eslint-disable @typescript-eslint/no-explicit-any */
// Uses `any` for react-native-render-html custom renderers which have complex undocumented types
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { marked } from "marked";
import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  Alert,
  TextInput,
  Platform,
  Modal,
  Pressable,
} from "react-native";
import { PIConfetti, type PIConfettiMethods } from "react-native-fast-confetti";
import RenderHtml, { HTMLElementModel, HTMLContentModel } from "react-native-render-html";
import { useTrackEvent } from "../analytics";
import { Entry, extractPreviewText } from "../db/entries";
import { useDeleteEntry, useUpdateEntry, useTogglePinned, useArchiveEntry, useUnarchiveEntry } from "../db/useEntries";
import {
  renameEntry,
  deleteEntryWithConfirmation,
  type EntryActionContext,
} from "../screens/entryActions";
import { spacingPatterns, borderRadius } from "../theme";
import { type SeasonalTheme } from "../theme/seasonalTheme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { extractCountdownData, formatCountdown, isCountdownComplete } from "../utils/countdown";
import { cancelNotification } from "../utils/notifications";
import { Card } from "./Card";
import { Dialog } from "./Dialog";
import { PinIcon } from "./icons/PinIcon";
import { MenuItem } from "./MenuItem";
import { Text } from "./Text";

export interface EntryListItemProps {
  entry: Entry;
  onPress?: (entry: Entry) => void;
  onToggleFavorite?: (entry: Entry) => void;
  onTogglePinned?: (entry: Entry) => void;
  onArchive?: (entry: Entry) => void;
  onResetCountup?: (entry: Entry) => void;
  seasonalTheme?: SeasonalTheme;
}

function EntryListItemComponent({
  entry,
  onPress,
  onToggleFavorite,
  onTogglePinned,
  onArchive,
  onResetCountup,
  seasonalTheme: seasonalThemeProp,
}: EntryListItemProps) {
  const seasonalThemeFromContext = useSeasonalTheme();
  const { width, height } = useWindowDimensions();

  // Use prop if provided, otherwise fall back to context
  // This ensures correct theming even when prop is undefined
  const seasonalTheme = seasonalThemeProp ?? seasonalThemeFromContext;

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
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showDismissDialog, setShowDismissDialog] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [renameText, setRenameText] = useState("");
  const confettiRef = useRef<PIConfettiMethods>(null);

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
    [updateEntryMutation, deleteEntryMutation],
  );

  // Check if we should render HTML/markdown
  // For AI chats, use assistant's response for preview; otherwise use first html or markdown block
  const htmlOrMarkdownBlock = React.useMemo(() => {
    if (entry.type === "ai_chat") {
      // Find the first assistant message (AI response)
      return entry.blocks.find((b) => b.role === "assistant" && (b.type === "markdown" || b.type === "html"));
    }
    // Look for html block first (new format), then fall back to markdown (legacy)
    return entry.blocks.find((b) => b.type === "html") || entry.blocks.find((b) => b.type === "markdown");
  }, [entry.blocks, entry.type]);

  // For AI chats, always try to render HTML if we have an assistant block
  // For journal entries with html blocks, always render as HTML
  // For other entries, check if content includes HTML tags
  const shouldRenderHtml = React.useMemo(() => {
    if (entry.type === "ai_chat" && htmlOrMarkdownBlock) {
      return true; // Always render AI responses as HTML/markdown
    }
    if (htmlOrMarkdownBlock?.type === "html") {
      return true; // Always render html blocks as HTML
    }
    return htmlOrMarkdownBlock && 'content' in htmlOrMarkdownBlock && htmlOrMarkdownBlock.content.includes("<");
  }, [entry.type, htmlOrMarkdownBlock]);

  // Strip <think> tags from content and convert to HTML for preview rendering
  const htmlContent = React.useMemo(() => {
    if (!htmlOrMarkdownBlock || !('content' in htmlOrMarkdownBlock)) return "";

    const cleanedContent = htmlOrMarkdownBlock.content
      .replace(/<think>[\s\S]*?<\/think>/g, "") // Remove complete <think>...</think> blocks
      .replace(/<\/?think>/g, "") // Remove any remaining <think> or </think> tags
      .trim();

    // For html blocks, use content as-is (already HTML)
    if (htmlOrMarkdownBlock.type === "html") {
      return cleanedContent;
    }

    // For markdown blocks in AI chats, parse markdown to HTML
    if (shouldRenderHtml && cleanedContent) {
      try {
        return marked.parse(cleanedContent) as string;
      } catch (error) {
        console.error("[EntryListItem] Error parsing markdown:", error);
        return cleanedContent; // Fallback to plain text
      }
    }

    return cleanedContent;
  }, [htmlOrMarkdownBlock, shouldRenderHtml]);

  // seasonalTheme is now always defined (from prop or context)
  const itemTheme = seasonalTheme;

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
  // Using consistent spacing: no margins on block elements, let natural flow handle spacing
  const htmlTagsStyles = React.useMemo(
    () => ({
      body: {
        color: itemTheme.textPrimary,
        fontSize: 14,
        lineHeight: 20,
        margin: 0,
        padding: 0,
      },
      p: {
        color: itemTheme.textPrimary,
        fontSize: 14,
        lineHeight: 20,
        margin: 0,
        padding: 0,
        marginBottom: 4,
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
        lineHeight: 22,
        fontWeight: "bold" as const,
        margin: 0,
        marginBottom: 4,
      },
      h2: {
        color: itemTheme.textPrimary,
        fontSize: 15,
        lineHeight: 21,
        fontWeight: "bold" as const,
        margin: 0,
        marginBottom: 4,
      },
      h3: {
        color: itemTheme.textPrimary,
        fontSize: 14,
        lineHeight: 20,
        fontWeight: "bold" as const,
        margin: 0,
        marginBottom: 4,
      },
      ul: {
        color: itemTheme.textPrimary,
        marginTop: 0,
        marginBottom: 4,
        marginLeft: 0,
        marginRight: 0,
        paddingLeft: 0,
        paddingRight: 0,
      },
      ol: {
        color: itemTheme.textPrimary,
        marginTop: 0,
        marginBottom: 4,
        marginLeft: 0,
        marginRight: 0,
        paddingLeft: 0,
        paddingRight: 0,
      },
      li: {
        color: itemTheme.textPrimary,
        fontSize: 14,
        lineHeight: 20,
        marginTop: 0,
        marginBottom: 2,
        marginLeft: 0,
        marginRight: 0,
        paddingLeft: 0,
        paddingRight: 0,
      },
      // Checklist support
      checklist: {
        color: itemTheme.textPrimary,
        margin: 0,
        padding: 0,
      },
      cli: {
        color: itemTheme.textPrimary,
        fontSize: 14,
        lineHeight: 20,
        margin: 0,
        padding: 0,
      },
    }),
    [itemTheme.textPrimary],
  );

  // Custom renderers for checklist items
  const htmlRenderers = React.useMemo(
    () => ({
      checklist: ({ TDefaultRenderer, ...props }: any) => {
        return <TDefaultRenderer {...props} />;
      },
      cli: ({ tnode }: any) => {
        const isChecked = tnode?.attributes?.checked === "true";
        // Extract text content from tnode
        const textContent = tnode?.children?.[0]?.data || tnode?.data || "";
        return (
          <View style={{
            flexDirection: "row",
            alignItems: "flex-start",
            marginBottom: 2,
            marginLeft: 0,
            paddingLeft: 0,
          }}>
            <Text style={{
              fontSize: 14,
              color: itemTheme.textPrimary,
              lineHeight: 20,
              width: 24,
              textAlign: "center",
            }}>
              {isChecked ? "☑" : "☐"}
            </Text>
            <Text style={{
              flex: 1,
              fontSize: 14,
              lineHeight: 20,
              color: itemTheme.textPrimary,
              textDecorationLine: isChecked ? "line-through" : "none",
              opacity: isChecked ? 0.6 : 1,
            }}>
              {textContent}
            </Text>
          </View>
        );
      },
      // Custom renderer for ul - handles both checklists and regular bullet lists
      ul: ({ tnode }: any) => {
        const dataChecked = tnode?.attributes?.["data-checked"];
        const children = tnode?.children || [];

        // Extract text from any node
        const extractText = (node: any): string => {
          if (node?.data) return node.data;
          if (node?.children) {
            return node.children.map(extractText).join("");
          }
          return "";
        };

        // Checklist format: <ul data-checked="true/false"><li>...</li></ul>
        if (dataChecked !== undefined) {
          const isChecked = dataChecked === "true";
          return (
            <View style={{
              marginTop: 0,
              marginBottom: 4,
              marginLeft: 0,
              marginRight: 0,
            }}>
              {children.map((child: any, index: number) => {
                const textContent = extractText(child);
                return (
                  <View key={index} style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    marginBottom: 2,
                  }}>
                    <Text style={{
                      fontSize: 14,
                      color: itemTheme.textPrimary,
                      lineHeight: 20,
                      width: 24,
                      textAlign: "center",
                    }}>
                      {isChecked ? "☑" : "☐"}
                    </Text>
                    <Text style={{
                      flex: 1,
                      fontSize: 14,
                      lineHeight: 20,
                      color: isChecked ? itemTheme.textSecondary : itemTheme.textPrimary,
                      textDecorationLine: isChecked ? "line-through" : "none",
                      opacity: isChecked ? 0.6 : 1,
                    }}>
                      {textContent}
                    </Text>
                  </View>
                );
              })}
            </View>
          );
        }

        // Regular bullet list
        return (
          <View style={{
            marginTop: 0,
            marginBottom: 4,
            marginLeft: 8,
            marginRight: 0,
          }}>
            {children.filter((child: any) => child?.tagName === "li").map((child: any, index: number) => {
              const textContent = extractText(child);
              return (
                <View key={index} style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  marginBottom: 2,
                }}>
                  <Text style={{
                    fontSize: 14,
                    color: itemTheme.textPrimary,
                    lineHeight: 20,
                    width: 20,
                  }}>
                    •
                  </Text>
                  <Text style={{
                    flex: 1,
                    fontSize: 14,
                    lineHeight: 20,
                    color: itemTheme.textPrimary,
                  }}>
                    {textContent}
                  </Text>
                </View>
              );
            })}
          </View>
        );
      },
      // Custom renderer for ol - numbered lists
      ol: ({ tnode }: any) => {
        const children = tnode?.children || [];

        const extractText = (node: any): string => {
          if (node?.data) return node.data;
          if (node?.children) {
            return node.children.map(extractText).join("");
          }
          return "";
        };

        return (
          <View style={{
            marginTop: 0,
            marginBottom: 4,
            marginLeft: 8,
            marginRight: 0,
          }}>
            {children.filter((child: any) => child?.tagName === "li").map((child: any, index: number) => {
              const textContent = extractText(child);
              return (
                <View key={index} style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  marginBottom: 2,
                }}>
                  <Text style={{
                    fontSize: 14,
                    color: itemTheme.textPrimary,
                    lineHeight: 20,
                    width: 24,
                  }}>
                    {index + 1}.
                  </Text>
                  <Text style={{
                    flex: 1,
                    fontSize: 14,
                    lineHeight: 20,
                    color: itemTheme.textPrimary,
                  }}>
                    {textContent}
                  </Text>
                </View>
              );
            })}
          </View>
        );
      },
    }),
    [itemTheme.textPrimary, itemTheme.textSecondary],
  );

  const htmlContentWidth = React.useMemo(
    () => width - spacingPatterns.screen * 2 - spacingPatterns.md * 2,
    [width],
  );

  // Countdown timer - force re-render every minute for countdown entries
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    if (entry.type !== "countdown") return;
    const intervalId = setInterval(() => forceUpdate((n) => n + 1), 60000);
    return () => clearInterval(intervalId);
  }, [entry.type]);

  // Extract countdown data for countdown entries
  const countdownData = useMemo(() => {
    if (entry.type !== "countdown") return null;
    return extractCountdownData(entry.blocks);
  }, [entry.type, entry.blocks]);

  // Trigger confetti when dismiss dialog opens (if confetti is enabled)
  useEffect(() => {
    if (showDismissDialog && countdownData?.confettiEnabled) {
      // Small delay to ensure dialog is visible first
      const timer = setTimeout(() => {
        setShowConfetti(true);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [showDismissDialog, countdownData?.confettiEnabled]);

  // Start confetti animation after component mounts
  useEffect(() => {
    if (showConfetti) {
      // Small delay to ensure PIConfetti ref is populated after render
      const timer = setTimeout(() => {
        confettiRef.current?.restart();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [showConfetti]);

  // Mutations for pinning and archiving
  const togglePinnedMutation = useTogglePinned();
  const archiveEntryMutation = useArchiveEntry();
  const unarchiveEntryMutation = useUnarchiveEntry();

  // Event handler: Delete entry
  const handleDelete = async () => {
    try {
      // Cancel notification before deleting if this is a countdown with a notification
      if (entry.type === "countdown") {
        const data = extractCountdownData(entry.blocks);
        if (data?.notificationId) {
          await cancelNotification(data.notificationId);
        }
      }
      await deleteEntryWithConfirmation(entry.id, actionContext);
      trackEvent("Delete Entry", { entryType: entry.type });
    } catch (error) {
      // Error already handled in action (logged and shown to user)
      if (error instanceof Error && error.message !== "Deletion cancelled") {
        Alert.alert("Error", "Failed to delete entry");
      }
    }
  };

  // Event handler: Archive countdown (cancels notification first)
  const handleArchiveCountdown = async () => {
    // Cancel notification before archiving if this countdown has one
    if (countdownData?.notificationId) {
      await cancelNotification(countdownData.notificationId);
    }
    if (onArchive) {
      onArchive(entry);
    } else {
      archiveEntryMutation.mutate(entry.id);
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
        {/* Floating icon in top-left corner - entry type badge */}
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
                  : entry.type === "countdown"
                    ? "timer-outline"
                    : "chatbubble-ellipses-outline"
              }
              size={16}
              color={itemTheme.textPrimary}
            />
          </View>
        </View>

        {/* Floating icons in top-right corner - pin and overflow menu */}
        <View style={styles.floatingIconsRight}>
          <View style={styles.iconsRow}>
            {entry.isPinned && (
              <View
                style={[
                  styles.pinBadge,
                  {
                    backgroundColor: itemTheme.cardBg,
                    borderColor: itemTheme.textSecondary + "20",
                  },
                ]}
              >
                <PinIcon size={14} color={itemTheme.textSecondary} />
              </View>
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
        </View>

        {/* Fade overlay - positioned above content, below icons (not shown for countdown) */}
        {entry.type !== "countdown" && (
          <LinearGradient
            colors={gradientColors}
            locations={[0, 0.3, 0.7, 1]}
            style={styles.fadeOverlay}
            pointerEvents="none"
          />
        )}

        <View style={entry.type === "countdown" ? styles.countdownCardContent : styles.cardContent}>
          <View style={entry.type === "countdown" ? styles.countdownContentInner : styles.contentInner}>
            {/* Countdown display - custom layout */}
            {entry.type === "countdown" && countdownData && (
              <View style={styles.countdownDisplay}>
                <Text
                  variant="caption"
                  numberOfLines={1}
                  style={[styles.countdownTitle, { color: itemTheme.textSecondary }]}
                >
                  {entry.title}
                </Text>
                <Text
                  style={[
                    styles.countdownTime,
                    { color: itemTheme.textPrimary },
                  ]}
                >
                  {formatCountdown(countdownData.targetDate, countdownData.isCountUp)}
                </Text>
                <Text
                  variant="caption"
                  style={[styles.countdownTargetDate, { color: itemTheme.textSecondary }]}
                >
                  {countdownData.isCountUp ? "Since " : ""}
                  {new Date(countdownData.targetDate).toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: new Date(countdownData.targetDate).getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
                  })}{" "}
                  {new Date(countdownData.targetDate).toLocaleTimeString(undefined, {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </Text>
                {/* Dismiss button for completed countdowns (not countups, not already archived) */}
                {!countdownData.isCountUp && !entry.archivedAt && isCountdownComplete(countdownData.targetDate) && (
                  <TouchableOpacity
                    style={[
                      styles.dismissButton,
                      { backgroundColor: itemTheme.textPrimary + "15" },
                    ]}
                    onPress={(e) => {
                      e.stopPropagation();
                      // Show dialog if there's a rewards note or confetti, otherwise just archive
                      if (countdownData.rewardsNote || countdownData.confettiEnabled) {
                        setShowDismissDialog(true);
                      } else {
                        handleArchiveCountdown();
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      variant="caption"
                      style={{ color: itemTheme.textPrimary, fontWeight: "600" }}
                    >
                      Dismiss
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Title for AI chat entries */}
            {entry.type === "ai_chat" && (
              <Text
                variant="body"
                numberOfLines={1}
                style={[
                  styles.title,
                  styles.conversationTitle,
                  { color: itemTheme.textPrimary },
                ]}
              >
                {entry.title}
              </Text>
            )}

            {entry.type !== "countdown" && (previewText || shouldRenderHtml) ? (
              <View style={styles.previewContainer}>
                {shouldRenderHtml && htmlContent ? (
                  <RenderHtml
                    contentWidth={htmlContentWidth}
                    source={{ html: htmlContent }}
                    tagsStyles={htmlTagsStyles}
                    ignoredDomTags={["think"]}
                    renderers={htmlRenderers}
                    customHTMLElementModels={{
                      checklist: HTMLElementModel.fromCustomModel({
                        tagName: "checklist",
                        contentModel: HTMLContentModel.block,
                      }),
                      cli: HTMLElementModel.fromCustomModel({
                        tagName: "cli",
                        contentModel: HTMLContentModel.mixed,
                      }),
                    }}
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
        {/* Reset button at top for countup entries */}
        {entry.type === "countdown" && countdownData?.isCountUp && (
          <MenuItem
            icon="refresh-outline"
            label="Reset Timer"
            onPress={() => {
              setShowMenu(false);
              setShowResetDialog(true);
            }}
          />
        )}
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
          icon={entry.isFavorite ? "star" : "star-outline"}
          label={entry.isFavorite ? "Unfavorite" : "Favorite"}
          onPress={() => {
            setShowMenu(false);
            onToggleFavorite?.(entry);
          }}
        />
        <MenuItem
          customIcon={<PinIcon size={20} color={itemTheme.textPrimary} />}
          label={entry.isPinned ? "Unpin" : "Pin"}
          onPress={() => {
            setShowMenu(false);
            if (onTogglePinned) {
              onTogglePinned(entry);
            } else {
              togglePinnedMutation.mutate(entry.id);
            }
          }}
        />
        <MenuItem
          icon={entry.archivedAt ? "arrow-undo-outline" : "archive-outline"}
          label={entry.archivedAt ? "Unarchive" : "Archive"}
          onPress={() => {
            setShowMenu(false);
            if (entry.archivedAt) {
              unarchiveEntryMutation.mutate(entry.id);
            } else if (onArchive) {
              onArchive(entry);
            } else {
              archiveEntryMutation.mutate(entry.id);
            }
          }}
        />
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

      {/* Reset Timer Dialog */}
      <Dialog
        visible={showResetDialog}
        onRequestClose={() => setShowResetDialog(false)}
        containerStyle={styles.resetDialog}
      >
        <Text
          variant="h3"
          style={{
            color: itemTheme.textPrimary,
            marginBottom: spacingPatterns.sm,
            textAlign: "center",
          }}
        >
          Reset Timer?
        </Text>
        {countdownData?.rewardsNote && (
          <Text
            variant="body"
            style={{
              color: itemTheme.textSecondary,
              marginBottom: spacingPatterns.md,
              textAlign: "center",
              lineHeight: 22,
            }}
          >
            {countdownData.rewardsNote}
          </Text>
        )}
        <Text
          variant="caption"
          style={{
            color: itemTheme.textSecondary,
            marginBottom: spacingPatterns.md,
            textAlign: "center",
          }}
        >
          This will start the timer from now.
        </Text>
        <View style={styles.renameButtons}>
          <TouchableOpacity
            style={[
              styles.renameButton,
              {
                backgroundColor: itemTheme.textSecondary + "20",
              },
            ]}
            onPress={() => setShowResetDialog(false)}
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
            onPress={() => {
              setShowResetDialog(false);
              onResetCountup?.(entry);
            }}
          >
            <Text
              style={{
                color: seasonalTheme.gradient.middle,
                fontWeight: "600",
              }}
            >
              Reset
            </Text>
          </TouchableOpacity>
        </View>
      </Dialog>

      {/* Dismiss Countdown Dialog with Celebration */}
      <Modal
        visible={showDismissDialog}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowDismissDialog(false);
          setShowConfetti(false);
        }}
      >
        <Pressable
          style={styles.dialogOverlay}
          onPress={() => {
            setShowDismissDialog(false);
            setShowConfetti(false);
          }}
        >
          {/* Confetti behind dialog */}
          {showConfetti && (
            <View style={styles.confettiContainer} pointerEvents="none">
              <PIConfetti
                ref={confettiRef}
                count={150}
                blastPosition={{ x: width / 2, y: height / 2 - 140 }}
                blastRadius={500}
                blastDuration={1000}
                fallDuration={2000}
              />
            </View>
          )}

          {/* Dialog content */}
          <Pressable
            style={[
              styles.dismissDialog,
              { backgroundColor: seasonalTheme.gradient.middle },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text
              variant="h2"
              style={{
                color: itemTheme.textPrimary,
                marginBottom: spacingPatterns.md,
                textAlign: "center",
              }}
            >
              🎉
            </Text>
            <Text
              variant="h3"
              style={{
                color: itemTheme.textPrimary,
                marginBottom: spacingPatterns.sm,
                textAlign: "center",
              }}
            >
              Countdown Complete!
            </Text>
            {countdownData?.rewardsNote && (
              <Text
                variant="body"
                style={{
                  color: itemTheme.textSecondary,
                  marginBottom: spacingPatterns.lg,
                  textAlign: "center",
                  lineHeight: 22,
                }}
              >
                {countdownData.rewardsNote}
              </Text>
            )}
            <TouchableOpacity
              style={[
                styles.dismissDialogButton,
                {
                  backgroundColor: itemTheme.textPrimary,
                },
              ]}
              onPress={() => {
                setShowDismissDialog(false);
                setShowConfetti(false);
                handleArchiveCountdown();
              }}
            >
              <Text
                style={{
                  color: seasonalTheme.gradient.middle,
                  fontWeight: "600",
                }}
              >
                Dismiss
              </Text>
            </TouchableOpacity>
            {countdownData?.confettiEnabled && (
              <TouchableOpacity
                onPress={() => confettiRef.current?.restart()}
                style={{ marginTop: spacingPatterns.md, alignSelf: "center" }}
              >
                <Text
                  style={{
                    color: itemTheme.textSecondary,
                    fontSize: 14,
                    textAlign: "center",
                  }}
                >
                  More confetti 🎊
                </Text>
              </TouchableOpacity>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </TouchableOpacity>
  );
}

// Memoized comparison function to prevent unnecessary re-renders
function arePropsEqual(
  prevProps: EntryListItemProps,
  nextProps: EntryListItemProps,
): boolean {
  // Compare entry by checking key fields that affect rendering
  const prevEntry = prevProps.entry;
  const nextEntry = nextProps.entry;

  if (
    prevEntry.id !== nextEntry.id ||
    prevEntry.title !== nextEntry.title ||
    prevEntry.updatedAt !== nextEntry.updatedAt ||
    prevEntry.isFavorite !== nextEntry.isFavorite ||
    prevEntry.isPinned !== nextEntry.isPinned ||
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
    prevProps.onToggleFavorite !== nextProps.onToggleFavorite ||
    prevProps.onTogglePinned !== nextProps.onTogglePinned ||
    prevProps.onArchive !== nextProps.onArchive ||
    prevProps.onResetCountup !== nextProps.onResetCountup
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
    top: -6,
    left: -6,
    zIndex: 10,
  },
  floatingIconsRight: {
    position: "absolute",
    top: spacingPatterns.xs,
    right: spacingPatterns.xs,
    flexDirection: "row",
    alignItems: "center",
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
  pinBadge: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
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
  previewContainer: {
    marginTop: spacingPatterns.xs,
    marginBottom: spacingPatterns.xs,
  },
  preview: {
    lineHeight: 20,
    fontSize: 14,
  },
  countdownCardContent: {
    position: "relative",
    overflow: "hidden",
    borderRadius: borderRadius.lg,
  },
  countdownContentInner: {
    position: "relative",
    zIndex: 1,
  },
  countdownDisplay: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: spacingPatterns.md,
    paddingBottom: 0,
    paddingHorizontal: spacingPatterns.lg,
  },
  countdownTitle: {
    fontSize: 12,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: spacingPatterns.xs,
  },
  countdownTime: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: "700",
    letterSpacing: 1,
    fontVariant: ["tabular-nums"],
  },
  countdownTargetDate: {
    fontSize: 12,
    marginTop: spacingPatterns.xs,
    opacity: 0.7,
  },
  dismissButton: {
    marginTop: spacingPatterns.sm,
    paddingVertical: spacingPatterns.xs,
    paddingHorizontal: spacingPatterns.md,
    borderRadius: borderRadius.md,
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
  resetDialog: {
    width: "80%",
    maxWidth: 400,
    padding: spacingPatterns.lg,
  },
  dialogOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  dismissDialog: {
    width: "80%",
    maxWidth: 400,
    padding: spacingPatterns.lg,
    borderRadius: borderRadius.lg,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  dismissDialogButton: {
    paddingVertical: spacingPatterns.sm,
    paddingHorizontal: spacingPatterns.lg,
    borderRadius: borderRadius.md,
    alignItems: "center",
  },
  confettiContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
