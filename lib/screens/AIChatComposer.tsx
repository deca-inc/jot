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

  const [title, setTitle] = useState(initialTitle);
  const [chatMessages, setChatMessages] = useState<Block[]>(initialBlocks);
  const [newMessage, setNewMessage] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const titleInputRef = useRef<TextInput>(null);
  const chatInputRef = useRef<TextInput>(null);
  const hasTriggeredInitialResponse = useRef(false);
  const isGeneratingRef = useRef(false);
  const generatingMessageIndexRef = useRef<number | null>(null);
  const entryLoadedRef = useRef<number | undefined>(undefined);
  const justCreatedEntryRef = useRef<boolean>(false);

  // Watch for LLM errors
  useEffect(() => {
    if (llmError) {
      console.error("[AIChatComposer] LLM error:", llmError);
      Alert.alert("AI Error", llmError);
    }
  }, [llmError]);

  // Track last synced blocks to prevent infinite loops
  const lastSyncedBlocksRef = useRef<string>("");

  // Track if component is mounted to prevent state updates after unmount
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Sync chatMessages with entry.blocks when entry updates from React Query
  // This handles streaming updates - when tokens arrive, hook updates DB and cache,
  // which triggers this effect to sync local state
  useEffect(() => {
    // Guard: Don't update state if component is unmounted
    if (!isMountedRef.current) {
      return;
    }

    // Skip entirely if we just created the entry - don't overwrite what user added
    if (justCreatedEntryRef.current) {
      justCreatedEntryRef.current = false; // Reset flag
      return;
    }

    if (!entry) {
      // Entry not loaded yet or entry was deleted
      if (!entryId && chatMessages.length === 0) {
        // New entry - use initial values
        setTitle(initialTitle);
        setChatMessages(initialBlocks);
        lastSyncedBlocksRef.current = JSON.stringify(initialBlocks);
      }
      return;
    }

    // Only sync if this is the correct entry
    if (entry.id !== entryId) {
      return;
    }

    // Update title if it changed
    if (entry.title !== title) {
      setTitle(entry.title);
    }

    // Sync blocks - only update if blocks actually changed (by string comparison)
    // Use ref to track last synced state to prevent loops
    const entryBlocksStr = JSON.stringify(entry.blocks);

    if (
      entryBlocksStr !== lastSyncedBlocksRef.current &&
      entry.type === "ai_chat"
    ) {
      setChatMessages(entry.blocks);
      lastSyncedBlocksRef.current = entryBlocksStr;

      // Auto-scroll to bottom when new content arrives
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [entry, entryId, title, initialTitle, initialBlocks]);

  // Configure model service once it's ready (optional - can be done at provider level)
  // Configuration is already done in ModelProvider, but we can override if needed

  // Reset trigger flag when entry changes
  useEffect(() => {
    hasTriggeredInitialResponse.current = false;
    isGeneratingRef.current = false;
  }, [entryId]);

  // Helper function to generate AI response
  // Uses generate() with full context from chatMessages to ensure proper context handling
  const generateAIResponse = useCallback(async () => {
    if (!llm) {
      console.warn("[AIChatComposer] LLM not ready yet");
      return;
    }

    try {
      isGeneratingRef.current = true;

      // Get current messages using functional update to ensure we have latest state
      let currentMessages: Block[] = [];
      setChatMessages((prev) => {
        currentMessages = prev;

        // Add placeholder assistant message for UI
        const placeholderAssistantMessage: Block = {
          type: "markdown",
          content: "",
          role: "assistant",
        };
        generatingMessageIndexRef.current = prev.length;
        return [...prev, placeholderAssistantMessage];
      });

      // Use generate() with full context from current messages
      // This includes all messages (user + assistant) in the correct order
      const { blocksToLlmMessages } = require("../ai/ModelProvider");
      const messages = blocksToLlmMessages(
        currentMessages,
        "You are a helpful AI assistant."
      );

      await llm.generate(messages);

      // Scroll to bottom after response
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (e) {
      console.error("[AIChatComposer] Error generating AI response:", e);
      // Remove placeholder on error
      setChatMessages((prev) => prev.slice(0, -1));
      Alert.alert(
        "AI Error",
        `Failed to generate a response: ${
          e instanceof Error ? e.message : String(e)
        }`
      );
    } finally {
      isGeneratingRef.current = false;
      generatingMessageIndexRef.current = null;
    }
  }, [llm]);

  // Trigger AI response for initial prompt if needed
  // Wait for LLM to be ready
  useEffect(() => {
    if (
      !isLoading &&
      !isLLMLoading &&
      llm &&
      !hasTriggeredInitialResponse.current &&
      !isGeneratingRef.current &&
      chatMessages.length === 1 &&
      chatMessages[0]?.role === "user"
    ) {
      hasTriggeredInitialResponse.current = true;
      // Use generate() with full context instead of sendMessage() to avoid duplication
      // and ensure full context is passed
      const { blocksToLlmMessages } = require("../ai/ModelProvider");
      const messages = blocksToLlmMessages(
        chatMessages,
        "You are a helpful AI assistant."
      );

      llm.generate(messages).catch((e) => {
        console.error("[AIChatComposer] Initial generation failed:", e);
        Alert.alert(
          "AI Error",
          `Failed to generate initial response: ${
            e instanceof Error ? e.message : String(e)
          }`
        );
      });
    }
  }, [isLoading, isLLMLoading, llm, chatMessages]);

  const handleTitleFocus = useCallback(() => {
    setTimeout(() => {
      titleInputRef.current?.setNativeProps({
        selection: { start: 0, end: title.length },
      });
    }, 100);
  }, [title]);

  const handleTitleChange = useCallback((newTitle: string) => {
    setTitle(newTitle);
  }, []);

  const handleTitleBlur = useCallback(() => {
    if (!entryId) return;

    const newTitle = title.trim();
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
  }, [title, entryId, updateEntry, onSave]);

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
            // LLM models can be 100+ MB - must be deleted to prevent OOM
            const convoId = `entry-${entryId}`;
            try {
              llmManager.delete(convoId);
            } catch (e) {
              console.error(
                `[AIChatComposer] Failed to cleanup LLM on delete:`,
                e
              );
            }

            // Small delay to ensure LLM cleanup completes before database deletion
            setTimeout(() => {
              deleteEntry.mutate(entryId, {
                onSuccess: () => {
                  onDelete?.(entryId);
                  onCancel?.();
                },
                onError: (error) => {
                  console.error("Error deleting entry:", error);
                  Alert.alert("Error", "Failed to delete entry");
                },
              });
            }, 100);
          },
        },
      ]
    );
  }, [entryId, deleteEntry, onDelete, onCancel]);

  const handleSendMessage = useCallback(async () => {
    if (!newMessage.trim()) return;

    // ModelProvider's generate() will automatically wait for model to be ready
    const userMessage: Block = {
      type: "markdown",
      content: newMessage.trim(),
      role: "user",
    };

    // Add user message to chat immediately
    // Use functional update to ensure we get the latest state
    let updatedMessages: Block[] = [];
    setChatMessages((prev) => {
      updatedMessages = [...prev, userMessage];
      return updatedMessages;
    });

    // Ensure state is updated before proceeding
    // The state update is async, but we have updatedMessages for the mutation

    // Save the user message immediately
    const finalTitle = title.trim() || "AI Conversation";
    if (entryId) {
      updateEntry.mutate(
        {
          id: entryId,
          input: {
            title: finalTitle,
            blocks: updatedMessages,
          },
        },
        {
          onSuccess: () => {
            onSave?.(entryId);
          },
          onError: (error) => {
            console.error("Error saving message:", error);
          },
        }
      );
    } else {
      // Mark that we're creating an entry so the loading effect doesn't overwrite
      justCreatedEntryRef.current = true;

      createEntry.mutate(
        {
          type: "ai_chat",
          title: finalTitle,
          blocks: updatedMessages,
          tags: [],
          attachments: [],
          isFavorite: false,
        },
        {
          onSuccess: (entry) => {
            // Delay onSave slightly to let state update render first
            setTimeout(() => {
              onSave?.(entry.id);
            }, 100);
          },
          onError: (error) => {
            justCreatedEntryRef.current = false; // Reset on error
            console.error("Error saving message:", error);
          },
        }
      );
    }

    setNewMessage("");

    // Scroll to bottom and refocus input
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
      // Refocus input after sending message
      chatInputRef.current?.focus();
    }, 100);

    // Generate AI response with full context (including the new user message)
    // Use generate() which takes full context to avoid duplication
    setTimeout(() => {
      generateAIResponse();
    }, 0);
  }, [
    newMessage,
    title,
    entryId,
    createEntry,
    updateEntry,
    onSave,
    generateAIResponse,
  ]);

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
            <Text variant="body" style={{ color: seasonalTheme.textSecondary }}>
              Start a conversation with your AI assistant...
            </Text>
          </View>
        ) : (
          chatMessages.map((message, index) => {
            const isUser = message.role === "user";
            const messageContent =
              message.type === "markdown" ? message.content : "";
            const isEmpty =
              !messageContent || messageContent.trim().length === 0;
            const isGenerating =
              !isUser &&
              isEmpty &&
              (isLLMLoading || generatingMessageIndexRef.current === index);

            return (
              <View
                key={`${index}-${messageContent.length}`}
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
          editable={true}
          onSubmitEditing={handleSendMessage}
          returnKeyType="send"
          blurOnSubmit={false}
        />
        <TouchableOpacity
          onPress={handleSendMessage}
          disabled={
            !newMessage.trim() || createEntry.isPending || updateEntry.isPending
          }
          style={[
            styles.sendButton,
            {
              backgroundColor:
                newMessage.trim() &&
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
