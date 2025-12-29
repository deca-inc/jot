/**
 * LLMProvider - Keeps a single LLM instance mounted at the app level
 *
 * This prevents OOM by ensuring only one LLM exists and it never unmounts.
 * Also handles background task registration so generation continues when app is backgrounded.
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useLLM, Message } from "react-native-executorch";
import { Block } from "../db/entries";
import { useModelSettings } from "../db/modelSettings";
import { registerBackgroundTasks } from "./backgroundTasks";
import { truncateContext, fitsInContext } from "./contextManager";
import {
  DEFAULT_SYSTEM_PROMPT,
  LlmModelConfig,
  DEFAULT_MODEL,
  getModelById,
} from "./modelConfig";
import { ensureModelPresent, EnsureResult } from "./modelManager";

/**
 * Pending save info - stores what we need to save response even if component unmounts
 */
interface PendingSave {
  entryId: number;
  existingBlocks: Block[];
  updateEntry: ReturnType<typeof import("../db/useEntries").useUpdateEntry>;
  onComplete?: (response: string) => void;
  onError?: (error: string) => void;
}

interface LLMContextValue {
  isReady: boolean;
  isGenerating: boolean;
  isLoading: boolean;
  error: string | null;
  response: string;
  rawResponse: string;
  modelConfig: LlmModelConfig;
  sendMessage: (messages: Message[]) => Promise<string>;
  interrupt: () => void;
  /** Register a pending save so response is saved even if component unmounts */
  registerPendingSave: (save: PendingSave) => void;
  /** Clear pending save (e.g., when component handles save itself) */
  clearPendingSave: () => void;
}

const LLMContext = createContext<LLMContextValue | null>(null);

/**
 * Strip think tags from response (Qwen models use these for reasoning)
 */
function stripThinkTags(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/<\/?think>/g, "")
    .trim();
}

/**
 * Add file:// prefix for local paths
 */
function addFilePrefix(path: string): string {
  if (!path) return "";
  return path.startsWith("file://") ? path : `file://${path}`;
}

export function LLMProvider({ children }: { children: React.ReactNode }) {
  // Get model from settings
  const modelSettings = useModelSettings();
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [modelPaths, setModelPaths] = useState<{
    ptePath: string;
    tokenizerPath: string;
    tokenizerConfigPath: string;
  } | null>(null);
  const [pathsError, setPathsError] = useState<string | null>(null);

  // Lazy loading: only load the model when first sendMessage is called
  // This prevents blocking the main thread during app cold start
  const [loadRequested, setLoadRequested] = useState(false);

  // Load selected model ID from settings
  useEffect(() => {
    modelSettings.getSelectedModelId().then((id) => {
      setSelectedModelId(id);
    });
  }, []);

  // Determine which model config to use
  const modelConfig = useMemo(() => {
    return selectedModelId
      ? getModelById(selectedModelId) || DEFAULT_MODEL
      : DEFAULT_MODEL;
  }, [selectedModelId]);

  // Load model paths
  const loadedModelIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (loadedModelIdRef.current === modelConfig.modelId && modelPaths) {
      return;
    }
    loadedModelIdRef.current = modelConfig.modelId;

    ensureModelPresent(modelConfig)
      .then((result: EnsureResult) => {
        setModelPaths({
          ptePath: addFilePrefix(result.ptePath),
          tokenizerPath: addFilePrefix(result.tokenizerPath || ""),
          tokenizerConfigPath: addFilePrefix(result.tokenizerConfigPath || ""),
        });
        setPathsError(null);
      })
      .catch((err) => {
        console.error("[LLMProvider] Failed to load model:", err);
        setPathsError(err instanceof Error ? err.message : "Failed to load model");
      });
  }, [modelConfig.modelId]);

  // Register background tasks on mount
  useEffect(() => {
    registerBackgroundTasks();
  }, []);

  // Pending save - stores info needed to save response even if component unmounts
  const pendingSaveRef = useRef<PendingSave | null>(null);

  const registerPendingSave = useCallback((save: PendingSave) => {
    pendingSaveRef.current = save;
  }, []);

  const clearPendingSave = useCallback(() => {
    pendingSaveRef.current = null;
  }, []);

  // Use the LLM hook - this stays mounted!
  // preventLoad is true until both: (1) paths are ready AND (2) load is explicitly requested
  // This prevents blocking the main thread during app cold start
  const llm = useLLM({
    model: {
      modelSource: modelPaths?.ptePath || "",
      tokenizerSource: modelPaths?.tokenizerPath || "",
      tokenizerConfigSource: modelPaths?.tokenizerConfigPath || "",
    },
    preventLoad: !modelPaths || !loadRequested,
  });

  // Track response for returning from sendMessage
  const responseResolverRef = useRef<((response: string) => void) | null>(null);

  // Ref to track current llm state for async polling (avoids stale closure)
  const llmStateRef = useRef({ isReady: llm.isReady, error: llm.error });
  llmStateRef.current = { isReady: llm.isReady, error: llm.error };

  // Watch for generation completion to resolve the promise AND handle pending saves
  useEffect(() => {
    // When generation stops and we have a response
    if (!llm.isGenerating && llm.response) {
      const cleanResponse = stripThinkTags(llm.response);

      // Resolve the promise if there's a resolver
      if (responseResolverRef.current) {
        const resolver = responseResolverRef.current;
        responseResolverRef.current = null;
        resolver(llm.response);
      }

      // Handle pending save if component unmounted during generation
      const pendingSave = pendingSaveRef.current;
      if (pendingSave) {
        const { entryId, existingBlocks, updateEntry, onComplete, onError } = pendingSave;

        // Filter out empty assistant blocks, then add the new response
        const filteredBlocks = existingBlocks.filter(b => {
          if (b.role === "assistant" && b.type === "markdown") {
            return b.content && b.content.trim().length > 0;
          }
          return true;
        });

        const updatedBlocks: Block[] = [
          ...filteredBlocks,
          { type: "markdown", content: cleanResponse, role: "assistant" },
        ];

        // Save using the passed mutation
        updateEntry.mutateAsync({ id: entryId, input: { blocks: updatedBlocks } })
          .then(() => {
            onComplete?.(cleanResponse);
          })
          .catch((err) => {
            console.error("[LLMProvider] Failed to save response:", err);
            onError?.(err instanceof Error ? err.message : "Failed to save");
          })
          .finally(() => {
            pendingSaveRef.current = null;
          });
      }
    }
  }, [llm.isGenerating, llm.response]);

  // Send message helper that handles context limits
  const sendMessage = useCallback(
    async (messages: Message[]): Promise<string> => {
      // Trigger lazy loading on first sendMessage call
      if (!loadRequested) {
        setLoadRequested(true);
        // Wait a tick for state update to trigger re-render and start loading
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      // Wait for model to be ready (polling with timeout)
      const startTime = Date.now();
      const timeout = 60000; // 60 second timeout for model loading

      while (!llmStateRef.current.isReady) {
        if (llmStateRef.current.error) {
          throw new Error(llmStateRef.current.error);
        }
        if (Date.now() - startTime > timeout) {
          throw new Error("Model loading timed out");
        }
        // Wait and check again
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (llm.isGenerating) {
        throw new Error("Already generating");
      }

      // Add system prompt and handle context limits
      const allMessages: Message[] = [
        { role: "system", content: DEFAULT_SYSTEM_PROMPT },
        ...messages.filter((m) => m.role !== "system"),
      ];

      let preparedMessages = allMessages;
      if (!fitsInContext(allMessages, modelConfig.modelId)) {
        preparedMessages = truncateContext(allMessages, modelConfig.modelId);
      }

      // Create a promise that will resolve when generation completes
      const responsePromise = new Promise<string>((resolve) => {
        responseResolverRef.current = resolve;
      });

      // Start generation (returns void, response comes via llm.response)
      await llm.generate(preparedMessages);

      // Wait for the response (resolved by the useEffect above)
      const response = await responsePromise;
      return response;
    },
    [llm, modelConfig.modelId, loadRequested],
  );

  const interrupt = useCallback(() => {
    if (llm.isGenerating) {
      llm.interrupt();
    }
  }, [llm]);

  const contextValue = useMemo<LLMContextValue>(
    () => ({
      isReady: llm.isReady,
      isGenerating: llm.isGenerating,
      isLoading: loadRequested && !llm.isReady && !llm.error && !pathsError,
      error: pathsError || llm.error,
      response: stripThinkTags(llm.response || ""),
      rawResponse: llm.response || "",
      modelConfig,
      sendMessage,
      interrupt,
      registerPendingSave,
      clearPendingSave,
    }),
    [
      llm.isReady,
      llm.isGenerating,
      llm.error,
      llm.response,
      loadRequested,
      pathsError,
      modelConfig,
      sendMessage,
      interrupt,
      registerPendingSave,
      clearPendingSave,
    ],
  );

  return (
    <LLMContext.Provider value={contextValue}>
      {children}
    </LLMContext.Provider>
  );
}

/**
 * Hook to use the shared LLM instance
 */
export function useLLMContext() {
  const context = useContext(LLMContext);
  if (!context) {
    throw new Error("useLLMContext must be used within LLMProvider");
  }
  return context;
}
