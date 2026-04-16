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
  forwardRef,
  useImperativeHandle,
  memo,
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
import { ALL_MODELS, ALL_LLM_MODELS, getModelById } from "../ai/modelConfig";
import { isRemoteModelId, isCustomLocalModelId } from "../ai/modelTypeGuards";
import {
  getAvailablePersonas,
  getPersonaResolutionInfo,
  isPersonaAvailableOnPlatform,
  resolvePersonaModel,
} from "../ai/personaAvailability";
import { getCurrentPlatform } from "../ai/platformFilter";
import { useAIChat } from "../ai/useAIChat";
import { usePlatformModels, isPlatformModelId } from "../ai/usePlatformModels";
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
import { useCustomModels } from "../db/useCustomModels";
import { useEntry, useCreateEntry, useUpdateEntry } from "../db/useEntries";
import { useSyncEngine } from "../sync";
import { spacingPatterns, borderRadius } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { useThrottle } from "../utils/debounce";
import type {
  RemoteModelConfig,
  CustomLocalModelConfig,
} from "../ai/customModels";
import type { SeasonalTheme } from "../theme/seasonalTheme";

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
  /** Hide the back button (e.g., in sidebar layout) */
  hideBackButton?: boolean;
  /** Called with model display name so parent can render it in the header */
  onModelInfo?: (info: {
    displayName: string;
    openSelector: () => void;
  }) => void;
  /**
   * Called whenever the composer's active entry id changes, including
   * when a brand-new entry is created mid-session. Used by the route
   * to update the header title without triggering navigation/unmount.
   */
  onComposerEntryId?: (id: number | undefined) => void;
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
    htmlBaseStyle,
    customRenderers,
  }: {
    content: string;
    htmlContentWidth: number;
    htmlTagsStyles: any;
    htmlBaseStyle: {
      color: string;
      fontFamily: string;
      fontSize: number;
      lineHeight: number;
    };
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
        baseStyle={htmlBaseStyle}
        renderers={customRenderers}
        ignoredDomTags={["think", "audio", "button"]}
      />
    );
  },
  (prevProps, nextProps) =>
    prevProps.content === nextProps.content &&
    prevProps.htmlBaseStyle === nextProps.htmlBaseStyle,
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
    htmlBaseStyle,
    customRenderers,
  }: {
    block: Block;
    isGenerating: boolean;
    currentResponse: string | null;
    textSecondary: string;
    htmlContentWidth: number;
    htmlTagsStyles: any;
    htmlBaseStyle: {
      color: string;
      fontFamily: string;
      fontSize: number;
      lineHeight: number;
    };
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
            htmlBaseStyle={htmlBaseStyle}
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
      prevProps.htmlBaseStyle === nextProps.htmlBaseStyle &&
      prevProps.textSecondary === nextProps.textSecondary &&
      prevProps.htmlContentWidth === nextProps.htmlContentWidth
    );
  },
);

// ---------------------------------------------------------------------------
// ChatInputBar
// ---------------------------------------------------------------------------
// Extracted so that keystrokes are fully local state and never cause the
// parent (AIChatComposer) to re-render. The parent passes a *stable*
// onSubmit callback (see handleSendMessageStable in AIChatComposer) and a
// few props that only change on meaningful state transitions (generation
// started/finished, mutation pending, etc). The input text itself is
// owned by this component.

export interface ChatInputBarHandle {
  setText: (text: string) => void;
  focus: () => void;
}

interface ChatInputBarProps {
  onSubmit: (text: string) => void;
  isGenerating: boolean;
  isSubmitting: boolean;
  createPending: boolean;
  updatePending: boolean;
  seasonalTheme: SeasonalTheme;
  keyboardHeight: number;
  insetsBottom: number;
}

const ChatInputBar = memo(
  forwardRef<ChatInputBarHandle, ChatInputBarProps>(function ChatInputBar(
    {
      onSubmit,
      isGenerating,
      isSubmitting,
      createPending,
      updatePending,
      seasonalTheme,
      keyboardHeight,
      insetsBottom,
    },
    ref,
  ) {
    const [text, setText] = useState("");
    const inputRef = useRef<TextInput>(null);

    useImperativeHandle(
      ref,
      () => ({
        setText: (t: string) => {
          setText(t);
          inputRef.current?.focus();
        },
        focus: () => inputRef.current?.focus(),
      }),
      [],
    );

    const handleSend = useCallback(() => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setText("");
      onSubmit(trimmed);
    }, [text, onSubmit]);

    // On web, Enter submits and Shift+Enter inserts a newline.
    const handleKeyPress = useCallback(
      (e: { nativeEvent: { key: string; shiftKey?: boolean } }) => {
        if (
          Platform.OS === "web" &&
          e.nativeEvent.key === "Enter" &&
          !e.nativeEvent.shiftKey
        ) {
          // Prevent the default newline insertion
          (e as unknown as { preventDefault: () => void }).preventDefault();
          handleSend();
        }
      },
      [handleSend],
    );

    const canSend =
      text.trim().length > 0 &&
      !createPending &&
      !updatePending &&
      !isGenerating &&
      !isSubmitting;

    const isDesktop = Platform.OS === "web" || Platform.OS === "macos";

    return (
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: keyboardHeight,
          alignItems: "center",
          backgroundColor: seasonalTheme.gradient.middle,
          paddingBottom:
            keyboardHeight > 0
              ? spacingPatterns.sm
              : insetsBottom || spacingPatterns.sm,
        }}
      >
        {Platform.OS === "ios" && (
          <View
            style={{
              position: "absolute",
              bottom: -200,
              left: 0,
              right: 0,
              height: 200,
              backgroundColor: seasonalTheme.gradient.middle,
            }}
          />
        )}
        <View style={styles.chatInputContainer}>
          <View style={{ flex: 1, position: "relative" }}>
            <TextInput
              ref={inputRef}
              style={[
                styles.chatInput,
                {
                  color: seasonalTheme.textPrimary,
                  borderColor: seasonalTheme.textSecondary + "20",
                  backgroundColor: seasonalTheme.isDark
                    ? "rgba(255,255,255,0.08)"
                    : "rgba(0,0,0,0.04)",
                  // Extra right padding on mobile to make room for the send button
                  paddingRight: isDesktop
                    ? spacingPatterns.md
                    : spacingPatterns.md + 36,
                },

                { outlineStyle: "none" } as unknown as Record<string, string>,
              ]}
              placeholder="Reply..."
              placeholderTextColor={seasonalTheme.textSecondary + "80"}
              value={text}
              onChangeText={setText}
              multiline
              editable={!isGenerating}
              onSubmitEditing={handleSend}
              onKeyPress={handleKeyPress}
              returnKeyType="send"
              blurOnSubmit={false}
            />
            {/* Mobile-only send button inside the input */}
            {!isDesktop && (
              <TouchableOpacity
                onPress={handleSend}
                disabled={!canSend}
                style={[
                  styles.sendButtonInline,
                  {
                    backgroundColor: canSend
                      ? seasonalTheme.textPrimary
                      : seasonalTheme.textSecondary + "30",
                  },
                ]}
              >
                <Ionicons
                  name="arrow-up"
                  size={18}
                  color={
                    canSend
                      ? seasonalTheme.gradient.middle
                      : seasonalTheme.textSecondary + "60"
                  }
                />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  }),
);

export function AIChatComposer({
  entryId,
  initialBlocks = EMPTY_BLOCKS,
  onSave: _onSave,
  onCancel,
  hideBackButton = false,
  onModelInfo,
  onComposerEntryId,
}: AIChatComposerProps) {
  const seasonalTheme = useSeasonalTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const modelSettings = useModelSettings();
  const agentsRepo = useAgents();
  const { platformLLMs } = usePlatformModels();

  // Track screen view
  useTrackScreenView("AI Chat Composer");

  // Model selector state
  const [downloadedModels, setDownloadedModels] = useState<ModelDownloadInfo[]>(
    [],
  );
  const [remoteModels, setRemoteModels] = useState<RemoteModelConfig[]>([]);
  const [customLocalModels, setCustomLocalModels] = useState<
    CustomLocalModelConfig[]
  >([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [showModelSelector, setShowModelSelector] = useState(false);
  // Tracks whether the user made a manual model/persona selection in the quick
  // selector during this session. When true, the entry-load effect skips
  // overwriting selectedModelId from the (possibly stale) entry cache.
  const userOverrodeModelRef = useRef(false);
  const customModels = useCustomModels();
  const [currentResponse, setCurrentResponse] = useThrottle<string | null>(
    null,
    150,
  );

  // Agent state
  const [agents, setAgents] = useState<Agent[]>([]);
  const [currentAgent, setCurrentAgent] = useState<Agent | null>(null);

  // Personas whose underlying model runs on this platform. Personas without
  // a modelId are kept (they're editable but not launchable) so users can
  // still see and fix them. See lib/ai/personaAvailability.ts.
  const availableAgents = useMemo(() => {
    const platform = getCurrentPlatform();
    const withModel = agents.filter(
      (a): a is Agent & { modelId: string } => a.modelId !== null,
    );
    const available = getAvailablePersonas(withModel, ALL_LLM_MODELS, platform);
    const allowed = new Set<number>([
      ...available.map((a) => a.id),
      ...agents.filter((a) => a.modelId === null).map((a) => a.id),
    ]);
    return agents.filter((a) => allowed.has(a.id));
  }, [agents]);

  // Resolve the persona's model on this platform. May return a same-family
  // sibling (e.g. a web/desktop variant of a mobile .pte model) when the
  // persona's configured modelId doesn't run here.
  const currentAgentResolution = useMemo(() => {
    if (!currentAgent || !currentAgent.modelId) return null;
    return getPersonaResolutionInfo(
      { modelId: currentAgent.modelId },
      ALL_LLM_MODELS,
      getCurrentPlatform(),
    );
  }, [currentAgent]);

  // Is the currently-selected persona's model usable on this platform?
  const currentAgentUnavailable =
    currentAgentResolution !== null && !currentAgentResolution.available;

  // Whether we're using a family-fallback sibling instead of the persona's
  // configured model. UI shows a subtle informational note in this case.
  const currentAgentUsingFallback =
    currentAgentResolution !== null && currentAgentResolution.usingFallback;

  // Model management modal state
  const [showModelManager, setShowModelManager] = useState(false);

  // Load downloaded models, remote models, custom local models, and agents on mount
  useEffect(() => {
    const loadSettings = async () => {
      const [
        downloaded,
        selected,
        allAgents,
        defaultAgent,
        remotes,
        customLocals,
      ] = await Promise.all([
        modelSettings.getDownloadedModels(),
        modelSettings.getSelectedModelId(),
        agentsRepo.getAll(),
        agentsRepo.getDefault(),
        customModels.getRemoteModels(),
        customModels.getCustomLocalModels(),
      ]);
      setDownloadedModels(downloaded);
      setRemoteModels(remotes);
      // Only show custom local models that are downloaded
      setCustomLocalModels(
        customLocals.filter((m) => m.isDownloaded && m.isEnabled),
      );
      setAgents(allAgents);

      // Helper to check if a model still exists and is available
      const isModelAvailable = (modelId: string): boolean => {
        // Platform models are always available
        if (isPlatformModelId(modelId)) {
          return platformLLMs.some((m) => m.modelId === modelId);
        }
        // Remote models
        if (isRemoteModelId(modelId)) {
          return remotes.some(
            (m) =>
              m.modelId === modelId && m.isEnabled && m.privacyAcknowledged,
          );
        }
        // Custom local models
        if (isCustomLocalModelId(modelId)) {
          return customLocals.some(
            (m) => m.modelId === modelId && m.isDownloaded && m.isEnabled,
          );
        }
        // Built-in downloaded models
        return downloaded.some((m) => m.modelId === modelId);
      };

      // Only activate the default persona if its model runs on this platform.
      // Mobile-only personas cannot be the default on web/tauri/macos.
      const currentPlatform = getCurrentPlatform();
      const defaultAgentUsable =
        defaultAgent &&
        (defaultAgent.modelId === null ||
          isPersonaAvailableOnPlatform(
            { modelId: defaultAgent.modelId },
            ALL_LLM_MODELS,
            currentPlatform,
          ));
      if (defaultAgent && !defaultAgentUsable) {
        console.warn(
          `[AIChatComposer] Default persona "${defaultAgent.name}" uses model "${defaultAgent.modelId}" which is not available on ${currentPlatform}. Falling back to raw model.`,
        );
      }

      // Debug: trace model selection on desktop/web
      console.log("[AIChatComposer] loadSettings:", {
        selectedModelId: selected,
        downloadedCount: downloaded.length,
        downloadedIds: downloaded.map((m) => m.modelId),
        isAvailable: selected ? isModelAvailable(selected) : "no-selection",
        platform: currentPlatform,
      });

      // Determine default: saved selection > persona
      // Note: Platform models don't use personas (no system prompt support)
      if (selected && isModelAvailable(selected)) {
        // User has a saved selection that still exists - use it
        setSelectedModelId(selected);
        // Only set agent if NOT a platform model (platform models can't use personas)
        // AND the default persona's model is available on this platform.
        if (defaultAgentUsable && !isPlatformModelId(selected)) {
          setCurrentAgent(defaultAgent);
        }
      } else if (defaultAgentUsable && defaultAgent) {
        // No saved selection or model no longer exists - use default persona.
        // Resolve the persona modelId through family fallback so we pick a
        // platform-available sibling when the persona's configured model
        // doesn't run here.
        const resolvedId = defaultAgent.modelId
          ? (resolvePersonaModel(
              { modelId: defaultAgent.modelId },
              ALL_LLM_MODELS,
              currentPlatform,
            ) ?? defaultAgent.modelId)
          : null;
        setSelectedModelId(resolvedId);
        setCurrentAgent(defaultAgent);
      }
    };
    loadSettings();
    // Re-run when the model manager closes so newly downloaded/selected
    // models are picked up without a full remount.
  }, [showModelManager]);

  // Get display name for selector button
  const selectorDisplayName = useMemo(() => {
    if (!selectedModelId) return "Select";

    // Platform models always show their name (they don't use agents)
    if (isPlatformModelId(selectedModelId)) {
      const platformModel = platformLLMs.find(
        (m) => m.modelId === selectedModelId,
      );
      if (platformModel) return platformModel.displayName;
      // Fallback for platform model not in list yet
      if (selectedModelId === "apple-foundation") return "Apple Intelligence";
      if (selectedModelId === "gemini-nano") return "Gemini Nano";
    }

    // For non-platform models, show agent name if set (skip for default agent)
    if (currentAgent && !currentAgent.isDefault) {
      // Show "AgentName · ModelName" so user knows which model is active
      const modelName = getModelById(selectedModelId)?.displayName;
      if (modelName) {
        return `${currentAgent.name} · ${modelName}`;
      }
      return currentAgent.name;
    }

    // Check remote models
    if (isRemoteModelId(selectedModelId)) {
      const remoteModel = remoteModels.find(
        (m) => m.modelId === selectedModelId,
      );
      if (remoteModel) return remoteModel.displayName;
    }

    // Check custom local models
    if (isCustomLocalModelId(selectedModelId)) {
      const customModel = customLocalModels.find(
        (m) => m.modelId === selectedModelId,
      );
      if (customModel) return customModel.displayName;
    }

    // Check downloadable models
    const model = getModelById(selectedModelId);
    if (model) return model.displayName;

    return selectedModelId;
  }, [
    selectedModelId,
    currentAgent,
    platformLLMs,
    remoteModels,
    customLocalModels,
  ]);

  // Expose model info to parent for header rendering
  const hasAnyModels =
    downloadedModels.length > 0 ||
    platformLLMs.length > 0 ||
    remoteModels.some((m) => m.isEnabled && m.privacyAcknowledged) ||
    customLocalModels.length > 0;
  const onModelInfoRef = useRef(onModelInfo);
  onModelInfoRef.current = onModelInfo;
  useEffect(() => {
    onModelInfoRef.current?.({
      displayName: hasAnyModels ? selectorDisplayName : "No Model",
      openSelector: () => {
        if (hasAnyModels) {
          setShowModelSelector(true);
        } else {
          setShowModelManager(true);
        }
      },
    });
  }, [selectorDisplayName, hasAnyModels]);

  // Handle agent selection
  const handleSelectAgent = useCallback(
    async (agent: Agent) => {
      // Resolve the model ID for this persona.
      // If the persona specifies a model, resolve it (with family fallback).
      // If no model specified, use the GLOBAL default (not the per-chat override,
      // which might be a one-off selection like Apple Intelligence).
      let resolvedId: string | null = null;
      if (agent.modelId) {
        resolvedId =
          resolvePersonaModel(
            { modelId: agent.modelId },
            ALL_LLM_MODELS,
            getCurrentPlatform(),
          ) ?? agent.modelId;
      } else {
        // Fall back to global default for personas without a model preference
        resolvedId = await modelSettings.getSelectedModelId();
      }

      // Update LOCAL state only — don't change the global default.
      userOverrodeModelRef.current = true;
      setCurrentAgent(agent);
      if (resolvedId) {
        setSelectedModelId(resolvedId);
      }
      setShowModelSelector(false);

      // Save to entry if we have one. We persist the persona's *original*
      // modelId (agent.modelId) as `generationModelId` so the entry remains
      // portable across platforms — resolution re-runs on each open.
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

  // Notify parent (router / layout) when our entry id changes so the
  // header title can update. We intentionally don't call `onSave` for new
  // AI chat entries (it would navigate and unmount mid-response), but we
  // still want the layout to know about the entry so it can show its title.
  const onComposerEntryIdRef = useRef(onComposerEntryId);
  onComposerEntryIdRef.current = onComposerEntryId;
  useEffect(() => {
    onComposerEntryIdRef.current?.(currentEntryId);
  }, [currentEntryId]);
  useEffect(() => {
    return () => {
      onComposerEntryIdRef.current?.(undefined);
    };
  }, []);

  // React Query hooks - load entry first
  const { data: entry } = useEntry(currentEntryId);

  // Use ref for entry data too
  const entryRef = useRef(entry);
  entryRef.current = entry;

  // Sync on open - connect to server and sync entry when opened
  const { syncOnOpen, disconnectOnClose } = useSyncEngine();

  useEffect(() => {
    if (currentEntryId) {
      // Non-blocking sync - errors logged but don't block chat
      syncOnOpen(currentEntryId).catch((err) =>
        console.warn("[AIChatComposer] Sync on open failed:", err),
      );

      return () => {
        disconnectOnClose(currentEntryId).catch((err) =>
          console.warn("[AIChatComposer] Disconnect failed:", err),
        );
      };
    }
  }, [currentEntryId, syncOnOpen, disconnectOnClose]);

  // Load entry's saved model/agent when opening existing conversation.
  // Skip if the user already made a manual selection in the quick selector —
  // the entry cache may be stale and would overwrite their choice.
  useEffect(() => {
    const loadEntrySettings = async () => {
      if (!entry) return;
      if (userOverrodeModelRef.current) return;

      // Load agent if saved on entry
      if (entry.agentId) {
        const agent = await agentsRepo.getById(entry.agentId);
        if (agent) {
          const platformNow = getCurrentPlatform();
          const agentUsable =
            agent.modelId === null ||
            isPersonaAvailableOnPlatform(
              { modelId: agent.modelId },
              ALL_LLM_MODELS,
              platformNow,
            );
          if (!agentUsable) {
            console.warn(
              `[AIChatComposer] Entry persona "${agent.name}" uses model "${agent.modelId}" which is not available on ${platformNow}. Falling back to raw model.`,
            );
            // Fall through to generationModelId/default handling below.
          } else {
            setCurrentAgent(agent);
            // Also set the model from the agent — resolve through family
            // fallback so we use a platform-available sibling when needed.
            if (agent.modelId) {
              const resolvedId =
                resolvePersonaModel(
                  { modelId: agent.modelId },
                  ALL_LLM_MODELS,
                  platformNow,
                ) ?? agent.modelId;
              setSelectedModelId(resolvedId);
            }
            return; // Agent takes precedence
          }
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
      const currentPlatform = getCurrentPlatform();
      const defaultAgentUsable =
        defaultAgent &&
        (defaultAgent.modelId === null ||
          isPersonaAvailableOnPlatform(
            { modelId: defaultAgent.modelId },
            ALL_LLM_MODELS,
            currentPlatform,
          ));
      if (defaultModelId) {
        setSelectedModelId(defaultModelId);
        // Only set agent if default model is NOT a platform model
        // Platform models don't support agents/personas
        // AND the default persona's model is available on this platform.
        if (defaultAgentUsable && !isPlatformModelId(defaultModelId)) {
          setCurrentAgent(defaultAgent);
        } else {
          setCurrentAgent(null);
        }
      } else if (defaultAgentUsable && defaultAgent) {
        // No default model but have default agent — resolve through family
        // fallback so the persona runs via a platform-available sibling.
        setCurrentAgent(defaultAgent);
        if (defaultAgent.modelId) {
          const resolvedId =
            resolvePersonaModel(
              { modelId: defaultAgent.modelId },
              ALL_LLM_MODELS,
              currentPlatform,
            ) ?? defaultAgent.modelId;
          setSelectedModelId(resolvedId);
        }
      }
    };
    loadEntrySettings();
  }, [entry?.id, entry?.agentId, entry?.generationModelId, modelSettings]);

  const createEntry = useCreateEntry();
  const updateEntry = useUpdateEntry();

  // Use ref for updateEntry to avoid stale closures
  const updateEntryRef = useRef(updateEntry);
  updateEntryRef.current = updateEntry;

  // Track the latest blocks we've saved to the database. This is the
  // authoritative source for onResponseComplete because entryRef.current
  // may be stale — React Query cache updates trigger a re-render, but
  // the render may not have happened yet when the LLM finishes generating.
  const latestSavedBlocksRef = useRef<Block[] | null>(null);

  // Use the simplified AI chat hook with agent settings
  const {
    isGenerating,
    sendMessage: aiSendMessage,
    setMessageHistory,
    stop: stopGeneration,
  } = useAIChat({
    systemPrompt: currentAgent?.systemPrompt,
    thinkMode: currentAgent?.thinkMode,
    modelId: selectedModelId ?? undefined,
    onResponseComplete: async (response) => {
      // Save completed response to database
      const entryId = currentEntryIdRef.current;

      if (entryId) {
        // Use latestSavedBlocksRef (set synchronously in handleSendMessageImpl)
        // instead of entryRef.current.blocks which may be stale due to React
        // re-render timing after query cache updates.
        const currentBlocks =
          latestSavedBlocksRef.current ?? entryRef.current?.blocks ?? [];
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

        latestSavedBlocksRef.current = updatedBlocks;

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
  const handleSelectModel = useCallback(async (modelId: string) => {
    // Update all local state synchronously so React batches the render.
    userOverrodeModelRef.current = true;
    setSelectedModelId(modelId);
    setCurrentAgent(null);
    setShowModelSelector(false);

    // Don't update global default — this is a per-chat selection.
    // The model is passed to sendMessage via options.modelId.

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
  }, []);

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

  // Local state for submission only — input text is owned by ChatInputBar
  // so keystrokes never re-render this component.
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Refs for UI only
  const flatListRef = useRef<FlatList<Block>>(null);
  const chatInputBarRef = useRef<ChatInputBarHandle>(null);

  // Keyboard state for proper input positioning
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Track keyboard visibility and height
  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const keyboardDidShow = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });

    const keyboardDidHide = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      keyboardDidShow.remove();
      keyboardDidHide.remove();
    };
  }, []);

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

  // HTML rendering styles - memoized for performance
  // Serif font for content readability; sans-serif stays for UI/nav elsewhere.
  const contentFont = "Georgia, 'Iowan Old Style', 'Palatino Linotype', serif";

  // Vertical rhythm: 4px baseline grid.
  // Body 17px × 1.7 ≈ 28px line-height. All margins multiples of 4.
  const htmlBaseStyle = useMemo(
    () => ({
      color: seasonalTheme.textPrimary,
      fontFamily: contentFont,
      fontSize: 17,
      lineHeight: 29,
    }),
    [seasonalTheme.textPrimary],
  );

  const htmlTagsStyles = useMemo(
    () => ({
      body: {
        color: seasonalTheme.textPrimary,
        fontFamily: contentFont,
        fontSize: 17,
        margin: 0,
        padding: 0,
        backgroundColor: "transparent",
      },
      p: {
        color: seasonalTheme.textPrimary,
        fontFamily: contentFont,
        fontSize: 17,
        marginTop: 0,
        marginBottom: 16, // 4 × 4
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
      // Heading scale: 24 / 20 / 17 — each step ~1.2x
      h1: {
        color: seasonalTheme.textPrimary,
        fontFamily: contentFont,
        fontSize: 24,
        fontWeight: "bold" as const,
        marginTop: 8, // 2 × 4
        marginBottom: 12, // 3 × 4
      },
      h2: {
        color: seasonalTheme.textPrimary,
        fontFamily: contentFont,
        fontSize: 20,
        fontWeight: "bold" as const,
        marginTop: 8,
        marginBottom: 8, // 2 × 4
      },
      h3: {
        color: seasonalTheme.textPrimary,
        fontFamily: contentFont,
        fontSize: 17,
        fontWeight: "600" as const,
        marginTop: 8,
        marginBottom: 4, // 1 × 4
      },
      ul: {
        color: seasonalTheme.textPrimary,
        marginLeft: 0,
        paddingLeft: 20,
        marginTop: 0,
        marginBottom: 16, // 4 × 4
      },
      ol: {
        color: seasonalTheme.textPrimary,
        marginLeft: 0,
        paddingLeft: 20,
        marginTop: 0,
        marginBottom: 16,
      },
      li: {
        color: seasonalTheme.textPrimary,
        fontFamily: contentFont,
        fontSize: 17,
        marginBottom: 4, // 1 × 4
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
        fontFamily: contentFont,
        borderLeftWidth: 4,
        borderLeftColor: seasonalTheme.textSecondary + "40",
        paddingLeft: 14,
        marginLeft: 0,
        marginTop: 0,
        marginBottom: 10,
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

  // Latest submit implementation. We store it in a ref and expose a stable
  // wrapper so ChatInputBar (a memoized child) never gets a new onSubmit
  // prop and therefore never re-renders due to parent renders.
  const handleSendMessageImpl = async (messageText: string) => {
    if (!messageText || isSubmitting || isGenerating) return;

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

        const newBlocks: Block[] = [
          { type: "markdown", content: messageText, role: "user" },
        ];
        latestSavedBlocksRef.current = newBlocks;

        const newEntry = await createEntry.mutateAsync({
          type: "ai_chat",
          title,
          blocks: newBlocks,
          agentId: currentAgent?.id,
        });

        entryIdToUse = newEntry.id;
        setCurrentEntryId(newEntry.id);
      } else {
        // Add user message to existing entry
        const updatedBlocks: Block[] = [
          ...(latestSavedBlocksRef.current ?? displayedBlocks),
          { type: "markdown", content: messageText, role: "user" },
        ];
        latestSavedBlocksRef.current = updatedBlocks;

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
  };
  const handleSendMessageImplRef = useRef(handleSendMessageImpl);
  handleSendMessageImplRef.current = handleSendMessageImpl;

  // Stable wrapper — identity never changes so ChatInputBar stays memoized.
  const handleSendMessage = useCallback((messageText: string) => {
    void handleSendMessageImplRef.current(messageText);
  }, []);

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
          htmlBaseStyle={htmlBaseStyle}
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
    chatInputBarRef.current?.setText(suggestion);
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
        hideBackButton={hideBackButton}
      />

      {/* Warning banner when selected persona's model is unavailable here */}
      {currentAgentUnavailable && currentAgent && (
        <View style={styles.personaWarningBanner}>
          <Ionicons name="warning-outline" size={14} color="#a65d00" />
          <Text
            variant="caption"
            style={styles.personaWarningText}
            numberOfLines={2}
          >
            {`"${currentAgent.name}" uses a model that isn't available on this platform. Pick a different persona or model.`}
          </Text>
        </View>
      )}

      {/* Info banner when persona is running via a family-fallback sibling */}
      {!currentAgentUnavailable &&
        currentAgentUsingFallback &&
        currentAgentResolution?.displayName && (
          <View style={styles.personaInfoBanner}>
            <Ionicons
              name="information-circle-outline"
              size={14}
              color={seasonalTheme.textSecondary}
            />
            <Text
              variant="caption"
              style={[
                styles.personaInfoText,
                { color: seasonalTheme.textSecondary },
              ]}
              numberOfLines={1}
            >
              {`Using ${currentAgentResolution.displayName} on this platform`}
            </Text>
          </View>
        )}

      {/* Model Selector - floating glass pill (mobile only, desktop uses header) */}
      {!hideBackButton &&
        (downloadedModels.length > 1 ||
          platformLLMs.length > 0 ||
          agents.length > 0) && (
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
            Select Persona or Model
          </Text>
          <ScrollView
            style={styles.modelSelectorScroll}
            showsVerticalScrollIndicator={false}
          >
            {/* Agents Section */}
            {availableAgents.length > 0 && (
              <>
                <Text
                  variant="caption"
                  style={{
                    color: seasonalTheme.textSecondary,
                    marginBottom: spacingPatterns.xs,
                    fontWeight: "600",
                  }}
                >
                  PERSONAS
                </Text>
                {availableAgents.map((agent) => {
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

            {/* Built-in Platform Models Section */}
            {platformLLMs.length > 0 && (
              <>
                <Text
                  variant="caption"
                  style={{
                    color: seasonalTheme.textSecondary,
                    marginTop: agents.length > 0 ? spacingPatterns.md : 0,
                    marginBottom: spacingPatterns.xs,
                    fontWeight: "600",
                  }}
                >
                  BUILT-IN
                </Text>
                {platformLLMs.map((platformModel) => {
                  const isSelected = selectedModelId === platformModel.modelId;
                  return (
                    <TouchableOpacity
                      key={platformModel.modelId}
                      onPress={() => {
                        setCurrentAgent(null);
                        handleSelectModel(platformModel.modelId);
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
                        <View style={styles.agentOptionRow}>
                          <Ionicons
                            name="flash-outline"
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
                            {platformModel.displayName}
                          </Text>
                        </View>
                        <Text
                          variant="caption"
                          style={{ color: seasonalTheme.textSecondary }}
                        >
                          {platformModel.description}
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
              </>
            )}

            {/* Downloaded LLMs Section */}
            <Text
              variant="caption"
              style={{
                color: seasonalTheme.textSecondary,
                marginTop:
                  agents.length > 0 || platformLLMs.length > 0
                    ? spacingPatterns.md
                    : 0,
                marginBottom: spacingPatterns.xs,
                fontWeight: "600",
              }}
            >
              DOWNLOADED
            </Text>
            {downloadedModels
              .filter((m) => !m.modelType || m.modelType === "llm")
              .map((downloaded) => {
                const model = ALL_MODELS.find(
                  (m) => m.modelId === downloaded.modelId,
                );
                if (!model) return null;
                const isSelected = selectedModelId === model.modelId;
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

            {/* Remote API Models Section */}
            {remoteModels.length > 0 && (
              <>
                <Text
                  variant="caption"
                  style={{
                    color: seasonalTheme.textSecondary,
                    marginTop: spacingPatterns.md,
                    marginBottom: spacingPatterns.xs,
                    fontWeight: "600",
                  }}
                >
                  REMOTE
                </Text>
                {remoteModels
                  .filter((m) => m.isEnabled && m.privacyAcknowledged)
                  .map((remoteModel) => {
                    const isSelected = selectedModelId === remoteModel.modelId;
                    return (
                      <TouchableOpacity
                        key={remoteModel.modelId}
                        onPress={() => {
                          setCurrentAgent(null);
                          handleSelectModel(remoteModel.modelId);
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
                          <View style={styles.agentOptionRow}>
                            <Ionicons
                              name="cloud-outline"
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
                              {remoteModel.displayName}
                            </Text>
                          </View>
                          <Text
                            variant="caption"
                            style={{ color: seasonalTheme.textSecondary }}
                          >
                            {remoteModel.description ||
                              `${remoteModel.providerId} · ${remoteModel.modelName}`}
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
              </>
            )}

            {/* Custom Local Models Section */}
            {customLocalModels.length > 0 && (
              <>
                <Text
                  variant="caption"
                  style={{
                    color: seasonalTheme.textSecondary,
                    marginTop: spacingPatterns.md,
                    marginBottom: spacingPatterns.xs,
                    fontWeight: "600",
                  }}
                >
                  CUSTOM
                </Text>
                {customLocalModels.map((customModel) => {
                  const isSelected = selectedModelId === customModel.modelId;
                  return (
                    <TouchableOpacity
                      key={customModel.modelId}
                      onPress={() => {
                        setCurrentAgent(null);
                        handleSelectModel(customModel.modelId);
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
                        <View style={styles.agentOptionRow}>
                          <Ionicons
                            name="hardware-chip-outline"
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
                            {customModel.displayName}
                          </Text>
                        </View>
                        <Text
                          variant="caption"
                          style={{ color: seasonalTheme.textSecondary }}
                        >
                          {customModel.description ||
                            `${customModel.modelSize || "Custom"} · On-device`}
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
              </>
            )}
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
            // Ensure content clears the floating header (4px offset + 44px button + 8px gap)
            // When back button is hidden (desktop sidebar), use minimal padding
            paddingTop: hideBackButton
              ? spacingPatterns.sm
              : Math.max(
                  insets.top,
                  spacingPatterns.xxs + 44 + spacingPatterns.xs,
                ),
            // Add padding for the absolutely positioned input container (~70px)
            paddingBottom: 80 + (insets.bottom || spacingPatterns.sm),
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

      {/* Input - positioned at the bottom, moves up with keyboard */}
      <ChatInputBar
        ref={chatInputBarRef}
        onSubmit={handleSendMessage}
        isGenerating={isGenerating}
        isSubmitting={isSubmitting}
        createPending={createEntry.isPending}
        updatePending={updateEntry.isPending}
        seasonalTheme={seasonalTheme}
        keyboardHeight={keyboardHeight}
        insetsBottom={insets.bottom}
      />

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
  personaWarningBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacingPatterns.xs,
    marginHorizontal: spacingPatterns.md,
    marginTop: spacingPatterns.xs,
    paddingVertical: spacingPatterns.xs,
    paddingHorizontal: spacingPatterns.sm,
    backgroundColor: "rgba(255, 193, 7, 0.15)",
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: "rgba(166, 93, 0, 0.3)",
  },
  personaWarningText: {
    flex: 1,
    color: "#a65d00",
    fontSize: 11,
  },
  personaInfoBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacingPatterns.xs,
    marginHorizontal: spacingPatterns.md,
    marginTop: spacingPatterns.xs,
    paddingVertical: spacingPatterns.xs,
    paddingHorizontal: spacingPatterns.sm,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderRadius: borderRadius.sm,
  },
  personaInfoText: {
    flex: 1,
    fontSize: 11,
    fontStyle: "italic",
  },
  chatMessages: {
    flex: 1,
  },
  chatMessagesContent: {
    paddingHorizontal: spacingPatterns.screen,
    maxWidth: 768,
    width: "100%",
    alignSelf: "center",
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
    paddingRight: 32,
    width: "100%",
  },
  messageContent: {
    maxWidth: "80%",
    padding: spacingPatterns.md,
    borderRadius: borderRadius.lg,
    marginLeft: 32,
  },
  chatInputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: spacingPatterns.md,
    paddingTop: spacingPatterns.sm,
    maxWidth: 768,
    width: "100%",
    // Note: position, left, right, bottom are applied dynamically
  },
  chatInput: {
    flex: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacingPatterns.md,
    paddingVertical: spacingPatterns.sm,
    fontSize: 16,
    lineHeight: 22,
    borderWidth: 1,
    maxHeight: 120,
    minHeight: 44,
  },
  sendButtonInline: {
    position: "absolute",
    right: 8,
    bottom: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
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
