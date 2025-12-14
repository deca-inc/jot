import React, {
  useState,
  useCallback,
  useRef,
  useMemo,
  useEffect,
} from "react";
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
  Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import RenderHtml from "react-native-render-html";
import { marked } from "marked";
import { Text, FloatingComposerHeader } from "../components";
import { GenerationResumptionPrompt } from "../components/GenerationResumptionPrompt";
import { useTrackScreenView } from "../analytics";
import { useGenerationResumption } from "../ai/useGenerationResumption";
import { llmQueue } from "../ai/ModelProvider";
import { useQueryClient } from "@tanstack/react-query";

// Configure marked for simple rendering
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
  generateAIResponse,
  type AIChatActionContext,
  stripThinkTags,
} from "./aiChatActions";
import { useModelSettings } from "../db/modelSettings";
import {
  getModelById,
  DEFAULT_MODEL,
  type LlmModelConfig,
} from "../ai/modelConfig";

export interface AIChatComposerProps {
  entryId?: number;
  initialTitle?: string;
  initialBlocks?: Block[];
  onSave?: (entryId: number) => void;
  onCancel?: () => void;
}

// Stable empty arrays to avoid re-renders
const EMPTY_BLOCKS: Block[] = [];

// Memoized user message component to prevent unnecessary re-renders
const UserMessageBubble = React.memo(
  ({
    block,
    chipBg,
    chipText,
    textPrimary,
  }: {
    block: Block;
    chipBg?: string;
    chipText?: string;
    textPrimary: string;
  }) => {
    const messageContent = block.type === "markdown" ? block.content : "";

    return (
      <View style={[styles.messageBubble, styles.userMessage]}>
        <View
          style={[
            styles.messageContent,
            {
              backgroundColor: chipBg || "rgba(0, 0, 0, 0.1)",
            },
          ]}
        >
          <Text
            variant="body"
            style={{
              color: chipText || textPrimary,
            }}
          >
            {messageContent || " "}
          </Text>
        </View>
      </View>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison - only re-render if content actually changed
    const prevContent = prevProps.block.type === "markdown" ? prevProps.block.content : "";
    const nextContent = nextProps.block.type === "markdown" ? nextProps.block.content : "";
    return prevContent === nextContent &&
           prevProps.chipBg === nextProps.chipBg &&
           prevProps.chipText === nextProps.chipText &&
           prevProps.textPrimary === nextProps.textPrimary;
  }
);

// Memoized assistant message component to prevent unnecessary re-renders
const AssistantMessage = React.memo(
  ({
    block,
    isGenerating,
    textSecondary,
    textPrimary,
    htmlContentWidth,
    htmlTagsStyles,
    customRenderers,
  }: {
    block: Block;
    isGenerating: boolean;
    textSecondary: string;
    textPrimary: string;
    htmlContentWidth: number;
    htmlTagsStyles: any;
    customRenderers: any;
  }) => {
    const messageContent = block.type === "markdown" ? block.content : "";

    // Parse content inside the component so it only happens when this specific message changes
    const parsed = React.useMemo(() => {
      // For non-generating messages, skip think tag processing entirely
      if (!isGenerating) {
        const cleanContent = stripThinkTags(messageContent);
        let htmlContent: string | null = null;

        if (cleanContent.trim().length > 0) {
          try {
            htmlContent = marked.parse(cleanContent) as string;
          } catch (error) {
            console.error("[AssistantMessage] Error parsing markdown:", error);
          }
        }

        return {
          htmlContent,
          hasThinkTags: false,
          thinkContent: "",
          contentWithoutThinkTags: cleanContent,
        };
      }

      // Only process think tags for generating messages
      const hasThinkTag = messageContent.includes('<think>');
      const hasClosedThinkTag = messageContent.includes('</think>');

      let thinkContent = "";
      let contentAfterThink = "";

      if (hasThinkTag) {
        const thinkMatch = messageContent.match(/<think>([\s\S]*?)(<\/think>|$)/);
        thinkContent = thinkMatch ? thinkMatch[1].trim() : "";

        if (thinkContent.length > 200) {
          thinkContent = "..." + thinkContent.slice(-200);
        }

        if (hasClosedThinkTag) {
          const afterThinkMatch = messageContent.match(/<\/think>([\s\S]*)/);
          contentAfterThink = afterThinkMatch ? afterThinkMatch[1].trim() : "";
        }
      } else {
        contentAfterThink = messageContent;
      }

      const hasActualContent = contentAfterThink.trim().length > 0;

      let htmlContent: string | null = null;
      if (hasActualContent) {
        try {
          htmlContent = marked.parse(contentAfterThink) as string;
        } catch (error) {
          console.error("[AssistantMessage] Error parsing markdown:", error);
        }
      }

      return {
        htmlContent,
        hasThinkTags: hasThinkTag && !!thinkContent,
        thinkContent,
        contentWithoutThinkTags: contentAfterThink,
      };
    }, [messageContent, isGenerating]);

    return (
      <View style={styles.assistantMessageFullWidth}>
        {/* Show thinking card if generating and has think content */}
        {isGenerating && parsed.hasThinkTags && parsed.thinkContent && (
          <View
            style={[
              styles.thinkingCard,
              {
                backgroundColor: textSecondary + "15",
                borderColor: textSecondary + "30",
              },
            ]}
          >
            <Text
              variant="caption"
              style={[
                styles.thinkingText,
                { color: textSecondary },
              ]}
              numberOfLines={2}
            >
              {parsed.thinkContent}
            </Text>
          </View>
        )}

        {/* Show actual content */}
        {isGenerating && !parsed.htmlContent && !parsed.thinkContent ? (
          <Text
            variant="body"
            style={{
              color: textSecondary,
              fontStyle: "italic",
            }}
          >
            Thinking...
          </Text>
        ) : parsed.htmlContent ? (
          <RenderHtml
            contentWidth={htmlContentWidth}
            source={{ html: parsed.htmlContent }}
            tagsStyles={htmlTagsStyles}
            renderers={customRenderers}
            ignoredDomTags={['think']}
          />
        ) : (
          parsed.contentWithoutThinkTags && (
            <Text
              variant="body"
              style={{
                color: textPrimary,
              }}
            >
              {parsed.contentWithoutThinkTags}
            </Text>
          )
        )}
      </View>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison - only re-render if content or isGenerating changed
    const prevContent = prevProps.block.type === "markdown" ? prevProps.block.content : "";
    const nextContent = nextProps.block.type === "markdown" ? nextProps.block.content : "";
    return prevContent === nextContent &&
           prevProps.isGenerating === nextProps.isGenerating &&
           prevProps.textSecondary === nextProps.textSecondary &&
           prevProps.textPrimary === nextProps.textPrimary &&
           prevProps.htmlContentWidth === nextProps.htmlContentWidth;
    // Note: htmlTagsStyles and customRenderers are stable objects, no need to check
  }
);

export function AIChatComposer({
  entryId,
  initialTitle = "",
  initialBlocks = EMPTY_BLOCKS,
  onSave,
  onCancel,
}: AIChatComposerProps) {
  const seasonalTheme = useSeasonalTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  // Track screen view
  useTrackScreenView("AI Chat Composer");

  // React Query hooks - load entry first
  const { data: entry } = useEntry(entryId);

  // Get model settings to determine which model to use
  // CRITICAL: Load config ONCE and use ref to keep it stable
  const modelSettings = useModelSettings();
  const modelConfigRef = useRef<LlmModelConfig>(DEFAULT_MODEL);

  // Load selected model from settings ONCE on mount
  React.useEffect(() => {
    async function loadSelectedModel() {
      const selectedModelId = await modelSettings.getSelectedModelId();
      if (selectedModelId) {
        const config = getModelById(selectedModelId);
        if (config) {
          modelConfigRef.current = config;
        }
      }
      // If no model selected or not found, ref already has DEFAULT_MODEL
    }
    loadSelectedModel();
  }, []); // Empty deps - only run once on mount

  // Use new LLM hook - pass entryId as convoId and for DB writes
  // When AIChatComposer mounts, it attaches to existing LLM instance if generation is already running
  // Use useRef to ensure convoId is stable across renders when there's no entryId
  const convoIdRef = useRef(entryId ? `entry-${entryId}` : `new-${Date.now()}`);
  const convoId = entryId ? `entry-${entryId}` : convoIdRef.current;

  const {
    llm,
    isLoading: isLLMLoading,
    error: llmError,
  } = useLLMForConvo(
    convoId,
    entryId,
    entry?.blocks, // Initialize with existing blocks if loading entry
    modelConfigRef.current // Use stable ref - won't change after initial load
  );

  const createEntry = useCreateEntry();
  const updateEntry = useUpdateEntry();

  // Check for incomplete generation for this specific entry
  const {
    currentPrompt: incompleteGenerationPrompt,
    dismissGeneration: dismissGenerationFromHook,
    clearCurrentPrompt,
  } = useGenerationResumption(entryId);

  // Local state for input only
  const [newMessage, setNewMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Refs for UI only
  const flatListRef = useRef<FlatList<Block>>(null);
  const chatInputRef = useRef<TextInput>(null);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Derive displayed data from entry or fallback to initial props
  const displayedTitle = entry?.title ?? initialTitle;
  const displayedBlocks = entry?.blocks ?? initialBlocks;

  // If entry has generationStatus "generating" but no assistant block yet, add a placeholder
  // This ensures the UI shows "Thinking..." even if the assistant block hasn't been created yet
  const blocksWithPlaceholder = useMemo(() => {
    if (
      entry?.generationStatus === "generating" &&
      displayedBlocks.length > 0 &&
      displayedBlocks[displayedBlocks.length - 1]?.role !== "assistant"
    ) {
      // Add placeholder assistant block to show "Thinking..." indicator
      return [
        ...displayedBlocks,
        {
          type: "markdown" as const,
          content: "",
          role: "assistant" as const,
        },
      ];
    }
    return displayedBlocks;
  }, [displayedBlocks, entry?.generationStatus]);

  // Show LLM errors
  if (llmError) {
    console.error("[AIChatComposer] LLM error:", llmError);
    Alert.alert("AI Error", llmError);
  }

  // Track user's intent to stay at bottom
  // Once user reaches bottom, assume they want to stay there until they scroll up
  const shouldStickToBottomRef = useRef(true); // Start true so initial messages scroll
  const previousContentHeightRef = useRef(0);
  // Track if user is actively touching the scroll view
  const isUserTouchingRef = useRef(false);

  // Helper to enable stick-to-bottom (used after user sends a message)
  const scrollToBottom = useCallback(() => {
    shouldStickToBottomRef.current = true;
    // The useLayoutEffect will handle the actual scrolling on next render
  }, []);

  // Track keyboard visibility and height on both platforms
  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const keyboardDidShow = Keyboard.addListener(showEvent, (e) => {
      setIsKeyboardVisible(true);
      setKeyboardHeight(e.endCoordinates.height);
    });

    const keyboardDidHide = Keyboard.addListener(hideEvent, () => {
      setIsKeyboardVisible(false);
      setKeyboardHeight(0);
    });

    return () => {
      keyboardDidShow.remove();
      keyboardDidHide.remove();
    };
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
      // Code element base styles (will be overridden by renderer for inline vs block)
      code: {
        fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
        fontSize: 13,
        color: seasonalTheme.textPrimary,
      },
      // Code block (triple backtick)
      pre: {
        color: seasonalTheme.textPrimary,
        backgroundColor: seasonalTheme.textSecondary + "15",
        borderColor: seasonalTheme.textSecondary + "30",
        borderWidth: 1,
        fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
        fontSize: 13,
        padding: spacingPatterns.sm,
        borderRadius: borderRadius.md,
        marginTop: spacingPatterns.xs,
        marginBottom: spacingPatterns.sm,
        overflow: "scroll" as const,
        whiteSpace: "pre-wrap" as const,
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

  // Custom renderer to handle inline code vs block code differently
  const customRenderers = useMemo(
    () => ({
      code: ({TDefaultRenderer, tnode, style, ...props}: any) => {
        // Check if this code element is inside a pre element (block code)
        const isBlockCode = tnode.parent?.tagName === 'pre';

        if (isBlockCode) {
          // Block code - no additional styling, pre handles it
          return <TDefaultRenderer tnode={tnode} style={style} {...props} />;
        }

        // Inline code - add background and padding
        const inlineStyle = {
          ...style,
          backgroundColor: seasonalTheme.textSecondary + "20",
          paddingHorizontal: 4,
          paddingVertical: 1,
          borderRadius: 3,
        };

        return <TDefaultRenderer tnode={tnode} style={inlineStyle} {...props} />;
      },
    }),
    [seasonalTheme.textSecondary]
  );



  const queryClient = useQueryClient();

  // Create action context for dispatching actions
  const actionContext = useMemo<AIChatActionContext>(
    () => ({
      createEntry,
      updateEntry,
      queryClient, // Pass query client for accessing cache
      setTitle: () => {}, // No-op - React Query handles title updates automatically
      llm,
      modelConfig: modelConfigRef.current, // Pass model config for title generation
      onSave: (id: number) => {
        scrollToBottom();
        onSave?.(id);
      },
    }),
    [createEntry, updateEntry, queryClient, llm, onSave, scrollToBottom]
  );

  // Custom resume handler that uses the existing llm instance
  const handleResumeGeneration = useCallback(
    async (generation: any) => {
      if (!llm || !entryId) {
        console.error("[AIChatComposer] Cannot resume: llm or entryId missing");
        return;
      }

      // Clear the prompt immediately when resume is clicked
      clearCurrentPrompt();

      try {
        console.log(
          `[AIChatComposer] Resuming generation for entry ${entryId}`
        );

        // Remove only the incomplete assistant message block (last block if it's assistant)
        // Keep all user messages intact
        const lastBlock = displayedBlocks[displayedBlocks.length - 1];
        const messagesForResume =
          lastBlock && lastBlock.role === "assistant"
            ? displayedBlocks.slice(0, -1)
            : displayedBlocks;

        // Update status to generating
        await new Promise<void>((resolve, reject) => {
          updateEntry.mutate(
            {
              id: entryId,
              input: {
                generationStatus: "generating",
                generationStartedAt: Date.now(),
              },
            },
            {
              onSuccess: () => resolve(),
              onError: reject,
            }
          );
        });

        // Generate response using existing llm instance
        // This will use the listeners from useLLMForConvo to update the UI
        await generateAIResponse(
          messagesForResume,
          actionContext,
          entryId,
          entry?.generationModelId || undefined
        );

        console.log(
          `[AIChatComposer] Successfully resumed generation for entry ${entryId}`
        );

        // Scroll to bottom to show the generation
        scrollToBottom();
      } catch (error) {
        console.error(`[AIChatComposer] Failed to resume generation:`, error);

        // Mark as failed
        try {
          await new Promise<void>((resolve, reject) => {
            updateEntry.mutate(
              {
                id: entryId,
                input: {
                  generationStatus: "failed",
                },
              },
              {
                onSuccess: () => resolve(),
                onError: reject,
              }
            );
          });
        } catch (updateError) {
          console.error(
            "[AIChatComposer] Failed to mark as failed:",
            updateError
          );
        }

        Alert.alert(
          "Resume Failed",
          `Failed to resume generation: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    },
    [
      llm,
      entryId,
      displayedBlocks,
      actionContext,
      updateEntry,
      entry?.generationModelId,
      scrollToBottom,
    ]
  );

  const dismissGeneration = useCallback(
    async (generation: any) => {
      // Clear the prompt immediately
      clearCurrentPrompt();
      await dismissGenerationFromHook(generation);
    },
    [dismissGenerationFromHook, clearCurrentPrompt]
  );

  // Reset isSubmitting when generation is actually in progress or completes
  useEffect(() => {
    const isGenerating = entry?.generationStatus === "generating" || isLLMLoading;
    if (isGenerating || entry?.generationStatus === "completed") {
      setIsSubmitting(false);
    }
  }, [entry?.generationStatus, isLLMLoading]);

  // Check if generation is in progress when returning to chat
  // The actions layer handles all the background work, so we just need to
  // check status and show the resume prompt if needed
  useEffect(() => {
    if (
      !entry ||
      !entryId ||
      entry.generationStatus !== "generating" ||
      incompleteGenerationPrompt
    ) {
      return;
    }

    // Check if there's an active generation in the queue
    const convoId = `entry-${entryId}`;
    const currentRequestId = llmQueue.getCurrentRequestId();

    // If generation is still running, just wait - actions layer handles everything
    if (currentRequestId === convoId) {
      return;
    }
  }, [entry, entryId, incompleteGenerationPrompt]);

  // Note: All initial work is now handled by BottomComposer via aiChatActions
  // before navigating to this composer. No need to queue work here.

  const handleBeforeDelete = useCallback(() => {
    if (!entryId) return;

    // Note: We no longer delete the LLM instance - the queue system will handle cleanup
    // The LLM will naturally finish any pending work or be garbage collected when needed
  }, [entryId]);

  const handleSendMessage = useCallback(async () => {
    if (!newMessage.trim() || !llm || isSubmitting) return;

    const messageText = newMessage.trim();
    setNewMessage("");
    setIsSubmitting(true);

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
      setIsSubmitting(false);
    }
    // Don't reset isSubmitting in finally - let the generation status change handle it
  }, [
    newMessage,
    entryId,
    displayedBlocks,
    displayedTitle,
    actionContext,
    llm,
    scrollToBottom,
    isSubmitting,
  ]);

  // Render item for FlatList - memoized to prevent unnecessary re-renders
  // Parsing happens inside the memoized components so only changed messages are re-parsed
  const renderMessage: ListRenderItem<Block> = useCallback(
    ({ item: block, index }) => {
      const isUser = block.role === "user";
      const isLastMessage = index === blocksWithPlaceholder.length - 1;

      // Check if generation is in progress
      const generationStatus = entry?.generationStatus;
      const isGenerationInProgress = generationStatus === "generating" || isLLMLoading;
      const isGenerating = !isUser && isLastMessage && isGenerationInProgress;

      // User messages get a bubble, AI messages are full width
      if (isUser) {
        return (
          <UserMessageBubble
            block={block}
            chipBg={seasonalTheme.chipBg}
            chipText={seasonalTheme.chipText}
            textPrimary={seasonalTheme.textPrimary}
          />
        );
      }

      // AI messages: full width, no bubble
      return (
        <AssistantMessage
          block={block}
          isGenerating={isGenerating}
          textSecondary={seasonalTheme.textSecondary}
          textPrimary={seasonalTheme.textPrimary}
          htmlContentWidth={htmlContentWidth}
          htmlTagsStyles={htmlTagsStyles}
          customRenderers={customRenderers}
        />
      );
    },
    [blocksWithPlaceholder.length, entry?.generationStatus, isLLMLoading, seasonalTheme, htmlContentWidth, htmlTagsStyles, customRenderers]
  );

  const keyExtractor = useCallback((item: Block, index: number) => {
    const content = "content" in item ? item.content : "";
    return `${index}-${content?.length || 0}`;
  }, []);

  // Prompt suggestions for empty AI chat
  const promptSuggestions = useMemo(() => [
    { icon: "sunny-outline" as const, text: "How can I make today meaningful?" },
    { icon: "bulb-outline" as const, text: "Help me brainstorm ideas for..." },
    { icon: "heart-outline" as const, text: "I want to reflect on how I'm feeling" },
    { icon: "compass-outline" as const, text: "I'm trying to make a decision about..." },
    { icon: "book-outline" as const, text: "Summarize my recent journal entries" },
    { icon: "trending-up-outline" as const, text: "What patterns do you see in my writing?" },
  ], []);

  const handlePromptSuggestionPress = useCallback((suggestion: string) => {
    setNewMessage(suggestion);
    chatInputRef.current?.focus();
  }, []);

  const ListEmptyComponent = useCallback(() => {
    return (
      <View style={styles.emptyChat}>
        <Text
          variant="h3"
          style={{
            color: seasonalTheme.textPrimary,
            marginBottom: spacingPatterns.sm,
            textAlign: "center",
          }}
        >
          Start a conversation
        </Text>
        <Text
          variant="body"
          style={{
            color: seasonalTheme.textSecondary,
            marginBottom: spacingPatterns.lg,
            textAlign: "center",
          }}
        >
          Your private AI is here to help you reflect, brainstorm, and think through anything on your mind.
        </Text>
        <View style={styles.suggestionGrid}>
          {promptSuggestions.map((suggestion, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.suggestionCard,
                {
                  backgroundColor: seasonalTheme.chipBg,
                  borderColor: seasonalTheme.textSecondary + "20",
                },
              ]}
              onPress={() => handlePromptSuggestionPress(suggestion.text)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={suggestion.icon}
                size={20}
                color={seasonalTheme.chipText}
                style={{ marginBottom: spacingPatterns.xs }}
              />
              <Text
                variant="caption"
                style={{
                  color: seasonalTheme.textPrimary,
                  textAlign: "center",
                  fontSize: 13,
                  lineHeight: 18,
                }}
                numberOfLines={2}
              >
                {suggestion.text}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }, [seasonalTheme, promptSuggestions, handlePromptSuggestionPress]);

  // Footer component for incomplete generation prompt
  const ListFooterComponent = useCallback(() => {
    if (!incompleteGenerationPrompt) {
      return null;
    }
    return (
      <GenerationResumptionPrompt
        generation={incompleteGenerationPrompt}
        onResume={handleResumeGeneration}
        onDismiss={dismissGeneration}
      />
    );
  }, [incompleteGenerationPrompt, handleResumeGeneration, dismissGeneration]);

  // Show UI shell immediately - content will load progressively
  return (
    <View
      style={[
        styles.container,
        { backgroundColor: seasonalTheme.gradient.middle },
      ]}
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
        data={blocksWithPlaceholder}
        renderItem={renderMessage}
        keyExtractor={keyExtractor}
        ListEmptyComponent={ListEmptyComponent}
        ListFooterComponent={ListFooterComponent}
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
        onScrollBeginDrag={() => {
          isUserTouchingRef.current = true;
        }}
        onScrollEndDrag={() => {
          isUserTouchingRef.current = false;
        }}
        onMomentumScrollEnd={() => {
          isUserTouchingRef.current = false;
        }}
        onScroll={(event) => {
          // Only change auto-scroll behavior if user is actively touching
          if (!isUserTouchingRef.current) {
            return;
          }

          // Track user intent based on scroll position
          const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
          const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;

          // User scrolled significantly away (>100px) - disable auto-scroll
          if (distanceFromBottom > 100) {
            if (shouldStickToBottomRef.current) {
              shouldStickToBottomRef.current = false;
            }
          }
          // User scrolled back to bottom (<20px) - re-enable auto-scroll
          else if (distanceFromBottom < 20) {
            if (!shouldStickToBottomRef.current) {
              shouldStickToBottomRef.current = true;
              // Trigger immediate scroll to ensure we're at the bottom
              flatListRef.current?.scrollToEnd({ animated: false });
            }
          }
        }}
        scrollEventThrottle={400} // Check scroll position every 400ms
        onContentSizeChange={(width, height) => {
          // Track actual rendered content height and scroll when it grows
          if (height > previousContentHeightRef.current && shouldStickToBottomRef.current) {
            if (flatListRef.current) {
              // Use scrollToOffset with actual height to ensure we're at the bottom
              // This is more reliable than scrollToEnd() during rapid updates
              flatListRef.current.scrollToOffset({ offset: height, animated: false });
            }
          }

          previousContentHeightRef.current = height;
        }}
        onLayout={() => {
          // Scroll to bottom on initial layout if we have messages
          if (blocksWithPlaceholder.length > 0) {
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
            paddingBottom: isKeyboardVisible
              ? spacingPatterns.sm
              : insets.bottom || spacingPatterns.sm,
            marginBottom:
              keyboardHeight > 0
                ? Platform.OS === "android"
                  ? keyboardHeight + insets.bottom // Android needs insets
                  : keyboardHeight // iOS keyboard height already accounts for safe area
                : 0,
          },
        ]}
      >
        {/* iOS: Filler element to cover gap between input and keyboard */}
        {Platform.OS === "ios" && (
          <View
            style={{
              position: "absolute",
              bottom: -200, // Extend well below the input
              left: 0,
              right: 0,
              height: 200,
              backgroundColor: seasonalTheme.cardBg,
            }}
          />
        )}
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
            updateEntry.isPending ||
            entry?.generationStatus === "generating" ||
            isLLMLoading ||
            isSubmitting
          }
          style={[
            styles.sendButton,
            {
              backgroundColor:
                newMessage.trim() &&
                llm &&
                !createEntry.isPending &&
                !updateEntry.isPending &&
                entry?.generationStatus !== "generating" &&
                !isLLMLoading &&
                !isSubmitting
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
    </View>
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
    paddingHorizontal: spacingPatterns.md,
  },
  suggestionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacingPatterns.sm,
    width: "100%",
    maxWidth: 400,
  },
  suggestionCard: {
    width: "47%",
    padding: spacingPatterns.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 80,
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
  thinkingCard: {
    marginBottom: spacingPatterns.sm,
    padding: spacingPatterns.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  thinkingText: {
    fontSize: 12,
    lineHeight: 16,
    fontStyle: "italic",
  },
});
