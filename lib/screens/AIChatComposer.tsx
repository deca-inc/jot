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
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import RenderHtml from "react-native-render-html";
import { marked } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js/lib/core";
// Import only the languages you need to keep bundle size small
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import java from "highlight.js/lib/languages/java";
import cpp from "highlight.js/lib/languages/cpp";
import json from "highlight.js/lib/languages/json";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import { Text, FloatingComposerHeader } from "../components";

// Register languages
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("java", java);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("c++", cpp);
hljs.registerLanguage("json", json);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("css", css);

// Configure marked with syntax highlighting
marked.use(
  markedHighlight({
    langPrefix: "hljs language-",
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : "plaintext";
      try {
        return hljs.highlight(code, { language }).value;
      } catch (err) {
        console.error("Error highlighting code:", err);
        return code;
      }
    },
  })
);

// Configure marked options
marked.setOptions({
  breaks: true,
  gfm: true,
});

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
  const { width } = useWindowDimensions();

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

  // HTML rendering styles - memoized for performance
  const htmlTagsStyles = useMemo(
    () => ({
      body: {
        color: seasonalTheme.textPrimary,
        fontSize: 15,
        lineHeight: 21,
        margin: 0,
        padding: 0,
        backgroundColor: "transparent",
      },
      p: {
        color: seasonalTheme.textPrimary,
        fontSize: 15,
        lineHeight: 21,
        marginTop: 0,
        marginBottom: 8,
      },
      b: { color: seasonalTheme.textPrimary, fontWeight: "bold" as const },
      strong: {
        color: seasonalTheme.textPrimary,
        fontWeight: "bold" as const,
      },
      i: { color: seasonalTheme.textPrimary, fontStyle: "italic" as const },
      em: { color: seasonalTheme.textPrimary, fontStyle: "italic" as const },
      u: {
        color: seasonalTheme.textPrimary,
        textDecorationLine: "underline" as const,
      },
      s: {
        color: seasonalTheme.textPrimary,
        textDecorationLine: "line-through" as const,
      },
      del: {
        color: seasonalTheme.textPrimary,
        textDecorationLine: "line-through" as const,
      },
      strike: {
        color: seasonalTheme.textPrimary,
        textDecorationLine: "line-through" as const,
      },
      h1: {
        color: seasonalTheme.textPrimary,
        fontSize: 20,
        lineHeight: 26,
        fontWeight: "bold" as const,
        marginTop: 0,
        marginBottom: 8,
      },
      h2: {
        color: seasonalTheme.textPrimary,
        fontSize: 18,
        lineHeight: 24,
        fontWeight: "bold" as const,
        marginTop: 0,
        marginBottom: 8,
      },
      h3: {
        color: seasonalTheme.textPrimary,
        fontSize: 16,
        lineHeight: 22,
        fontWeight: "bold" as const,
        marginTop: 0,
        marginBottom: 8,
      },
      ul: {
        color: seasonalTheme.textPrimary,
        marginLeft: 0,
        paddingLeft: 18,
        marginTop: 0,
        marginBottom: 8,
      },
      ol: {
        color: seasonalTheme.textPrimary,
        marginLeft: 0,
        paddingLeft: 18,
        marginTop: 0,
        marginBottom: 8,
      },
      li: {
        color: seasonalTheme.textPrimary,
        fontSize: 15,
        lineHeight: 21,
        marginBottom: 4,
        paddingLeft: 4,
      },
      code: {
        color: seasonalTheme.textPrimary,
        backgroundColor: seasonalTheme.textSecondary + "30",
        fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
        fontSize: 13,
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 4,
      },
      pre: {
        color: seasonalTheme.textPrimary,
        backgroundColor: seasonalTheme.textSecondary + "25",
        fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
        fontSize: 13,
        padding: 12,
        borderRadius: 8,
        marginTop: 4,
        marginBottom: 12,
        whiteSpace: "pre" as const,
      },
      blockquote: {
        color: seasonalTheme.textSecondary,
        borderLeftWidth: 4,
        borderLeftColor: seasonalTheme.textSecondary + "40",
        paddingLeft: 12,
        marginLeft: 0,
        marginTop: 0,
        marginBottom: 8,
        fontStyle: "italic" as const,
      },
      // Syntax highlighting colors - span elements
      span: {
        fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
        whiteSpace: "pre" as const,
      },
    }),
    [seasonalTheme.textPrimary, seasonalTheme.textSecondary]
  );

  const htmlContentWidth = useMemo(
    () => width - spacingPatterns.screen * 2,
    [width]
  );

  // Custom styles for code blocks to handle pre > code nesting
  const htmlBaseStyle = useMemo(
    () => ({
      backgroundColor: "transparent",
    }),
    []
  );

  // Syntax highlighting class styles (for hljs classes)
  const htmlClassesStyles = useMemo(
    () => ({
      // Base hljs class (the code element inside pre)
      hljs: {
        backgroundColor: "transparent",
        padding: 0,
        margin: 0,
        borderWidth: 0,
        whiteSpace: "pre" as const,
        fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
        fontSize: 13,
        color: seasonalTheme.textPrimary,
      },
      // Language-specific classes (language-python, language-javascript, etc.)
      "language-javascript": { backgroundColor: "transparent" },
      "language-typescript": { backgroundColor: "transparent" },
      "language-python": { backgroundColor: "transparent" },
      "language-java": { backgroundColor: "transparent" },
      "language-cpp": { backgroundColor: "transparent" },
      "language-c++": { backgroundColor: "transparent" },
      "language-json": { backgroundColor: "transparent" },
      "language-xml": { backgroundColor: "transparent" },
      "language-html": { backgroundColor: "transparent" },
      "language-css": { backgroundColor: "transparent" },
      // Keywords (if, else, function, const, let, var, etc.)
      "hljs-keyword": { color: "#CF8E6D" },
      "hljs-built_in": { color: "#CF8E6D" },
      "hljs-type": { color: "#CF8E6D" },

      // Strings
      "hljs-string": { color: "#6AAB73" },
      "hljs-template-variable": { color: "#6AAB73" },

      // Numbers
      "hljs-number": { color: "#6897BB" },
      "hljs-literal": { color: "#6897BB" },

      // Comments
      "hljs-comment": {
        color: seasonalTheme.textSecondary,
        fontStyle: "italic" as const,
      },
      "hljs-quote": {
        color: seasonalTheme.textSecondary,
        fontStyle: "italic" as const,
      },

      // Functions
      "hljs-function": { color: "#56A8F5" },
      "hljs-title": { color: "#56A8F5" },
      "hljs-name": { color: "#56A8F5" },

      // Variables and parameters
      "hljs-variable": { color: "#A9B7C6" },
      "hljs-params": { color: "#A9B7C6" },
      "hljs-attr": { color: "#A9B7C6" },

      // Classes and types
      "hljs-class": { color: "#A5C261" },

      // Operators
      "hljs-operator": { color: "#A9B7C6" },
      "hljs-punctuation": { color: "#A9B7C6" },

      // Meta (decorators, annotations)
      "hljs-meta": { color: "#BBB529" },
      "hljs-meta-keyword": { color: "#BBB529" },

      // Tags (HTML/XML)
      "hljs-tag": { color: "#E8BF6A" },
      "hljs-selector-tag": { color: "#E8BF6A" },

      // Attributes
      "hljs-attribute": { color: "#BABABA" },

      // Symbols and special
      "hljs-symbol": { color: "#9876AA" },
      "hljs-bullet": { color: "#9876AA" },
      "hljs-regexp": { color: "#D16969" },

      // Additions/deletions (for diffs)
      "hljs-addition": { backgroundColor: "#294436", color: "#6AAB73" },
      "hljs-deletion": { backgroundColor: "#484A4A", color: "#FF0000" },
    }),
    [seasonalTheme.textSecondary, seasonalTheme.textPrimary]
  );

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

      // Convert markdown to HTML for assistant messages
      let htmlContent: string | null = null;
      if (!isUser && messageContent && !isGenerating) {
        try {
          htmlContent = marked.parse(messageContent) as string;
        } catch (error) {
          console.error("Error parsing markdown:", error);
          htmlContent = null;
        }
      }

      // User messages get a bubble, AI messages are full width
      if (isUser) {
        return (
          <View style={[styles.messageBubble, styles.userMessage]}>
            <View
              style={[
                styles.messageContent,
                {
                  backgroundColor: seasonalTheme.chipBg || "rgba(0, 0, 0, 0.1)",
                },
              ]}
            >
              <Text
                variant="body"
                style={{
                  color: seasonalTheme.chipText || seasonalTheme.textPrimary,
                }}
              >
                {messageContent || " "}
              </Text>
            </View>
          </View>
        );
      }

      // AI messages: full width, no bubble
      return (
        <View style={styles.assistantMessageFullWidth}>
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
          ) : htmlContent ? (
            <RenderHtml
              contentWidth={htmlContentWidth}
              source={{ html: htmlContent }}
              tagsStyles={htmlTagsStyles}
              baseStyle={htmlBaseStyle}
              classesStyles={htmlClassesStyles}
              enableExperimentalMarginCollapsing={false}
              enableCSSInlineProcessing={true}
            />
          ) : (
            <Text
              variant="body"
              style={{
                color: seasonalTheme.textPrimary,
              }}
            >
              {messageContent || " "}
            </Text>
          )}
        </View>
      );
    },
    [
      isLLMLoading,
      seasonalTheme,
      displayedBlocks.length,
      htmlContentWidth,
      htmlTagsStyles,
      htmlBaseStyle,
      htmlClassesStyles,
    ]
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
  assistantMessageFullWidth: {
    marginBottom: spacingPatterns.md,
    width: "100%",
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
