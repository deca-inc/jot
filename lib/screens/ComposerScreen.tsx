import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Alert,
  Modal,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Text, Button } from "../components";
import { useTheme } from "../theme/ThemeProvider";
import { spacingPatterns, borderRadius } from "../theme";
import { typography } from "../theme/typography";
import { useEntryRepository, EntryType, Block } from "../db/entries";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";

/**
 * Convert entry blocks to plain text content for editing
 */
function blocksToContent(blocks: Block[], entryType: EntryType): string {
  if (entryType === "journal") {
    // For journal entries, convert text-based blocks to plain text
    const textParts: string[] = [];

    for (const block of blocks) {
      if (
        block.type === "paragraph" ||
        block.type === "heading1" ||
        block.type === "heading2" ||
        block.type === "heading3"
      ) {
        if (block.content.trim()) {
          textParts.push(block.content.trim());
        }
      } else if (block.type === "quote") {
        if (block.content.trim()) {
          textParts.push(block.content.trim());
        }
      } else if (block.type === "list") {
        // Convert list items to text format
        const listText = block.items
          .map((item, index) => {
            const prefix = block.ordered ? `${index + 1}. ` : "- ";
            return `${prefix}${item}`;
          })
          .join("\n");
        if (listText.trim()) {
          textParts.push(listText);
        }
      } else if (block.type === "markdown") {
        // Include markdown blocks (might be formatted text)
        if (block.content.trim()) {
          textParts.push(block.content.trim());
        }
      }
    }

    return textParts.join("\n\n");
  } else {
    // For AI chat, extract markdown content from user messages
    const markdownBlocks = blocks
      .filter(
        (block): block is Extract<Block, { type: "markdown" }> =>
          block.type === "markdown"
      )
      .filter((block) => block.role === "user");
    if (markdownBlocks.length > 0) {
      return markdownBlocks.map((block) => block.content).join("\n\n");
    }
    return "";
  }
}

export interface ComposerScreenProps {
  onSave?: (entryId: number) => void;
  onCancel?: () => void;
  onDelete?: (entryId: number) => void;
  initialType?: EntryType;
  initialContent?: string;
  entryId?: number; // For editing existing entries
  fullScreen?: boolean;
}

export function ComposerScreen({
  onSave,
  onCancel,
  onDelete,
  initialType = "journal",
  initialContent = "",
  entryId,
  fullScreen = false,
}: ComposerScreenProps) {
  const theme = useTheme();
  const seasonalTheme = useSeasonalTheme();
  const insets = useSafeAreaInsets();
  const entryRepository = useEntryRepository();
  const [entryType, setEntryType] = useState<EntryType>(initialType);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState(initialContent);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(!!entryId);
  const [chatMessages, setChatMessages] = useState<Block[]>([]); // For AI chat conversation
  const [newMessage, setNewMessage] = useState(""); // Current message being typed
  const [createdEntryId, setCreatedEntryId] = useState<number | null>(null); // Track created entry ID for new entries
  const [showMenu, setShowMenu] = useState(false); // Settings menu visibility
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const titleInputRef = useRef<TextInput>(null);
  const hasLoadedEntryRef = useRef<number | null>(null); // Track which entryId we've loaded

  // Load existing entry if entryId is provided (only once per entryId)
  useEffect(() => {
    if (!entryId) {
      setIsLoading(false);
      hasLoadedEntryRef.current = null;
      if (initialType === "ai_chat") {
        setChatMessages([]);
      }
      return;
    }

    // Only load if we haven't loaded this entry yet
    if (hasLoadedEntryRef.current === entryId) {
      return;
    }

    const loadEntry = async () => {
      try {
        const entry = await entryRepository.getById(entryId);
        if (entry) {
          hasLoadedEntryRef.current = entryId;
          setEntryType(entry.type);
          setTitle(entry.title);
          setCreatedEntryId(null); // Reset since we're loading an existing entry

          if (entry.type === "ai_chat") {
            // Load conversation messages
            setChatMessages(entry.blocks);
            setNewMessage("");
          } else {
            const entryContent = blocksToContent(entry.blocks, entry.type);
            setContent(entryContent || initialContent);
          }
        }
      } catch (error) {
        console.error("Error loading entry:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadEntry();
    // Only depend on entryId - other dependencies shouldn't cause re-load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId]);

  const performSave = useCallback(
    async (contentToSave: string, blocksToSave?: Block[]) => {
      if (
        !contentToSave.trim() &&
        (!blocksToSave || blocksToSave.length === 0)
      ) {
        return;
      }

      setIsSaving(true);
      try {
        const blocks: Block[] = blocksToSave || [];

        if (!blocksToSave) {
          if (contentToSave.trim()) {
            if (entryType === "journal") {
              // For journal entries, create paragraph blocks from content
              const paragraphs = contentToSave
                .split("\n\n")
                .filter((p) => p.trim())
                .map((p) => ({
                  type: "paragraph" as const,
                  content: p.trim(),
                }));

              blocks.push(...paragraphs);
            }
          }
        }

        const finalTitle =
          title.trim() ||
          contentToSave.trim().slice(0, 50) +
            (contentToSave.length > 50 ? "..." : "") ||
          "Untitled";

        const currentEntryId = entryId || createdEntryId;

        if (currentEntryId) {
          // Update existing entry
          await entryRepository.update(currentEntryId, {
            title: finalTitle,
            blocks,
          });
          onSave?.(currentEntryId);
        } else {
          // Create new entry
          const entry = await entryRepository.create({
            type: entryType,
            title: finalTitle,
            blocks,
            tags: [],
            attachments: [],
            isFavorite: false,
          });
          setCreatedEntryId(entry.id);
          onSave?.(entry.id);
        }
      } catch (error) {
        console.error("Error saving entry:", error);
        // TODO: Show error message to user
      } finally {
        setIsSaving(false);
      }
    },
    [title, entryType, entryId, createdEntryId, entryRepository, onSave]
  );

  // Auto-save with debounce for journal entries
  useEffect(() => {
    if (entryType !== "journal" || !content.trim()) {
      return;
    }

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set new timeout for auto-save (1 second debounce)
    saveTimeoutRef.current = setTimeout(async () => {
      await performSave(content);
    }, 1000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [content, entryType, performSave]);

  // Note: Auto-save handles saving on content changes.
  // The debounce will trigger saves, and new entries get created on first save.

  const handleTitleFocus = useCallback(() => {
    // Select all text when focusing
    setTimeout(() => {
      titleInputRef.current?.setNativeProps({
        selection: { start: 0, end: title.length },
      });
    }, 100);
  }, [title]);

  const handleTitleChange = useCallback((newTitle: string) => {
    setTitle(newTitle);
  }, []);

  const handleTitleBlur = useCallback(async () => {
    const newTitle = title.trim();

    // Only save if the title actually changed and we have an entry
    if (entryId || createdEntryId) {
      const currentEntryId = entryId || createdEntryId;
      if (currentEntryId) {
        setIsSaving(true);
        try {
          await entryRepository.update(currentEntryId, {
            title: newTitle || undefined,
          });
          onSave?.(currentEntryId);
        } catch (error) {
          console.error("Error updating title:", error);
        } finally {
          setIsSaving(false);
        }
      }
    }
  }, [title, entryId, createdEntryId, entryRepository, onSave]);

  const handleTitleSubmit = useCallback(async () => {
    titleInputRef.current?.blur();
    await handleTitleBlur();
  }, [handleTitleBlur]);

  const handleDelete = useCallback(() => {
    const entryIdToDelete = entryId || createdEntryId;
    if (!entryIdToDelete) return;

    Alert.alert(
      "Delete Entry",
      "Are you sure you want to delete this entry? This action cannot be undone.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await entryRepository.delete(entryIdToDelete);
              setCreatedEntryId(null);
              onDelete?.(entryIdToDelete);
              onCancel?.();
            } catch (error) {
              console.error("Error deleting entry:", error);
              Alert.alert("Error", "Failed to delete entry");
            }
          },
        },
      ]
    );
  }, [entryId, createdEntryId, entryRepository, onDelete, onCancel]);

  const handleSendMessage = useCallback(async () => {
    if (!newMessage.trim()) return;

    const userMessage: Block = {
      type: "markdown",
      content: newMessage.trim(),
      role: "user",
    };

    const updatedMessages = [...chatMessages, userMessage];
    setChatMessages(updatedMessages);
    setNewMessage("");

    // Scroll to bottom
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);

    // Save the conversation
    setIsSaving(true);
    try {
      const finalTitle = title.trim() || "AI Conversation";

      if (entryId) {
        await entryRepository.update(entryId, {
          title: finalTitle,
          blocks: updatedMessages,
        });
        onSave?.(entryId);
      } else {
        const entry = await entryRepository.create({
          type: "ai_chat",
          title: finalTitle,
          blocks: updatedMessages,
          tags: [],
          attachments: [],
          isFavorite: false,
        });
        onSave?.(entry.id);
      }
    } catch (error) {
      console.error("Error saving message:", error);
    } finally {
      setIsSaving(false);
    }

    // TODO: Here you would call an AI API to get a response
    // For now, we'll just add a placeholder assistant message
    // setTimeout(() => {
    //   const assistantMessage: Block = {
    //     type: "markdown",
    //     content: "This is a placeholder response. AI integration coming soon.",
    //     role: "assistant",
    //   };
    //   const withResponse = [...updatedMessages, assistantMessage];
    //   setChatMessages(withResponse);
    //   // Save with assistant response
    // }, 500);
  }, [newMessage, chatMessages, title, entryId, entryRepository, onSave]);

  if (isLoading) {
    return (
      <View
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <Text>Loading...</Text>
      </View>
    );
  }

  // Use fullScreen mode for journal entries (same as when creating new), or if explicitly set
  const shouldUseFullScreen = fullScreen || entryType === "journal";

  if (shouldUseFullScreen) {
    // Full-screen journal editor - minimal UI with auto-save
    // Calculate title dynamically from content or use saved title
    const entryTitle =
      title.trim() ||
      (content.trim()
        ? content.trim().slice(0, 50) + (content.length > 50 ? "..." : "")
        : "New Entry");

    return (
      <KeyboardAvoidingView
        style={[
          styles.container,
          { backgroundColor: seasonalTheme.gradient.middle },
        ]}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* Standardized Header */}
        <View style={styles.standardHeader}>
          <TouchableOpacity
            onPress={onCancel}
            style={styles.backButton}
            disabled={isSaving}
          >
            <Ionicons
              name="arrow-back"
              size={24}
              color={seasonalTheme.textPrimary}
            />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <View style={styles.headerTitleInputWrapper}>
              <TextInput
                ref={titleInputRef}
                style={[
                  styles.headerTitleInput,
                  { color: seasonalTheme.textPrimary },
                ]}
                value={title}
                onChangeText={handleTitleChange}
                onFocus={handleTitleFocus}
                onBlur={handleTitleBlur}
                onSubmitEditing={handleTitleSubmit}
                placeholder={
                  content.trim()
                    ? content.trim().slice(0, 50) +
                      (content.length > 50 ? "..." : "")
                    : "Entry title"
                }
                placeholderTextColor={seasonalTheme.textSecondary}
                editable={true}
                {...(Platform.OS === "android" && {
                  includeFontPadding: false,
                })}
              />
            </View>
          </View>
          {(entryId || createdEntryId) && (
            <TouchableOpacity
              onPress={() => setShowMenu(true)}
              style={styles.menuButton}
              disabled={isSaving}
            >
              <Ionicons
                name="ellipsis-vertical"
                size={24}
                color={seasonalTheme.textPrimary}
              />
            </TouchableOpacity>
          )}
        </View>

        {/* Settings Menu Modal */}
        {showMenu && (
          <Modal
            visible={showMenu}
            transparent
            animationType="fade"
            onRequestClose={() => setShowMenu(false)}
          >
            <Pressable
              style={styles.menuOverlay}
              onPress={() => setShowMenu(false)}
            >
              <View
                style={[
                  styles.menuContainer,
                  {
                    backgroundColor: seasonalTheme.cardBg,
                    shadowColor: seasonalTheme.subtleGlow.shadowColor,
                  },
                ]}
              >
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    setShowMenu(false);
                    handleDelete();
                  }}
                >
                  <Ionicons
                    name="trash-outline"
                    size={20}
                    color="#FF3B30"
                    style={styles.menuIcon}
                  />
                  <Text style={{ color: "#FF3B30" }}>Delete Entry</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Modal>
        )}
        <TextInput
          style={[
            styles.fullScreenInput,
            {
              color: seasonalTheme.textPrimary,
              paddingBottom: insets.bottom,
            },
          ]}
          placeholder="Start writing..."
          placeholderTextColor={seasonalTheme.textSecondary}
          value={content}
          onChangeText={setContent}
          multiline
          autoFocus={!entryId} // Only autofocus when creating new entries
          textAlignVertical="top"
        />
      </KeyboardAvoidingView>
    );
  }

  // AI Chat conversation view
  if (entryType === "ai_chat") {
    return (
      <KeyboardAvoidingView
        style={[
          styles.container,
          { backgroundColor: seasonalTheme.gradient.middle },
        ]}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
      >
        {/* Standardized Header */}
        <View style={styles.standardHeader}>
          <TouchableOpacity
            onPress={onCancel}
            style={styles.backButton}
            disabled={isSaving}
          >
            <Ionicons
              name="arrow-back"
              size={24}
              color={seasonalTheme.textPrimary}
            />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <View style={styles.headerTitleInputWrapper}>
              <TextInput
                ref={titleInputRef}
                style={[
                  styles.headerTitleInput,
                  { color: seasonalTheme.textPrimary },
                ]}
                value={title}
                onChangeText={handleTitleChange}
                onFocus={handleTitleFocus}
                onBlur={handleTitleBlur}
                onSubmitEditing={handleTitleSubmit}
                placeholder="AI Conversation"
                placeholderTextColor={seasonalTheme.textSecondary}
                editable={true}
                {...(Platform.OS === "android" && {
                  includeFontPadding: false,
                })}
              />
            </View>
          </View>
          {entryId && (
            <TouchableOpacity
              onPress={() => setShowMenu(true)}
              style={styles.menuButton}
              disabled={isSaving}
            >
              <Ionicons
                name="ellipsis-vertical"
                size={24}
                color={seasonalTheme.textPrimary}
              />
            </TouchableOpacity>
          )}
        </View>

        {/* Settings Menu Modal */}
        {showMenu && (
          <Modal
            visible={showMenu}
            transparent
            animationType="fade"
            onRequestClose={() => setShowMenu(false)}
          >
            <Pressable
              style={styles.menuOverlay}
              onPress={() => setShowMenu(false)}
            >
              <View
                style={[
                  styles.menuContainer,
                  {
                    backgroundColor: seasonalTheme.cardBg,
                    shadowColor: seasonalTheme.subtleGlow.shadowColor,
                  },
                ]}
              >
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    setShowMenu(false);
                    handleDelete();
                  }}
                >
                  <Ionicons
                    name="trash-outline"
                    size={20}
                    color="#FF3B30"
                    style={styles.menuIcon}
                  />
                  <Text style={{ color: "#FF3B30" }}>Delete Conversation</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Modal>
        )}

        {/* Messages */}
        <ScrollView
          ref={scrollViewRef}
          style={styles.chatMessages}
          contentContainerStyle={[
            styles.chatMessagesContent,
            { paddingBottom: insets.bottom + spacingPatterns.md },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {chatMessages.length === 0 ? (
            <View style={styles.emptyChat}>
              <Text
                variant="body"
                style={{ color: seasonalTheme.textSecondary }}
              >
                Start a conversation with your AI assistant...
              </Text>
            </View>
          ) : (
            chatMessages.map((message, index) => {
              const isUser = message.role === "user";
              // In AI chat, messages should only be markdown blocks
              const messageContent =
                message.type === "markdown" ? message.content : "";
              return (
                <View
                  key={index}
                  style={[
                    styles.messageBubble,
                    isUser ? styles.userMessage : styles.assistantMessage,
                  ]}
                >
                  <View
                    style={[
                      styles.messageContent,
                      {
                        backgroundColor: isUser
                          ? seasonalTheme.chipBg || "rgba(0, 0, 0, 0.1)"
                          : seasonalTheme.cardBg || "rgba(255, 255, 255, 0.1)",
                      },
                    ]}
                  >
                    <Text
                      variant="body"
                      style={{
                        color: isUser
                          ? seasonalTheme.chipText || seasonalTheme.textPrimary
                          : seasonalTheme.textPrimary,
                      }}
                    >
                      {messageContent}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        {/* Input */}
        <View
          style={[
            styles.chatInputContainer,
            {
              backgroundColor: seasonalTheme.cardBg,
              paddingBottom: insets.bottom || spacingPatterns.sm,
            },
          ]}
        >
          <TextInput
            style={[
              styles.chatInput,
              {
                color: seasonalTheme.textPrimary,
                borderColor: seasonalTheme.textSecondary + "20",
              },
            ]}
            placeholder="Type your message..."
            placeholderTextColor={seasonalTheme.textSecondary}
            value={newMessage}
            onChangeText={setNewMessage}
            multiline
            onSubmitEditing={handleSendMessage}
            returnKeyType="send"
          />
          <TouchableOpacity
            onPress={handleSendMessage}
            disabled={!newMessage.trim() || isSaving}
            style={[
              styles.sendButton,
              {
                backgroundColor:
                  newMessage.trim() && !isSaving
                    ? seasonalTheme.chipBg
                    : seasonalTheme.textSecondary + "20",
              },
            ]}
          >
            <Ionicons
              name="send"
              size={20}
              color={
                newMessage.trim() && !isSaving
                  ? seasonalTheme.chipText || seasonalTheme.textPrimary
                  : seasonalTheme.textSecondary + "80"
              }
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // Default composer view (should not be reached in normal flow)
  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: spacingPatterns.screen,
    borderBottomWidth: 1,
    backgroundColor: "#FFFFFF",
  },
  headerContent: {
    gap: spacingPatterns.md,
  },
  typeSelector: {
    flexDirection: "row",
    gap: spacingPatterns.xs,
  },
  typeButton: {
    flex: 1,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacingPatterns.sm,
  },
  saveButton: {
    minWidth: 80,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: spacingPatterns.screen,
  },
  titleInput: {
    fontSize: 24,
    fontWeight: "600",
    marginBottom: spacingPatterns.md,
    padding: spacingPatterns.sm,
    borderRadius: borderRadius.md,
    minHeight: 50,
  },
  contentInput: {
    fontSize: 16,
    lineHeight: 24,
    padding: spacingPatterns.sm,
    borderRadius: borderRadius.md,
    minHeight: 200,
  },
  standardHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacingPatterns.screen,
    paddingBottom: spacingPatterns.md,
    gap: spacingPatterns.sm,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: borderRadius.full,
  },
  headerTitleContainer: {
    flex: 1,
    height: 44,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  headerTitleInputWrapper: {
    width: "100%",
    height: 44, // Match container height for perfect alignment
    justifyContent: "center",
    alignItems: "flex-start",
    ...(Platform.OS === "ios" && {
      paddingTop: 8,
    }),
  },
  headerTitleInput: {
    width: "100%",
    fontSize: typography.h3.fontSize,
    fontWeight: typography.h3.fontWeight,
    lineHeight: typography.h3.fontSize,
    height: typography.h3.fontSize * typography.h3.lineHeight,
    letterSpacing: typography.h3.letterSpacing,
    paddingHorizontal: 0,
    margin: 0,
    backgroundColor: "transparent",
    borderWidth: 0,
    ...(Platform.OS === "android" && {
      textAlignVertical: "center",
      includeFontPadding: false,
      paddingVertical: 0,
    }),
  },
  menuButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: borderRadius.full,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  menuContainer: {
    minWidth: 200,
    borderRadius: borderRadius.lg,
    padding: spacingPatterns.xs,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacingPatterns.md,
    borderRadius: borderRadius.md,
  },
  menuIcon: {
    marginRight: spacingPatterns.sm,
  },
  fullScreenInput: {
    flex: 1,
    fontSize: 18,
    lineHeight: 28,
    padding: spacingPatterns.screen,
    paddingTop: spacingPatterns.md,
  },
  chatMessages: {
    flex: 1,
  },
  chatMessagesContent: {
    padding: spacingPatterns.screen,
    paddingTop: spacingPatterns.md,
  },
  emptyChat: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacingPatterns.xl * 2,
  },
  messageBubble: {
    marginBottom: spacingPatterns.md,
  },
  userMessage: {
    alignItems: "flex-end",
  },
  assistantMessage: {
    alignItems: "flex-start",
  },
  messageContent: {
    maxWidth: "80%",
    padding: spacingPatterns.md,
    borderRadius: borderRadius.lg,
  },
  chatInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacingPatterns.md,
    paddingTop: spacingPatterns.sm,
    gap: spacingPatterns.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(0, 0, 0, 0.1)",
  },
  chatInput: {
    flex: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacingPatterns.md,
    paddingVertical: spacingPatterns.sm,
    fontSize: 16,
    borderWidth: 1,
    maxHeight: 100,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
});
