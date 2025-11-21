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
import RenderHtml, {
  HTMLElementModel,
  HTMLContentModel,
} from "react-native-render-html";
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
import { GenerationResumptionPrompt } from "../components/GenerationResumptionPrompt";
import { useTrackScreenView } from "../analytics";
import { useGenerationResumption } from "../ai/useGenerationResumption";
import { llmQueue } from "../ai/ModelProvider";
import { useQueryClient } from "@tanstack/react-query";

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
      // Only highlight if the language is registered, otherwise return plain text
      if (lang && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(code, { language: lang }).value;
        } catch (err) {
          console.error("Error highlighting code:", err);
          // Return plain code without styling on error
          return code;
        }
      }
      // Return plain code for unknown languages - let the default code/pre styles handle it
      return code;
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

  // Scroll to bottom helper
  const scrollToBottom = useCallback((animated: boolean = true) => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated });
    }, 100);
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
      // Style think tags as dimmed/preliminary content
      // These tags show the model's reasoning process and will be removed when generation completes
      think: {
        color: seasonalTheme.textSecondary + "AA", // Dimmed text (67% opacity via hex)
        fontStyle: "italic" as const,
        fontSize: 13,
        opacity: 0.5,
        fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
        whiteSpace: "pre" as const, // Preserve whitespace and newlines
      },
      // Syntax highlighting colors - span elements
      span: {
        fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
        whiteSpace: "pre" as const,
      },
    }),
    [seasonalTheme.textPrimary, seasonalTheme.textSecondary]
  );

  // Custom renderer for think tags to ensure consistent styling for all children
  // This ensures that when markdown creates <p> tags or other elements inside <think>,
  // they all get the same dimmed styling
  const customRenderers = useMemo(() => {
    const thinkStyle = htmlTagsStyles.think;

    return {
      think: (props: any) => {
        const { TDefaultRenderer, ...restProps } = props;
        return (
          <TDefaultRenderer
            {...restProps}
            style={[thinkStyle, restProps.style]}
            // Apply think styling to all child elements by using a wrapper View
            // This ensures consistent styling even when markdown creates nested elements
          />
        );
      },
    };
  }, [htmlTagsStyles]);

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
      "language-javascript": {
        backgroundColor: "transparent",
        color: seasonalTheme.textPrimary,
      },
      "language-typescript": {
        backgroundColor: "transparent",
        color: seasonalTheme.textPrimary,
      },
      "language-python": {
        backgroundColor: "transparent",
        color: seasonalTheme.textPrimary,
      },
      "language-java": {
        backgroundColor: "transparent",
        color: seasonalTheme.textPrimary,
      },
      "language-cpp": {
        backgroundColor: "transparent",
        color: seasonalTheme.textPrimary,
      },
      "language-c++": {
        backgroundColor: "transparent",
        color: seasonalTheme.textPrimary,
      },
      "language-json": {
        backgroundColor: "transparent",
        color: seasonalTheme.textPrimary,
      },
      "language-xml": {
        backgroundColor: "transparent",
        color: seasonalTheme.textPrimary,
      },
      "language-html": {
        backgroundColor: "transparent",
        color: seasonalTheme.textPrimary,
      },
      "language-css": {
        backgroundColor: "transparent",
        color: seasonalTheme.textPrimary,
      },
      // Catch-all for unknown languages
      "language-bash": {
        backgroundColor: "transparent",
        color: seasonalTheme.textPrimary,
        fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
      },
      "language-shell": {
        backgroundColor: "transparent",
        color: seasonalTheme.textPrimary,
        fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
      },
      "language-plaintext": {
        backgroundColor: "transparent",
        color: seasonalTheme.textPrimary,
        fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
      },
      "language-text": {
        backgroundColor: "transparent",
        color: seasonalTheme.textPrimary,
        fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
      },
      "language-": {
        backgroundColor: "transparent",
        color: seasonalTheme.textPrimary,
        fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
      },
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

  // Pre-parse markdown to HTML outside of render callback
  const parsedMessages = useMemo(() => {
    return blocksWithPlaceholder.map((block, index) => {
      const isUser = block.role === "user";
      const messageContent = block.type === "markdown" ? block.content : "";
      const isEmpty = !messageContent || messageContent.trim().length === 0;
      const isLastMessage = index === blocksWithPlaceholder.length - 1;

      // Detect think tags - during generation, show them inline as preliminary content
      // Qwen uses <think>...</think> tags for reasoning - these are preliminary and will be removed when complete
      // Normalize both <think> and <think> opening tags to <think> for consistent styling
      const normalizedContent = messageContent
        .replace(/<think>/g, "<think>") // Normalize <think> to <think>
        .replace(/<think>/g, "<think>"); // Also normalize <think> to <think>

      const thinkTagRegex = /<think>[\s\S]*?<\/think>/g;
      const hasThinkTags = thinkTagRegex.test(normalizedContent);

      // Check if generation is complete - if so, strip think tags
      // During generation, show think tags inline as preliminary content
      const isGenerationInProgress =
        entry?.generationStatus === "generating" || isLLMLoading;
      const isGenerating = !isUser && isLastMessage && isGenerationInProgress;

      // During generation, keep think tags in content so they show as preliminary
      // After generation completes, strip them
      const shouldStripThinkTags = !isGenerating;
      const contentForDisplay = shouldStripThinkTags
        ? stripThinkTags(normalizedContent)
        : normalizedContent; // Keep think tags during generation

      // Check if we have any content (including think tags during generation)
      const hasActualContent = contentForDisplay.trim().length > 0;
      // During generation, also consider think tags as "content" to display
      const hasContentToShow =
        hasActualContent || (isGenerating && hasThinkTags);

      let htmlContent: string | null = null;
      if (!isUser && hasContentToShow && !isEmpty) {
        try {
          // Parse markdown WITH think tags during generation (so we can style them)
          // Think tags will be styled as preliminary/dimmed content via htmlTagsStyles
          let parsed = marked.parse(contentForDisplay) as string;

          // CRITICAL: After parsing, ensure all child elements inside think tags
          // get the think styling by wrapping them or ensuring they inherit styles
          // When markdown creates <p> tags inside <think>, they need to inherit think styling
          // We'll replace <p> tags inside think tags with styled versions
          if (isGenerating && hasThinkTags) {
            // Replace <p> tags that are direct children of <think> tags
            // This ensures consistent styling across line breaks
            parsed = parsed.replace(
              /<think>([\s\S]*?)<\/think>/g,
              (match, content) => {
                // Replace <p> tags inside think with spans that preserve styling
                const processedContent = content
                  .replace(/<p>/g, '<span style="display: block;">')
                  .replace(/<\/p>/g, "</span>");
                return `<think>${processedContent}</think>`;
              }
            );
          }

          htmlContent = parsed;
        } catch (error) {
          console.error("Error parsing markdown:", error);
          htmlContent = null;
        }
      }

      return {
        htmlContent,
        isGenerating,
        contentWithoutThinkTags: shouldStripThinkTags
          ? contentForDisplay
          : stripThinkTags(contentForDisplay),
        hasThinkTags,
        thinkContent: "", // Not used anymore - think tags shown inline
      };
    });
  }, [blocksWithPlaceholder, isLLMLoading, entry?.generationStatus]);

  // Render item for FlatList
  const renderMessage: ListRenderItem<Block> = useCallback(
    ({ item: message, index }) => {
      const isUser = message.role === "user";
      const messageContent = message.type === "markdown" ? message.content : "";
      const {
        htmlContent,
        isGenerating,
        contentWithoutThinkTags,
        hasThinkTags,
        thinkContent,
      } = parsedMessages[index] || {
        htmlContent: null,
        isGenerating: false,
        contentWithoutThinkTags: "",
        hasThinkTags: false,
        thinkContent: "",
      };

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
          {isGenerating && !htmlContent ? (
            // Show "Thinking..." only if we have no content to display yet
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
            // Show content (with think tags if generating, without if complete)
            <RenderHtml
              contentWidth={htmlContentWidth}
              source={{ html: htmlContent }}
              tagsStyles={htmlTagsStyles}
              baseStyle={htmlBaseStyle}
              classesStyles={htmlClassesStyles}
              renderers={customRenderers}
              enableExperimentalMarginCollapsing={false}
              enableCSSInlineProcessing={true}
              customHTMLElementModels={{
                think: HTMLElementModel.fromCustomModel({
                  tagName: "think",
                  contentModel: HTMLContentModel.mixed,
                }),
              }}
            />
          ) : (
            // Fallback text if no HTML content
            <Text
              variant="body"
              style={{
                color: seasonalTheme.textPrimary,
              }}
            >
              {contentWithoutThinkTags || " "}
            </Text>
          )}
        </View>
      );
    },
    [
      parsedMessages,
      seasonalTheme,
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
        onContentSizeChange={() => {
          // Auto-scroll to bottom when content size changes
          scrollToBottom();
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
  thinkTagContainer: {
    marginBottom: spacingPatterns.sm,
    padding: spacingPatterns.sm,
    borderRadius: borderRadius.md,
    borderLeftWidth: 3,
  },
  thinkTagLabel: {
    fontWeight: "600",
    marginBottom: spacingPatterns.xs / 2,
    fontSize: 11,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  thinkTagContent: {
    fontSize: 13,
    lineHeight: 18,
  },
});
