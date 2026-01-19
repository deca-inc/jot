/**
 * UnifiedModelProvider - Unified provider for all AI model operations
 *
 * Combines functionality from ModelProvider and LLMProvider:
 * - Model initialization and verification on app startup
 * - LLM model loading/unloading with singleton pattern
 * - STT model loading/unloading (placeholder for Phase 5)
 * - Idle timeout for automatic model unloading
 * - Screen leave unloading support
 *
 * Architecture:
 * - Single LLM instance at app level to prevent OOM
 * - Single STT instance when needed for voice features
 * - Models loaded on-demand, unloaded after idle timeout
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { LLMModule, Message } from "react-native-executorch";
import { useModelSettings } from "../db/modelSettings";
import { registerBackgroundTasks } from "./backgroundTasks";
import { truncateContext, fitsInContext } from "./contextManager";
import {
  LlmModelConfig,
  SpeechToTextModelConfig,
  DEFAULT_MODEL,
  ALL_LLM_MODELS,
  getModelById,
  DEFAULT_SYSTEM_PROMPT,
  MODEL_IDS,
} from "./modelConfig";
import { modelDownloadStatus } from "./modelDownloadStatus";
import { ensureModelPresent } from "./modelManager";
import { logStorageDebugInfo, verifyAllModels } from "./modelVerification";
import { persistentDownloadManager } from "./persistentDownloadManager";
import {
  ALL_STT_MODELS as _ALL_STT_MODELS,
  DEFAULT_STT_MODEL,
  getSTTModelById,
} from "./sttConfig";

// =============================================================================
// CONSTANTS
// =============================================================================

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// =============================================================================
// TYPES
// =============================================================================

interface SendMessageOptions {
  responseCallback?: (responseSoFar: string) => void;
  completeCallback?: (result: string) => void;
  systemPrompt?: string;
  thinkMode?: "no-think" | "think" | "none";
}

interface UnifiedModelContextValue {
  // Initialization state
  isInitialized: boolean;

  // LLM operations
  isLLMLoaded: boolean;
  isGenerating: boolean;
  sendMessage: (
    messages: Message[],
    options?: SendMessageOptions,
  ) => Promise<string>;
  interruptLLM: () => void;

  // STT operations (Phase 5 - placeholders for now)
  isSTTLoaded: boolean;
  isTranscribing: boolean;

  // Model lifecycle
  loadLLMModel: (modelId: string) => Promise<void>;
  unloadLLMModel: () => void;
  unloadAllModels: () => void;

  // Current model state
  currentLLMConfig: LlmModelConfig;
  currentSTTConfig: SpeechToTextModelConfig | null;

  // Model management
  reloadModel: (config: LlmModelConfig) => Promise<void>;

  // Lifecycle management
  resetIdleTimer: () => void;
}

// =============================================================================
// MODEL LIBRARY SINGLETON
// =============================================================================

interface ModelLibrary {
  llm?: {
    config: LlmModelConfig;
    module: LLMModule;
  };
  // STT will be added in Phase 5
  // stt?: {
  //   config: SpeechToTextModelConfig;
  //   module: SpeechToTextModule;
  // };
}

// Singleton - exists outside React lifecycle to avoid closure/ref issues
const modelLibrarySingleton: ModelLibrary = {};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Add file:// prefix for local paths
 */
function addFilePrefix(path: string): string {
  if (!path) return "";
  return path.startsWith("file://") ? path : `file://${path}`;
}

/**
 * Load an LLM model into the singleton
 */
async function loadLLM(modelId: MODEL_IDS): Promise<void> {
  // Already loaded with same model
  if (
    modelLibrarySingleton.llm &&
    modelLibrarySingleton.llm.config.modelId === modelId
  ) {
    return;
  }

  // Different model - unload first
  const hasNewModelAssigned =
    modelLibrarySingleton.llm &&
    modelLibrarySingleton.llm.config.modelId !== modelId;

  if (modelLibrarySingleton.llm && hasNewModelAssigned) {
    modelLibrarySingleton.llm.module.interrupt();
    modelLibrarySingleton.llm.module.delete();
    delete modelLibrarySingleton.llm;
    // Wait for GC
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  const config = getModelById(modelId);
  if (!config) {
    throw new Error(`No model config for ${modelId}`);
  }

  const llm = new LLMModule({});
  const modelFiles = await ensureModelPresent(config);

  await llm.load({
    modelSource: addFilePrefix(modelFiles.ptePath),
    tokenizerSource: addFilePrefix(modelFiles.tokenizerPath || ""),
    tokenizerConfigSource: addFilePrefix(modelFiles.tokenizerConfigPath || ""),
  });

  modelLibrarySingleton.llm = {
    config,
    module: llm,
  };
}

/**
 * Send a message using the loaded LLM
 */
async function sendLLMMessage(
  currentModelId: MODEL_IDS,
  messages: Message[],
  options?: {
    tokenCallback?: (token: string) => void;
    responseCallback?: (responseSoFar: string) => void;
    completeCallback?: (result: string) => void;
    systemPrompt?: string;
    thinkMode?: "no-think" | "think" | "none";
  },
): Promise<string> {
  await loadLLM(currentModelId);

  let response = "";
  modelLibrarySingleton.llm?.module.setTokenCallback({
    tokenCallback: (token: string) => {
      response += token;
      options?.responseCallback?.(response);
    },
  });

  // Trim context if necessary
  let preparedMessages = messages;
  if (!modelLibrarySingleton.llm) throw new Error("Model not loaded");

  if (!fitsInContext(messages, modelLibrarySingleton.llm.config.modelId)) {
    preparedMessages = truncateContext(
      messages,
      modelLibrarySingleton.llm.config.modelId,
    );
  }

  // Handle system prompt based on thinkMode
  const thinkMode = options?.thinkMode ?? "no-think";
  const baseSystemPrompt = options?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;

  if (thinkMode !== "none") {
    let systemPrompt = baseSystemPrompt;

    // Add /no_think prefix if needed (for Qwen models)
    if (thinkMode === "no-think" && !systemPrompt.startsWith("/no_think")) {
      systemPrompt = `/no_think ${systemPrompt}`;
    }

    preparedMessages = [
      { role: "system", content: systemPrompt } as Message,
      ...preparedMessages,
    ];
  }

  const result =
    await modelLibrarySingleton.llm?.module.generate(preparedMessages);
  if (!result) {
    throw new Error("No content from generation");
  }

  options?.completeCallback?.(result);
  return result;
}

/**
 * Unload the LLM from memory
 */
function unloadLLM(): void {
  if (modelLibrarySingleton.llm) {
    modelLibrarySingleton.llm.module.interrupt();
    modelLibrarySingleton.llm.module.delete();
    delete modelLibrarySingleton.llm;
  }
}

// =============================================================================
// CONTEXT
// =============================================================================

const UnifiedModelContext = createContext<UnifiedModelContextValue | null>(
  null,
);

// =============================================================================
// PROVIDER COMPONENT
// =============================================================================

export function UnifiedModelProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const modelSettings = useModelSettings();

  // Initialization state
  const [isInitialized, setIsInitialized] = useState(false);

  // LLM state
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentLLMConfig, setCurrentLLMConfig] =
    useState<LlmModelConfig>(DEFAULT_MODEL);

  // STT state (Phase 5)
  const [currentSTTConfig, setCurrentSTTConfig] =
    useState<SpeechToTextModelConfig | null>(DEFAULT_STT_MODEL);

  // Idle timeout refs
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const lastActivityRef = useRef<number>(Date.now());

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  useEffect(() => {
    let isMounted = true;

    async function initialize() {
      try {
        // Log storage debug info (helps diagnose Android issues)
        await logStorageDebugInfo();

        // Initialize download status manager
        await modelDownloadStatus.initialize();

        // Verify all downloaded models still exist
        const downloadedModels = await modelSettings.getDownloadedModels();
        if (downloadedModels.length > 0) {
          // Filter LLM models only for now
          const llmModelIds = downloadedModels
            .filter((m) => !m.modelType || m.modelType === "llm")
            .map((m) => m.modelId);

          if (llmModelIds.length > 0) {
            const verification = await verifyAllModels(
              llmModelIds,
              ALL_LLM_MODELS,
            );

            if (verification.missing.length > 0) {
              console.warn(
                `[UnifiedModelProvider] ${verification.missing.length} model(s) missing from disk`,
              );

              for (const missingModelId of verification.missing) {
                await modelSettings.removeDownloadedModel(missingModelId);
              }
            }
          }
        }

        // Clean up old/stale downloads
        await persistentDownloadManager.cleanupOldDownloads();

        // Load current selected LLM model config
        const selectedId = await modelSettings.getSelectedModelId();
        if (selectedId && isMounted) {
          const config = ALL_LLM_MODELS.find((m) => m.modelId === selectedId);
          if (config) {
            setCurrentLLMConfig(config);
          }
        }

        // Load current selected STT model config (if any)
        const selectedSttId = await modelSettings.getSelectedSttModelId();
        if (selectedSttId && isMounted) {
          const sttConfig = getSTTModelById(selectedSttId);
          if (sttConfig) {
            setCurrentSTTConfig(sttConfig);
          }
        }

        if (isMounted) {
          setIsInitialized(true);
        }
      } catch (error) {
        console.error("[UnifiedModelProvider] Failed to initialize:", error);
        if (isMounted) {
          setIsInitialized(true); // Still mark as initialized to unblock UI
        }
      }
    }

    initialize();

    return () => {
      isMounted = false;
    };
  }, [modelSettings]);

  // ==========================================================================
  // BACKGROUND TASKS
  // ==========================================================================

  useEffect(() => {
    registerBackgroundTasks();
  }, []);

  // ==========================================================================
  // CLEANUP ON UNMOUNT
  // ==========================================================================

  useEffect(() => {
    return () => {
      // Unload all models
      unloadLLM();
      // Clear idle timer
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
    };
  }, []);

  // ==========================================================================
  // IDLE TIMEOUT MANAGEMENT
  // ==========================================================================

  const resetIdleTimer = useCallback(() => {
    lastActivityRef.current = Date.now();

    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }

    idleTimerRef.current = setTimeout(() => {
      console.log("[UnifiedModelProvider] Idle timeout - unloading models");
      unloadLLM();
      // STT unload will be added in Phase 5
    }, IDLE_TIMEOUT_MS);
  }, []);

  // ==========================================================================
  // LLM OPERATIONS
  // ==========================================================================

  const loadLLMModel = useCallback(async (modelId: string) => {
    await loadLLM(modelId as MODEL_IDS);
  }, []);

  const unloadLLMModel = useCallback(() => {
    unloadLLM();
  }, []);

  const unloadAllModels = useCallback(() => {
    unloadLLM();
    // STT unload will be added in Phase 5
    console.log("[UnifiedModelProvider] All models unloaded");
  }, []);

  const sendMessage = useCallback(
    async (
      messages: Message[],
      options?: SendMessageOptions,
    ): Promise<string> => {
      const selectedModelId = await modelSettings.getSelectedModelId();
      if (!selectedModelId) {
        throw new Error("No model selected");
      }
      if (isGenerating) {
        throw new Error("Already generating");
      }

      setIsGenerating(true);
      resetIdleTimer(); // Reset idle timer on activity

      try {
        const result = await sendLLMMessage(
          selectedModelId as MODEL_IDS,
          messages,
          {
            responseCallback: options?.responseCallback,
            completeCallback: options?.completeCallback,
            systemPrompt: options?.systemPrompt,
            thinkMode: options?.thinkMode,
          },
        );
        return result;
      } finally {
        setIsGenerating(false);
      }
    },
    [isGenerating, modelSettings, resetIdleTimer],
  );

  const interruptLLM = useCallback(() => {
    modelLibrarySingleton.llm?.module.interrupt();
  }, []);

  // ==========================================================================
  // MODEL MANAGEMENT
  // ==========================================================================

  const reloadModel = useCallback(
    async (config: LlmModelConfig) => {
      await modelSettings.setSelectedModelId(config.modelId);
      setCurrentLLMConfig(config);
      // The model will be loaded on next message send
    },
    [modelSettings],
  );

  // ==========================================================================
  // CONTEXT VALUE
  // ==========================================================================

  const isLLMLoaded = !!modelLibrarySingleton.llm;
  const isSTTLoaded = false; // Will be implemented in Phase 5
  const isTranscribing = false; // Will be implemented in Phase 5

  const contextValue = useMemo<UnifiedModelContextValue>(
    () => ({
      // Initialization
      isInitialized,

      // LLM operations
      isLLMLoaded,
      isGenerating,
      sendMessage,
      interruptLLM,

      // STT operations (placeholders)
      isSTTLoaded,
      isTranscribing,

      // Model lifecycle
      loadLLMModel,
      unloadLLMModel,
      unloadAllModels,

      // Current state
      currentLLMConfig,
      currentSTTConfig,

      // Model management
      reloadModel,

      // Lifecycle
      resetIdleTimer,
    }),
    [
      isInitialized,
      isLLMLoaded,
      isGenerating,
      sendMessage,
      interruptLLM,
      isSTTLoaded,
      isTranscribing,
      loadLLMModel,
      unloadLLMModel,
      unloadAllModels,
      currentLLMConfig,
      currentSTTConfig,
      reloadModel,
      resetIdleTimer,
    ],
  );

  return (
    <UnifiedModelContext.Provider value={contextValue}>
      {children}
    </UnifiedModelContext.Provider>
  );
}

// =============================================================================
// HOOKS
// =============================================================================

/**
 * Hook to access the unified model context
 */
export function useUnifiedModel(): UnifiedModelContextValue {
  const context = useContext(UnifiedModelContext);
  if (!context) {
    throw new Error("useUnifiedModel must be used within UnifiedModelProvider");
  }
  return context;
}

/**
 * Hook for LLM operations (alias for backward compatibility)
 */
export function useLLMContext() {
  const context = useUnifiedModel();
  return {
    isGenerating: context.isGenerating,
    sendMessage: context.sendMessage,
    interrupt: context.interruptLLM,
  };
}

/**
 * Hook for model management (alias for backward compatibility)
 */
export function useModel() {
  const context = useUnifiedModel();
  return {
    reloadModel: context.reloadModel,
    currentConfig: context.currentLLMConfig,
  };
}
