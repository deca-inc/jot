import React, { useState, useCallback, useRef, useMemo } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Alert,
  Modal,
  Pressable,
  ListRenderItem,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "../components";
import { useTheme } from "../theme/ThemeProvider";
import { spacingPatterns, borderRadius } from "../theme";
import { typography } from "../theme/typography";
import { Block } from "../db/entries";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { useLLMForConvo, llmManager } from "../ai/ModelProvider";
import {
  useEntry,
  useCreateEntry,
  useUpdateEntry,
  useDeleteEntry,
} from "../db/useEntries";
import {
  initializeAIConversation,
  sendMessageWithResponse,
  type AIChatActionContext,
} from "./aiChatActions";

export interface AIChatComposerProps {
  entryId?: number;
  initialTitle?: string;
  initialBlocks?: Block[];
  onSave?: (entryId: number) => void;
  onCancel?: () => void;
  onDelete?: (entryId: number) => void;
}

export function AIChatComposer({
  entryId,
  initialTitle = "",
  initialBlocks = [],
  onSave,
  onCancel,
  onDelete,
}: AIChatComposerProps) {
  const theme = useTheme();
  const seasonalTheme = useSeasonalTheme();
  const insets = useSafeAreaInsets();

  // React Query hooks - load entry first
  const { data: entry, isLoading } = useEntry(entryId);

  // Use new LLM hook - pass entryId as convoId and for DB writes
  // When AIChatComposer mounts, it attaches to existing LLM instance if generation is already running
  const convoId = entryId ? `entry-${entryId}` : `new-${Date.now()}`;
  const {
    llm,
    isLoading: isLLMLoading,
    error: llmError,
  } = useLLMForConvo(
    convoId,
    entryId,
    entry?.blocks // Initialize with existing blocks if loading entry
  );

  const createEntry = useCreateEntry();
  const updateEntry = useUpdateEntry();
  const deleteEntry = useDeleteEntry();

  // Local state for input only
  const [titleInput, setTitleInput] = useState(initialTitle);
  const [newMessage, setNewMessage] = useState("");
  const [showMenu, setShowMenu] = useState(false);

  // Refs for UI only
  const flatListRef = useRef<FlatList<Block>>(null);
  const titleInputRef = useRef<TextInput>(null);
  const chatInputRef = useRef<TextInput>(null);
  const hasQueuedInitialWork = useRef(false);

  // Derive displayed data from entry or fallback to initial props
  const displayedTitle = entry?.title ?? initialTitle;
  const displayedBlocks = entry?.blocks ?? initialBlocks;

  // Show LLM errors
  if (llmError) {
    console.error("[AIChatComposer] LLM error:", llmError);
    Alert.alert("AI Error", llmError);
  }

  // Scroll to bottom helper
  const scrollToBottom = useCallback((animated: boolean = true) => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated });
    }, 100);
  }, []);

  // Create action context for dispatching actions
  const actionContext = useMemo<AIChatActionContext>(
    () => ({
      createEntry,
      updateEntry,
      setTitle: setTitleInput, // Update local input state
      llm,
      onSave: (id: number) => {
        scrollToBottom();
        onSave?.(id);
      },
    }),
    [createEntry, updateEntry, llm, onSave, scrollToBottom]
  );

  // Queue initial work if we have initial blocks and this is a new conversation
  // This would only happen if someone passed initialBlocks without an entryId
  // (which doesn't happen in practice - HomeScreen creates the entry first)
  if (
    !entryId &&
    !hasQueuedInitialWork.current &&
    initialBlocks.length === 1 &&
    initialBlocks[0]?.role === "user" &&
    llm &&
    !isLLMLoading
  ) {
    hasQueuedInitialWork.current = true;
    const initialMessage = initialBlocks[0];

    // Queue work in background - don't block render
    Promise.resolve().then(() => {
      initializeAIConversation(
        { initialMessage, title: initialTitle || "AI Conversation" },
        actionContext
      ).catch((error) => {
        console.error("[AIChatComposer] Initial conversation failed:", error);
        Alert.alert(
          "AI Error",
          `Failed to initialize conversation: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      });
    });
  }

  const handleTitleFocus = useCallback(() => {
    const currentTitle = entry?.title ?? titleInput;
    setTimeout(() => {
      titleInputRef.current?.setNativeProps({
        selection: { start: 0, end: currentTitle.length },
      });
    }, 100);
  }, [entry?.title, titleInput]);

  const handleTitleChange = useCallback((newTitle: string) => {
    setTitleInput(newTitle);
  }, []);

  const handleTitleBlur = useCallback(() => {
    if (!entryId) return;

    const newTitle = titleInput.trim();
    updateEntry.mutate(
      {
        id: entryId,
        input: {
          title: newTitle || undefined,
        },
      },
      {
        onSuccess: () => {
          onSave?.(entryId);
        },
        onError: (error) => {
          console.error("Error updating title:", error);
        },
      }
    );
  }, [titleInput, entryId, updateEntry, onSave]);

  const handleTitleSubmit = useCallback(() => {
    titleInputRef.current?.blur();
    handleTitleBlur();
  }, [handleTitleBlur]);

  const handleDelete = useCallback(() => {
    if (!entryId) return;

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
          onPress: () => {
            // CRITICAL: Clean up LLM instance BEFORE deleting entry to free memory
            const convoId = `entry-${entryId}`;
            try {
              llmManager.delete(convoId);
            } catch (e) {
              console.error(
                `[AIChatComposer] Failed to cleanup LLM on delete:`,
                e
              );
            }

            // Delete entry and navigate back
            deleteEntry.mutate(entryId, {
              onSuccess: () => {
                onCancel?.();
                setTimeout(() => {
                  onDelete?.(entryId);
                }, 0);
              },
              onError: (error) => {
                console.error("Error deleting entry:", error);
                Alert.alert("Error", "Failed to delete entry");
              },
            });
          },
        },
      ]
    );
  }, [entryId, deleteEntry, onDelete, onCancel]);

  const handleSendMessage = useCallback(async () => {
    if (!newMessage.trim() || !llm) return;

    const messageText = newMessage.trim();
    setNewMessage("");

    // Queue work via action system and redirect if needed
    try {
      await sendMessageWithResponse(
        messageText,
        entryId,
        displayedBlocks,
        displayedTitle,
        actionContext
      );

      // Scroll to bottom and refocus input
      scrollToBottom();
      setTimeout(() => {
        chatInputRef.current?.focus();
      }, 100);
    } catch (error) {
      console.error("[AIChatComposer] Error sending message:", error);
      Alert.alert(
        "Error",
        `Failed to send message: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }, [
    newMessage,
    entryId,
    displayedBlocks,
    displayedTitle,
    actionContext,
    llm,
    scrollToBottom,
  ]);

  // Render item for FlatList
  const renderMessage: ListRenderItem<Block> = useCallback(
    ({ item: message, index }) => {
      const isUser = message.role === "user";
      const messageContent = message.type === "markdown" ? message.content : "";
      const isEmpty = !messageContent || messageContent.trim().length === 0;
      // Derive: if it's an empty assistant message and it's the last message, it's generating
      const isLastMessage = index === displayedBlocks.length - 1;
      const isGenerating = !isUser && isEmpty && isLastMessage && isLLMLoading;

      return (
        <View
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
            {isGenerating ? (
              <Text
                variant="body"
                style={{
                  color: seasonalTheme.textSecondary,
                  fontStyle: "italic",
                }}
              >
                Thinking...
              </Text>
            ) : (
              <Text
                variant="body"
                style={{
                  color: isUser
                    ? seasonalTheme.chipText || seasonalTheme.textPrimary
                    : seasonalTheme.textPrimary,
                }}
              >
                {messageContent || " "}
              </Text>
            )}
          </View>
        </View>
      );
    },
    [isLLMLoading, seasonalTheme, displayedBlocks.length]
  );

  const keyExtractor = useCallback((item: Block, index: number) => {
    const content = "content" in item ? item.content : "";
    return `${index}-${content?.length || 0}`;
  }, []);

  const ListEmptyComponent = useCallback(() => {
    return (
      <View style={styles.emptyChat}>
        <Text variant="body" style={{ color: seasonalTheme.textSecondary }}>
          Start a conversation with your AI assistant...
        </Text>
      </View>
    );
  }, [seasonalTheme]);

  // Show UI shell immediately - content will load progressively
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
          disabled={createEntry.isPending || updateEntry.isPending}
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
              value={titleInput || displayedTitle}
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
            disabled={createEntry.isPending || updateEntry.isPending}
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

      {/* Messages with FlatList for better performance */}
      <FlatList
        ref={flatListRef}
        data={displayedBlocks}
        renderItem={renderMessage}
        keyExtractor={keyExtractor}
        ListEmptyComponent={ListEmptyComponent}
        style={styles.chatMessages}
        contentContainerStyle={[
          styles.chatMessagesContent,
          { paddingBottom: insets.bottom + spacingPatterns.md },
        ]}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        initialNumToRender={20}
        windowSize={21}
        onContentSizeChange={() => {
          // Auto-scroll to bottom when content size changes
          scrollToBottom();
        }}
        onLayout={() => {
          // Scroll to bottom on initial layout if we have messages
          if (displayedBlocks.length > 0) {
            setTimeout(() => {
              flatListRef.current?.scrollToEnd({ animated: false });
            }, 100);
          }
        }}
      />

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
          ref={chatInputRef}
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
          editable={!isLLMLoading || !!llm}
          onSubmitEditing={handleSendMessage}
          returnKeyType="send"
          blurOnSubmit={false}
        />
        <TouchableOpacity
          onPress={handleSendMessage}
          disabled={
            !newMessage.trim() ||
            !llm ||
            createEntry.isPending ||
            updateEntry.isPending
          }
          style={[
            styles.sendButton,
            {
              backgroundColor:
                newMessage.trim() &&
                llm &&
                !createEntry.isPending &&
                !updateEntry.isPending
                  ? seasonalTheme.chipBg
                  : seasonalTheme.textSecondary + "20",
            },
          ]}
        >
          <Ionicons
            name="send"
            size={20}
            color={
              newMessage.trim() &&
              llm &&
              !createEntry.isPending &&
              !updateEntry.isPending
                ? seasonalTheme.chipText || seasonalTheme.textPrimary
                : seasonalTheme.textSecondary + "80"
            }
          />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    height: 44,
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
