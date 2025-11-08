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
  ListRenderItem,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Text, FloatingComposerHeader } from "../components";
import { spacingPatterns, borderRadius } from "../theme";
import { Block } from "../db/entries";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { useLLMForConvo } from "../ai/ModelProvider";
import {
  useEntry,
  useCreateEntry,
  useUpdateEntry,
  useDeleteEntry,
} from "../db/useEntries";
import {
  sendMessageWithResponse,
  type AIChatActionContext,
} from "./aiChatActions";

export interface AIChatComposerProps {
  entryId?: number;
  initialTitle?: string;
  initialBlocks?: Block[];
  onSave?: (entryId: number) => void;
  onCancel?: () => void;
}

export function AIChatComposer({
  entryId,
  initialTitle = "",
  initialBlocks = [],
  onSave,
  onCancel,
}: AIChatComposerProps) {
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
  const [newMessage, setNewMessage] = useState("");

  // Refs for UI only
  const flatListRef = useRef<FlatList<Block>>(null);
  const chatInputRef = useRef<TextInput>(null);

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
      setTitle: () => {}, // No-op - React Query handles title updates automatically
      llm,
      onSave: (id: number) => {
        scrollToBottom();
        onSave?.(id);
      },
    }),
    [createEntry, updateEntry, llm, onSave, scrollToBottom]
  );

  // Note: All initial work is now handled by BottomComposer via aiChatActions
  // before navigating to this composer. No need to queue work here.

  const handleBeforeDelete = useCallback(() => {
    if (!entryId) return;

    // Note: We no longer delete the LLM instance - the queue system will handle cleanup
    // The LLM will naturally finish any pending work or be garbage collected when needed
  }, [entryId]);

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
      {/* Floating Header Buttons */}
      <FloatingComposerHeader
        entryId={entryId}
        onBack={() => onCancel?.()}
        onBeforeDelete={handleBeforeDelete}
        disabled={createEntry.isPending || updateEntry.isPending}
        deleteConfirmTitle="Delete Conversation"
        deleteConfirmMessage="Are you sure you want to delete this conversation? This action cannot be undone."
      />

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
          {
            paddingTop: insets.top,
            paddingBottom: insets.bottom + spacingPatterns.md,
          },
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
  chatMessages: {
    flex: 1,
  },
  chatMessagesContent: {
    paddingHorizontal: spacingPatterns.screen,
    // paddingTop and paddingBottom are dynamic based on safe area insets
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
