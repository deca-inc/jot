/* eslint-disable @typescript-eslint/no-explicit-any */
// Uses `any` for react-native-render-html renderers and dynamic message handling
import { Ionicons } from "@expo/vector-icons";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { marked } from "marked";
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
  Platform,
  TouchableOpacity,
  Alert,
  ListRenderItem,
  useWindowDimensions,
  Keyboard,
  ScrollView,
} from "react-native";
import { Message } from "react-native-executorch";
import RenderHtml from "react-native-render-html";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ALL_MODELS, getModelById } from "../ai/modelConfig";
import { useAIChat } from "../ai/useAIChat";
import { useTrackScreenView } from "../analytics";
import {
  Dialog,
  Text,
  FloatingComposerHeader,
  ModelManagementModal,
} from "../components";
import { type Agent, useAgents } from "../db/agents";
import { Block } from "../db/entries";
import { useModelSettings, ModelDownloadInfo } from "../db/modelSettings";
import { useEntry, useCreateEntry, useUpdateEntry } from "../db/useEntries";
import { spacingPatterns, borderRadius } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { useThrottle } from "../utils/debounce";

// Configure marked for simple rendering
marked.setOptions({
  breaks: true,
  gfm: true,
});

// Check if glass effect is available (iOS 26+)
const glassAvailable = Platform.OS === "ios" && isLiquidGlassAvailable();

// Helper to strip think tags from content
function stripThinkTags(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/<\/?think>/g, "")
    .trim();
}

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
    const prevContent =
      prevProps.block.type === "markdown" ? prevProps.block.content : "";
    const nextContent =
      nextProps.block.type === "markdown" ? nextProps.block.content : "";
    return (
      prevContent === nextContent &&
      prevProps.chipBg === nextProps.chipBg &&
      prevProps.chipText === nextProps.chipText &&
      prevProps.textPrimary === nextProps.textPrimary
    );
  },
);

/**
 * MarkdownRenderer - Renders markdown content as HTML
 * Memoized to prevent unnecessary re-renders of RenderHtml
 */
const MarkdownRenderer = React.memo(
  ({
    content,
    htmlContentWidth,
    htmlTagsStyles,
    customRenderers,
  }: {
    content: string;
    htmlContentWidth: number;
    htmlTagsStyles: any;
    customRenderers: any;
  }) => {
    const htmlContent = React.useMemo(() => {
      if (content.trim().length > 0) {
        try {
          return marked.parse(content) as string;
        } catch {
          return null;
        }
      }
      return null;
    }, [content]);

    if (!htmlContent) return null;

    return (
      <RenderHtml
        contentWidth={htmlContentWidth}
        source={{ html: htmlContent }}
        tagsStyles={htmlTagsStyles}
        renderers={customRenderers}
        ignoredDomTags={["think"]}
      />
    );
  },
  (prevProps, nextProps) => prevProps.content === nextProps.content,
);

/**
 * AssistantMessage - Renders AI responses with streaming support
 *
 * Throttling happens at parent level via useThrottle.
 * Handles think tags (shows thinking indicator) and strips them from final output.
 */
const AssistantMessage = React.memo(
  ({
    block,
    isGenerating,
    currentResponse,
    textSecondary,
    htmlContentWidth,
    htmlTagsStyles,
    customRenderers,
  }: {
    block: Block;
    isGenerating: boolean;
    currentResponse: string | null;
    textSecondary: string;
    htmlContentWidth: number;
    htmlTagsStyles: any;
    customRenderers: any;
  }) => {
    const blockContent = block.type === "markdown" ? block.content : "";
    const displayContent = isGenerating
      ? currentResponse || ""
      : blockContent || "";

    // Parse think tags from content
    const parsed = React.useMemo(() => {
      const hasThinkTag = displayContent.includes("<think>");
      const hasClosedThinkTag = displayContent.includes("</think>");

      if (!hasThinkTag) {
        return {
          thinkContent: "",
          contentAfterThink: isGenerating
            ? displayContent
            : stripThinkTags(displayContent),
          hasThinkTags: false,
        };
      }

      const thinkMatch = displayContent.match(/<think>([\s\S]*?)(<\/think>|$)/);
      let thinkContent = thinkMatch ? thinkMatch[1].trim() : "";
      if (thinkContent.length > 200) {
        thinkContent = "..." + thinkContent.slice(-200);
      }

      let contentAfterThink = "";
      if (hasClosedThinkTag) {
        const afterMatch = displayContent.match(/<\/think>([\s\S]*)/);
        contentAfterThink = afterMatch ? afterMatch[1].trim() : "";
      }

      return { thinkContent, contentAfterThink, hasThinkTags: !!thinkContent };
    }, [displayContent, isGenerating]);

    return (
      <View style={styles.assistantMessageFullWidth}>
        {/* Show thinking card if has think content */}
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
              style={[styles.thinkingText, { color: textSecondary }]}
              numberOfLines={2}
            >
              {parsed.thinkContent}
            </Text>
          </View>
        )}

        {/* Show actual content */}
        {isGenerating && !parsed.contentAfterThink && !parsed.thinkContent ? (
          <Text
            variant="body"
            style={{ color: textSecondary, fontStyle: "italic" }}
          >
            Thinking...
          </Text>
        ) : parsed.contentAfterThink ? (
          <MarkdownRenderer
            content={parsed.contentAfterThink}
            htmlContentWidth={htmlContentWidth}
            htmlTagsStyles={htmlTagsStyles}
            customRenderers={customRenderers}
          />
        ) : null}
      </View>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.isGenerating === nextProps.isGenerating &&
      prevProps.currentResponse === nextProps.currentResponse &&
      prevProps.textSecondary === nextProps.textSecondary &&
      prevProps.htmlContentWidth === nextProps.htmlContentWidth
    );
  },
);

export function AIChatComposer({
  entryId,
  initialBlocks = EMPTY_BLOCKS,
  onSave: _onSave,
  onCancel,
}: AIChatComposerProps) {
  const seasonalTheme = useSeasonalTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const modelSettings = useModelSettings();
  const agentsRepo = useAgents();

  // Track screen view
  useTrackScreenView("AI Chat Composer");

  // Model selector state
  const [downloadedModels, setDownloadedModels] = useState<ModelDownloadInfo[]>(
    [],
  );
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [currentResponse, setCurrentResponse] = useThrottle<string | null>(
    null,
    150,
  );

  // Agent state
  const [agents, setAgents] = useState<Agent[]>([]);
  const [currentAgent, setCurrentAgent] = useState<Agent | null>(null);

  // Model management modal state
  const [showModelManager, setShowModelManager] = useState(false);

  // Load downloaded models and agents on mount
  useEffect(() => {
    const loadSettings = async () => {
      const [downloaded, selected, allAgents, defaultAgent] = await Promise.all(
        [
          modelSettings.getDownloadedModels(),
          modelSettings.getSelectedModelId(),
          agentsRepo.getAll(),
          agentsRepo.getDefault(),
        ],
      );
      setDownloadedModels(downloaded);
      setSelectedModelId(selected);
      setAgents(allAgents);
      // Use default agent initially (will be overridden by entry's agent if available)
      if (defaultAgent) {
        setCurrentAgent(defaultAgent);
      }
    };
    loadSettings();
  }, []);

  // Get display name for selector button
  const selectorDisplayName = useMemo(() => {
    if (currentAgent) {
      return currentAgent.name;
    }
    if (!selectedModelId) return "Select";
    const model = getModelById(selectedModelId);
    return model?.displayName || selectedModelId;
  }, [selectedModelId, currentAgent]);

  // Handle agent selection
  const handleSelectAgent = useCallback(
    async (agent: Agent) => {
      setCurrentAgent(agent);
      // If agent has a specific model, switch to it
      if (agent.modelId) {
        setSelectedModelId(agent.modelId);
        await modelSettings.setSelectedModelId(agent.modelId);
      }
      setShowModelSelector(false);

      // Save to entry if we have one
      if (currentEntryIdRef.current) {
        await updateEntryRef.current.mutateAsync({
          id: currentEntryIdRef.current,
          input: {
            agentId: agent.id,
            generationModelId: agent.modelId || null,
          },
        });
      }
    },
    [modelSettings],
  );

  // Track current entry ID (can change when new entry is created)
  const [currentEntryId, setCurrentEntryId] = useState<number | undefined>(
    entryId,
  );

  // Use ref to track entry ID for callbacks (avoids stale closure issues)
  const currentEntryIdRef = useRef<number | undefined>(currentEntryId);
  currentEntryIdRef.current = currentEntryId;

  // React Query hooks - load entry first
  const { data: entry } = useEntry(currentEntryId);

  // Use ref for entry data too
  const entryRef = useRef(entry);
  entryRef.current = entry;

  // Load entry's saved model/agent when opening existing conversation
  useEffect(() => {
    const loadEntrySettings = async () => {
      if (!entry) return;

      // Load agent if saved on entry
      if (entry.agentId) {
        const agent = await agentsRepo.getById(entry.agentId);
        if (agent) {
          setCurrentAgent(agent);
          // Also set the model from the agent
          if (agent.modelId) {
            setSelectedModelId(agent.modelId);
          }
          return; // Agent takes precedence
        }
      }

      // Load model if saved on entry (and no agent)
      if (entry.generationModelId) {
        setSelectedModelId(entry.generationModelId);
        setCurrentAgent(null); // Clear agent when using raw model
        return;
      }

      // No saved selection on this entry - reset to defaults
      const [defaultAgent, defaultModelId] = await Promise.all([
        agentsRepo.getDefault(),
        modelSettings.getSelectedModelId(),
      ]);
      setCurrentAgent(defaultAgent);
      if (defaultModelId) {
        setSelectedModelId(defaultModelId);
      }
    };
    loadEntrySettings();
  }, [entry?.id, entry?.agentId, entry?.generationModelId, modelSettings]);

  const createEntry = useCreateEntry();
  const updateEntry = useUpdateEntry();

  // Use ref for updateEntry to avoid stale closures
  const updateEntryRef = useRef(updateEntry);
  updateEntryRef.current = updateEntry;

  // Use the simplified AI chat hook with agent settings
  const {
    isGenerating,
    sendMessage: aiSendMessage,
    setMessageHistory,
    stop: stopGeneration,
  } = useAIChat({
    systemPrompt: currentAgent?.systemPrompt,
    thinkMode: currentAgent?.thinkMode,
    onResponseComplete: async (response) => {
      // Save completed response to database
      const entryId = currentEntryIdRef.current;
      const currentEntry = entryRef.current;

      if (entryId) {
        const currentBlocks = currentEntry?.blocks || [];
        // Filter out empty assistant markdown blocks, keep all others
        const filteredBlocks = currentBlocks.filter((b) => {
          if (b.role === "assistant" && b.type === "markdown") {
            return b.content && b.content.trim().length > 0;
          }
          return true;
        });

        const updatedBlocks: Block[] = [
          ...filteredBlocks,
          { type: "markdown", content: response, role: "assistant" },
        ];

        await updateEntryRef.current.mutateAsync({
          id: entryId,
          input: { blocks: updatedBlocks },
        });
      }
      setCurrentResponse(null);
      setIsSubmitting(false);
    },
    onResponseUpdate: (responseSoFar: string) => {
      setCurrentResponse(responseSoFar);
    },
    onError: (error) => {
      Alert.alert("AI Error", error);
      setIsSubmitting(false);
    },
  });

  // Handle model selection - updates setting and tells LLM to refresh
  const handleSelectModel = useCallback(
    async (modelId: string) => {
      setSelectedModelId(modelId);
      await modelSettings.setSelectedModelId(modelId);
      setShowModelSelector(false);

      // Save to entry if we have one (clear agent since raw model was selected)
      if (currentEntryIdRef.current) {
        await updateEntryRef.current.mutateAsync({
          id: currentEntryIdRef.current,
          input: {
            agentId: null,
            generationModelId: modelId,
          },
        });
      }
    },
    [modelSettings],
  );

  // Initialize message history from existing entry
  useEffect(() => {
    if (entry?.blocks) {
      const messages: Message[] = entry.blocks
        .filter(
          (
            b,
          ): b is Extract<Block, { type: "markdown" }> & {
            role: "user" | "assistant";
          } =>
            b.type === "markdown" &&
            (b.role === "user" || b.role === "assistant"),
        )
        .map((b) => ({ role: b.role, content: b.content }));
      setMessageHistory(messages);
    }
  }, [entry?.id]);

  // Local state for input only
  const [newMessage, setNewMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Refs for UI only
  const flatListRef = useRef<FlatList<Block>>(null);
  const chatInputRef = useRef<TextInput>(null);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Derive displayed data from entry or fallback to initial props
  const displayedBlocks = entry?.blocks ?? initialBlocks;

  // Build blocks with placeholder for generating state
  const blocksWithPlaceholder = useMemo(() => {
    const blocks = [...displayedBlocks];

    // If generating, add placeholder assistant block
    if (isGenerating) {
      const lastBlock = blocks[blocks.length - 1];

      if (lastBlock?.role === "assistant" && lastBlock.type === "markdown") {
        // Keep existing block - AssistantMessage will use streamingContentRef
        blocks[blocks.length - 1] = {
          type: "markdown" as const,
          content: "", // Content comes from streamingContentRef
          role: "assistant" as const,
        };
      } else {
        // Add placeholder assistant block
        blocks.push({
          type: "markdown" as const,
          content: "", // Content comes from streamingContentRef
          role: "assistant" as const,
        });
      }
    }

    return blocks;
  }, [displayedBlocks, isGenerating]);

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
    [seasonalTheme.textPrimary, seasonalTheme.textSecondary],
  );

  const htmlContentWidth = useMemo(
    () => width - spacingPatterns.screen * 2,
    [width],
  );

  // Custom renderer to handle inline code vs block code differently
  const customRenderers = useMemo(
    () => ({
      code: ({ TDefaultRenderer, tnode, style, ...props }: any) => {
        // Check if this code element is inside a pre element (block code)
        const isBlockCode = tnode.parent?.tagName === "pre";

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

        return (
          <TDefaultRenderer tnode={tnode} style={inlineStyle} {...props} />
        );
      },
    }),
    [seasonalTheme.textSecondary],
  );

  // Simple delete handler - no cleanup needed for LLM
  const handleBeforeDelete = useCallback(() => {
    // Stop any ongoing generation
    if (isGenerating) {
      stopGeneration();
    }
  }, [isGenerating, stopGeneration]);

  // Use ref for aiSendMessage to avoid stale closure issues
  const aiSendMessageRef = useRef(aiSendMessage);
  aiSendMessageRef.current = aiSendMessage;

  const handleSendMessage = useCallback(async () => {
    if (!newMessage.trim() || isSubmitting || isGenerating) return;

    const messageText = newMessage.trim();
    setNewMessage("");
    setIsSubmitting(true);

    try {
      let entryIdToUse = currentEntryId;

      // If this is a new conversation, create entry first
      if (!entryIdToUse) {
        // Use first message as title (truncated to 60 chars)
        const title =
          messageText.length > 60
            ? messageText.substring(0, 57) + "..."
            : messageText;

        const newEntry = await createEntry.mutateAsync({
          type: "ai_chat",
          title,
          blocks: [{ type: "markdown", content: messageText, role: "user" }],
          agentId: currentAgent?.id,
        });

        entryIdToUse = newEntry.id;
        setCurrentEntryId(newEntry.id);
      } else {
        // Add user message to existing entry
        const updatedBlocks: Block[] = [
          ...displayedBlocks,
          { type: "markdown", content: messageText, role: "user" },
        ];

        await updateEntry.mutateAsync({
          id: entryIdToUse,
          input: { blocks: updatedBlocks },
        });
      }

      // Send message through AI hook (use ref to get latest function)
      // useAIChat will auto-register pending save since we pass entryId and currentBlocks
      await aiSendMessageRef.current(messageText);

      // Note: Don't call onSave here - it triggers navigation which can unmount
      // the component before onResponseComplete fires. The entry is already
      // created and the response will be saved in onResponseComplete.

      // Scroll to bottom (don't auto-focus input - let user tap to continue)
      scrollToBottom();
    } catch (error) {
      console.error("[AIChatComposer] Error sending message:", error);
      Alert.alert(
        "Error",
        `Failed to send message: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      setIsSubmitting(false);
    }
  }, [
    newMessage,
    currentEntryId,
    displayedBlocks,
    createEntry,
    updateEntry,
    isGenerating,
    scrollToBottom,
    isSubmitting,
  ]);

  // Render item for FlatList - memoized to prevent unnecessary re-renders
  // Parsing happens inside the memoized components so only changed messages are re-parsed
  const renderMessage: ListRenderItem<Block> = useCallback(
    ({ item: block, index }) => {
      const isUser = block.role === "user";
      const isLastMessage = index === blocksWithPlaceholder.length - 1;

      // Check if this is the generating message (last assistant message while generating)
      const isGeneratingMessage = !isUser && isLastMessage && isGenerating;

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
          isGenerating={isGeneratingMessage}
          currentResponse={currentResponse}
          textSecondary={seasonalTheme.textSecondary}
          htmlContentWidth={htmlContentWidth}
          htmlTagsStyles={htmlTagsStyles}
          customRenderers={customRenderers}
        />
      );
    },
    [
      blocksWithPlaceholder.length,
      isGenerating,
      currentResponse,
      seasonalTheme.textSecondary,
      htmlContentWidth,
      htmlTagsStyles,
      customRenderers,
    ],
  );

  const keyExtractor = useCallback((item: Block, index: number) => {
    const content = "content" in item ? item.content : "";
    return `${index}-${content?.length || 0}`;
  }, []);

  // Prompt suggestions for empty AI chat
  const promptSuggestions = useMemo(
    () => [
      {
        icon: "sunny-outline" as const,
        text: "Summarize this article for me. ",
      },
      { icon: "bulb-outline" as const, text: "Help me brainstorm ideas for " },
      {
        icon: "heart-outline" as const,
        text: "I want to reflect on how I'm feeling ",
      },
      {
        icon: "compass-outline" as const,
        text: "I'm trying to make a decision about ",
      },
    ],
    [],
  );

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
          Your private AI is here to help you reflect, brainstorm, and think
          through anything on your mind.
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

      {/* Model Selector - next to back button (only show if multiple models downloaded) */}
      {downloadedModels.length > 1 && (
        <View
          style={[
            styles.modelSelectorContainer,
            !glassAvailable && styles.fallbackShadow,
          ]}
        >
          {glassAvailable ? (
            <GlassView
              glassEffectStyle="regular"
              tintColor={seasonalTheme.cardBg}
              style={styles.modelSelectorGlass}
            >
              <TouchableOpacity
                onPress={() => setShowModelSelector(true)}
                style={styles.modelSelectorButton}
                disabled={isGenerating}
              >
                <Ionicons
                  name="hardware-chip-outline"
                  size={16}
                  color={
                    isGenerating
                      ? seasonalTheme.textSecondary
                      : seasonalTheme.textPrimary
                  }
                />
                <Text
                  variant="caption"
                  style={{
                    color: isGenerating
                      ? seasonalTheme.textSecondary
                      : seasonalTheme.textPrimary,
                    fontWeight: "500",
                    marginLeft: 4,
                  }}
                  numberOfLines={1}
                >
                  {selectorDisplayName}
                </Text>
                <Ionicons
                  name="chevron-down"
                  size={14}
                  color={
                    isGenerating
                      ? seasonalTheme.textSecondary
                      : seasonalTheme.textPrimary
                  }
                />
              </TouchableOpacity>
            </GlassView>
          ) : (
            <View
              style={[
                styles.modelSelectorGlass,
                { backgroundColor: seasonalTheme.glassFallbackBg },
              ]}
            >
              <TouchableOpacity
                onPress={() => setShowModelSelector(true)}
                style={styles.modelSelectorButton}
                disabled={isGenerating}
              >
                <Ionicons
                  name="hardware-chip-outline"
                  size={16}
                  color={
                    isGenerating
                      ? seasonalTheme.textSecondary
                      : seasonalTheme.textPrimary
                  }
                />
                <Text
                  variant="caption"
                  style={{
                    color: isGenerating
                      ? seasonalTheme.textSecondary
                      : seasonalTheme.textPrimary,
                    fontWeight: "500",
                    marginLeft: 4,
                  }}
                  numberOfLines={1}
                >
                  {selectorDisplayName}
                </Text>
                <Ionicons
                  name="chevron-down"
                  size={14}
                  color={
                    isGenerating
                      ? seasonalTheme.textSecondary
                      : seasonalTheme.textPrimary
                  }
                />
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Model Selector Dialog */}
      <Dialog
        visible={showModelSelector}
        onRequestClose={() => setShowModelSelector(false)}
      >
        <View style={styles.modelSelectorDialog}>
          <Text
            variant="h4"
            style={{
              color: seasonalTheme.textPrimary,
              marginBottom: spacingPatterns.md,
            }}
          >
            Select Agent or Model
          </Text>
          <ScrollView
            style={styles.modelSelectorScroll}
            showsVerticalScrollIndicator={false}
          >
            {/* Agents Section */}
            {agents.length > 0 && (
              <>
                <Text
                  variant="caption"
                  style={{
                    color: seasonalTheme.textSecondary,
                    marginBottom: spacingPatterns.xs,
                    fontWeight: "600",
                  }}
                >
                  AGENTS
                </Text>
                {agents.map((agent) => {
                  const isSelected = currentAgent?.id === agent.id;
                  const agentModel = agent.modelId
                    ? getModelById(agent.modelId)
                    : null;
                  return (
                    <TouchableOpacity
                      key={`agent-${agent.id}`}
                      onPress={() => handleSelectAgent(agent)}
                      style={[
                        styles.modelOption,
                        {
                          backgroundColor: isSelected
                            ? seasonalTheme.chipBg
                            : "transparent",
                          borderColor: isSelected
                            ? seasonalTheme.textSecondary + "40"
                            : "transparent",
                        },
                      ]}
                    >
                      <View style={styles.modelOptionContent}>
                        <View style={styles.agentOptionRow}>
                          <Ionicons
                            name="person-circle-outline"
                            size={16}
                            color={seasonalTheme.textSecondary}
                          />
                          <Text
                            variant="body"
                            style={{
                              color: seasonalTheme.textPrimary,
                              fontWeight: isSelected ? "600" : "400",
                            }}
                          >
                            {agent.name}
                          </Text>
                          {agent.isDefault && (
                            <View
                              style={[
                                styles.defaultBadge,
                                {
                                  backgroundColor:
                                    seasonalTheme.textSecondary + "20",
                                },
                              ]}
                            >
                              <Text
                                variant="caption"
                                style={{
                                  color: seasonalTheme.textSecondary,
                                  fontSize: 9,
                                }}
                              >
                                DEFAULT
                              </Text>
                            </View>
                          )}
                        </View>
                        {agentModel && (
                          <Text
                            variant="caption"
                            style={{ color: seasonalTheme.textSecondary }}
                          >
                            {agentModel.displayName}
                          </Text>
                        )}
                      </View>
                      {isSelected && (
                        <Ionicons
                          name="checkmark"
                          size={20}
                          color={seasonalTheme.textPrimary}
                        />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </>
            )}

            {/* LLMs Section */}
            <Text
              variant="caption"
              style={{
                color: seasonalTheme.textSecondary,
                marginTop: agents.length > 0 ? spacingPatterns.md : 0,
                marginBottom: spacingPatterns.xs,
                fontWeight: "600",
              }}
            >
              MODELS
            </Text>
            {downloadedModels
              .filter((m) => !m.modelType || m.modelType === "llm")
              .map((downloaded) => {
                const model = ALL_MODELS.find(
                  (m) => m.modelId === downloaded.modelId,
                );
                if (!model) return null;
                const isSelected =
                  !currentAgent && selectedModelId === model.modelId;
                return (
                  <TouchableOpacity
                    key={model.modelId}
                    onPress={() => {
                      setCurrentAgent(null);
                      handleSelectModel(model.modelId);
                    }}
                    style={[
                      styles.modelOption,
                      {
                        backgroundColor: isSelected
                          ? seasonalTheme.chipBg
                          : "transparent",
                        borderColor: isSelected
                          ? seasonalTheme.textSecondary + "40"
                          : "transparent",
                      },
                    ]}
                  >
                    <View style={styles.modelOptionContent}>
                      <Text
                        variant="body"
                        style={{
                          color: seasonalTheme.textPrimary,
                          fontWeight: isSelected ? "600" : "400",
                        }}
                      >
                        {model.displayName}
                      </Text>
                      <Text
                        variant="caption"
                        style={{ color: seasonalTheme.textSecondary }}
                      >
                        {model.description}
                      </Text>
                    </View>
                    {isSelected && (
                      <Ionicons
                        name="checkmark"
                        size={20}
                        color={seasonalTheme.textPrimary}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
          </ScrollView>
        </View>
      </Dialog>

      {/* Messages with FlatList for better performance */}
      <FlatList
        ref={flatListRef}
        data={blocksWithPlaceholder}
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
          const { layoutMeasurement, contentOffset, contentSize } =
            event.nativeEvent;
          const distanceFromBottom =
            contentSize.height - layoutMeasurement.height - contentOffset.y;

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
          if (
            height > previousContentHeightRef.current &&
            shouldStickToBottomRef.current
          ) {
            if (flatListRef.current) {
              // Use scrollToOffset with actual height to ensure we're at the bottom
              // This is more reliable than scrollToEnd() during rapid updates
              flatListRef.current.scrollToOffset({
                offset: height,
                animated: false,
              });
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
          editable={!isGenerating}
          onSubmitEditing={handleSendMessage}
          returnKeyType="send"
          blurOnSubmit={false}
        />
        <TouchableOpacity
          onPress={handleSendMessage}
          disabled={
            !newMessage.trim() ||
            createEntry.isPending ||
            updateEntry.isPending ||
            isGenerating ||
            isSubmitting
          }
          style={[
            styles.sendButton,
            {
              backgroundColor:
                newMessage.trim() &&
                !createEntry.isPending &&
                !updateEntry.isPending &&
                !isGenerating &&
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
              !createEntry.isPending &&
              !updateEntry.isPending &&
              !isGenerating &&
              !isSubmitting
                ? seasonalTheme.chipText || seasonalTheme.textPrimary
                : seasonalTheme.textSecondary + "80"
            }
          />
        </TouchableOpacity>
      </View>

      {/* Model Management Modal */}
      <ModelManagementModal
        visible={showModelManager}
        onClose={() => setShowModelManager(false)}
        initialTab="llms"
      />
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
  modelSelectorContainer: {
    position: "absolute",
    top: spacingPatterns.xxs,
    left: spacingPatterns.sm + 44 + spacingPatterns.xs, // After back button
    zIndex: 1000,
  },
  modelSelectorGlass: {
    borderRadius: borderRadius.full,
    overflow: "hidden",
    // Shadow for GlassView case
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  fallbackShadow: {
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.15)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  modelSelectorButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacingPatterns.sm,
    paddingVertical: spacingPatterns.xs,
    height: 44,
    gap: 4,
  },
  modelSelectorDialog: {
    minWidth: 280,
  },
  modelSelectorScroll: {
    maxHeight: 400,
  },
  modelOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacingPatterns.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    marginBottom: spacingPatterns.xs,
  },
  modelOptionContent: {
    flex: 1,
    gap: 2,
  },
  agentOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  defaultBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
});
