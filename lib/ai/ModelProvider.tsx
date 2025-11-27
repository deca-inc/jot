import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
} from "react";
import { Alert, AppState, AppStateStatus } from "react-native";
import { Message as LlmMessage, LLMModule } from "react-native-executorch";
import {
  LlmModelConfig,
  DEFAULT_MODEL,
  DEFAULT_SYSTEM_PROMPT,
} from "./modelConfig";
import { Block, EntryRepository } from "../db/entries";
import { llmQueue } from "./LLMQueue";

// Re-export for convenience
export { llmQueue };
import {
  registerBackgroundTasks,
  unregisterBackgroundTasks,
  isBackgroundTaskAvailable,
} from "./backgroundTasks";
import { persistentDownloadManager } from "./persistentDownloadManager";
import { modelDownloadStatus } from "./modelDownloadStatus";
import { logStorageDebugInfo, verifyAllModels } from "./modelVerification";
import { ALL_MODELS } from "./modelConfig";
import { useModelSettings } from "../db/modelSettings";
import { generationResumption } from "./generationResumption";
import {
  ModelService as ModelServiceClass,
  GenerationOptions,
} from "./modelService";
import { useDatabase } from "../db/DatabaseProvider";
import { useQueryClient } from "@tanstack/react-query";
import { entryKeys } from "../db/useEntries";

interface LLMListeners {
  onToken: (token: string) => void;
  onMessageHistoryUpdate: (messageHistory: LlmMessage[]) => void;
}

interface LLMForConvo {
  llm: LLMModule;
  sendMessage: (message: string) => Promise<void>;
  generate: (messages: LlmMessage[]) => Promise<string>;
  interrupt: () => void;
  delete: () => void;
}

/**
 * LLMManager - Single instance queue-based manager
 *
 * Uses LLMQueue to ensure only one LLM instance exists at a time.
 * All requests are queued and processed sequentially to prevent OOM.
 */
class LLMManager {
  private listeners = new Map<string, Set<LLMListeners>>();
  private isLoaded = false;
  private currentConfig: LlmModelConfig = DEFAULT_MODEL;

  constructor() {
    // Initialize on first use
  }

  /**
   * Reload the LLM with a new model configuration
   */
  async reloadWithConfig(config: LlmModelConfig): Promise<void> {
    // Update config
    this.currentConfig = config;

    // Load new model - queue will handle unloading/queuing internally
    await llmQueue.load(config);

    // Verify it loaded
    if (llmQueue.getIsLoaded()) {
      this.isLoaded = true;
    } else {
      this.isLoaded = false;
      throw new Error("Failed to reload model - queue reports not loaded");
    }
  }

  /**
   * Get current model configuration
   */
  getCurrentConfig(): LlmModelConfig {
    return this.currentConfig;
  }

  /**
   * Get or create LLM adapter for a conversation
   * Note: All conversations share the same underlying LLM instance via queue
   */
  async getOrCreate(
    convoId: string,
    config: LlmModelConfig,
    listeners?: LLMListeners,
    initialBlocks?: Block[]
  ): Promise<LLMForConvo> {
    // Register listeners first (before loading)
    if (listeners) {
      this.registerListeners(convoId, listeners);
    }

    // Create broadcaster callbacks that route to registered listeners for this convo
    const broadcasterCallbacks: LLMListeners = {
      onToken: (token) => {
        // Broadcast to all registered listeners for this convo
        const convoListeners = this.listeners.get(convoId);
        if (convoListeners) {
          convoListeners.forEach((l) => {
            try {
              l.onToken?.(token);
            } catch (e) {
              console.error(`[LLMManager] Error in token callback:`, e);
            }
          });
        }
      },
      onMessageHistoryUpdate: (messages) => {
        // Broadcast to all registered listeners for this convo
        const convoListeners = this.listeners.get(convoId);
        if (convoListeners) {
          convoListeners.forEach((l) => {
            try {
              l.onMessageHistoryUpdate?.(messages);
            } catch (e) {
              console.error(
                `[LLMManager] Error in messageHistory callback:`,
                e
              );
            }
          });
        }
      },
    };

    // Register callbacks for this conversation
    llmQueue.registerCallbacks(convoId, broadcasterCallbacks);

    // Check if we need to load or reload the model
    // CRITICAL: Check if model is loaded AND if it's the correct model
    const needsReload =
      !this.isLoaded ||
      !llmQueue.getIsLoaded() ||
      this.currentConfig.modelId !== config.modelId;

    if (needsReload) {
      try {
        // Load the new model - queue will handle unloading/queuing internally
        // This will automatically wait for any ongoing operations and queue if needed
        await llmQueue.load(config);

        // Only set our flag if queue confirms it's loaded
        if (llmQueue.getIsLoaded()) {
          this.isLoaded = true;
          this.currentConfig = config;
        } else {
          throw new Error("LLM failed to load - queue reports not loaded");
        }
      } catch (error) {
        console.error(`[LLMManager] Failed to load LLM:`, error);
        this.isLoaded = false;
        throw error;
      }
    }

    // Return adapter that uses the queue
    return {
      llm: null as any, // Not used - we use queue directly
      sendMessage: async (message: string) => {
        // Convert message to messages array
        const messages: LlmMessage[] = [{ role: "user", content: message }];
        await llmQueue.generate(convoId, messages);
      },
      generate: async (messages: LlmMessage[]) => {
        return await llmQueue.generate(convoId, messages);
      },
      interrupt: () => {
        // Only interrupt if this is the current request
        if (llmQueue.getCurrentRequestId() === convoId) {
          llmQueue.interrupt();
        }
      },
      delete: () => {
        // Don't delete the queue instance - just unregister listeners
        // Queue will be unloaded when all conversations are done
        this.unregisterListeners(convoId, listeners!);
      },
    };
  }

  registerListeners(convoId: string, listeners: LLMListeners) {
    if (!this.listeners.has(convoId)) {
      this.listeners.set(convoId, new Set());
    }
    this.listeners.get(convoId)!.add(listeners);
  }

  unregisterListeners(convoId: string, listeners: LLMListeners) {
    this.listeners.get(convoId)?.delete(listeners);

    // Unregister callbacks from queue
    llmQueue.unregisterCallbacks(convoId);

    // NOTE: We keep the LLM loaded while the app is alive
    // Loading/unloading is expensive and causes interruptions
    // With a single instance, memory usage is manageable (~100-200MB)
  }

  delete(convoId: string) {
    // Unregister all listeners for this conversation
    this.listeners.delete(convoId);

    // Unregister callbacks from queue
    llmQueue.unregisterCallbacks(convoId);

    // NOTE: We keep the LLM loaded while the app is alive
    // Only unload on app termination (via destroy())
  }

  unload(convoId: string) {
    this.delete(convoId);
  }

  destroy() {
    // Unload queue and clear all listeners
    llmQueue.unload().catch((e) => {
      console.error(`[LLMManager] Failed to unload queue on destroy:`, e);
    });
    this.listeners.clear();
    this.isLoaded = false;
  }
}

// Singleton instance
export const llmManager = new LLMManager();

// Context for model management
interface ModelContextValue {
  reloadModel: (config: LlmModelConfig) => Promise<void>;
  currentConfig: LlmModelConfig;
}

const ModelContext = createContext<ModelContextValue | null>(null);

export function useModel(): ModelContextValue {
  const context = useContext(ModelContext);
  if (!context) {
    throw new Error("useModel must be used within ModelProvider");
  }
  return context;
}

// Provider component to wrap app
export function ModelProvider({ children }: { children: React.ReactNode }) {
  const [currentConfig, setCurrentConfig] =
    useState<LlmModelConfig>(DEFAULT_MODEL);
  const modelSettings = useModelSettings();
  const db = useDatabase();

  // Initialize download managers and verify models on mount
  useEffect(() => {
    let isMounted = true;

    async function initializeDownloadManagers() {
      try {
        // Log storage debug info (helps diagnose Android issues)
        await logStorageDebugInfo();

        // Initialize download status manager (loads persisted state)
        await modelDownloadStatus.initialize();

        // Verify all downloaded models still exist (Android can clear cache)
        const downloadedModels = await modelSettings.getDownloadedModels();
        if (downloadedModels.length > 0) {
          const verification = await verifyAllModels(
            downloadedModels.map((m) => m.modelId),
            ALL_MODELS
          );

          if (verification.missing.length > 0) {
            console.warn(
              `[ModelProvider] ⚠️  ${verification.missing.length} model(s) are missing from disk!`,
              verification.missing
            );

            // Clean up database entries for missing models
            for (const missingModelId of verification.missing) {
              await modelSettings.removeDownloadedModel(missingModelId);
            }
          }
        }

        // Check for pending downloads
        const pendingDownloads =
          await persistentDownloadManager.getPendingDownloads();

        if (pendingDownloads.length > 0) {
          // Clean up old/stale downloads (older than 7 days)
          await persistentDownloadManager.cleanupOldDownloads();
        }

        // Check for incomplete generations that can be resumed
        await generationResumption.checkForIncompleteGenerations(db);
      } catch (error) {
        console.error("[ModelProvider] Failed to initialize:", error);
      }
    }

    if (isMounted) {
      initializeDownloadManagers();
    }

    return () => {
      isMounted = false;
    };
  }, [modelSettings, db]);

  const reloadModel = useCallback(async (config: LlmModelConfig) => {
    await llmManager.reloadWithConfig(config);
    setCurrentConfig(config);
  }, []);

  const value: ModelContextValue = {
    reloadModel,
    currentConfig,
  };

  return (
    <ModelContext.Provider value={value}>{children}</ModelContext.Provider>
  );
}

export function useLLMForConvo(
  convoId: string,
  entryId?: number,
  initialBlocks?: Block[],
  modelConfig?: LlmModelConfig
) {
  const listenersRef = useRef<LLMListeners | null>(null);
  const [llm, setLlm] = useState<LLMForConvo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const db = useDatabase(); // Get database instance for writes
  const entryRepositoryRef = useRef<EntryRepository | null>(null);
  const queryClient = useQueryClient();

  // CRITICAL: Use ref to capture model config on FIRST render only
  // This prevents duplicate loads when parent re-renders with different config object
  const modelConfigFirstLoadRef = useRef<LlmModelConfig | null>(null);
  if (!modelConfigFirstLoadRef.current) {
    modelConfigFirstLoadRef.current = modelConfig || DEFAULT_MODEL;
  }

  // Initialize entry repository
  useEffect(() => {
    entryRepositoryRef.current = new EntryRepository(db);
  }, [db]);

  // Track app state for background handling
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      appStateRef.current = nextAppState;
    });
    return () => subscription.remove();
  }, []);

  // Track if we've received initial blocks to prevent overwriting with empty messages
  const hasInitializedRef = useRef<boolean>(false);
  const initialBlocksRef = useRef<Block[] | undefined>(initialBlocks);

  // Update initialBlocks ref when it changes
  useEffect(() => {
    if (initialBlocks && initialBlocks.length > 0) {
      initialBlocksRef.current = initialBlocks;
      hasInitializedRef.current = true;
    }
  }, [initialBlocks]);

  // Track if component is mounted to prevent callbacks after unmount
  const isMountedRefForCallbacks = useRef(true);

  // Simple UI-only listeners - database writes are handled by actions layer
  const onToken = useCallback(
    async (token: string) => {
      // Only update UI if component is mounted
      // Database writes are handled by the actions layer
      if (!isMountedRefForCallbacks.current || !entryId) {
        return;
      }

      // Update React Query cache for UI updates
      try {
        const entry = await entryRepositoryRef.current?.getById(entryId);
        if (entry) {
          // Get current response from the last assistant block
          const lastBlock = entry.blocks[entry.blocks.length - 1];
          const currentContent =
            lastBlock?.role === "assistant" && lastBlock?.type === "markdown"
              ? lastBlock.content
              : "";

          // Update cache with new token (optimistic update)
          queryClient.setQueryData(entryKeys.detail(entryId), {
            ...entry,
            blocks: [
              ...entry.blocks.slice(0, -1),
              {
                type: "markdown" as const,
                content: currentContent + token,
                role: "assistant" as const,
              },
            ],
          });
        }
      } catch (e) {
        // Ignore errors - database writes are handled by actions
        console.warn(`[${convoId}] Failed to update UI cache:`, e);
      }
    },
    [convoId, entryId, queryClient]
  );

  const onMessageHistoryUpdate = useCallback(
    async (messages: LlmMessage[]) => {
      // Only update UI if component is mounted
      // Database writes are handled by the actions layer
      if (!isMountedRefForCallbacks.current || !entryId) {
        return;
      }

      // Update React Query cache for UI updates
      try {
        const entry = await entryRepositoryRef.current?.getById(entryId);
        if (!entry) return;

        // Convert LLM messages back to blocks
        const updatedBlocks = messages
          .filter((m) => m.role !== "system")
          .map((m) => ({
            type: "markdown" as const,
            content: m.content,
            role: m.role as "user" | "assistant",
          }));

        // Only update if we have actual messages
        if (updatedBlocks.length > 0) {
          queryClient.setQueryData(entryKeys.detail(entryId), {
            ...entry,
            blocks: updatedBlocks,
          });
        }
      } catch (e) {
        // Ignore errors - database writes are handled by actions
        console.warn(`[${convoId}] Failed to update UI cache:`, e);
      }
    },
    [convoId, entryId, queryClient]
  );

  // Track if component is mounted to prevent callbacks after unmount
  const isMountedRef = useRef(true);

  // Update mounted ref when component mounts/unmounts
  useEffect(() => {
    isMountedRef.current = true;
    isMountedRefForCallbacks.current = true;
    return () => {
      isMountedRef.current = false;
      isMountedRefForCallbacks.current = false;
    };
  }, []);

  useEffect(() => {
    // Register background tasks on first mount (only once)
    registerBackgroundTasks();

    const listeners: LLMListeners = {
      onToken,
      onMessageHistoryUpdate,
    };
    listenersRef.current = listeners;

    // Check if app is backgrounded
    const isBackgrounded = appStateRef.current !== "active";
    if (isBackgrounded) {
      console.warn(
        `[${convoId}] Starting generation while backgrounded - may be interrupted`
      );
    }

    // Use first-load model config to prevent duplicate loads
    const configToUse = modelConfigFirstLoadRef.current!;

    llmManager
      .getOrCreate(convoId, configToUse, listeners, initialBlocks)
      .then((instance) => {
        if (isMountedRef.current) {
          setLlm(instance);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (isMountedRef.current) {
          console.error(`[${convoId}] Failed to load LLM:`, err);
          setError(err?.message || "Failed to load model");
          setIsLoading(false);
        }
      });

    // On unmount: interrupt generation, unregister listeners, and cleanup
    let finalWriteTimeout: NodeJS.Timeout | null = null;

    return () => {
      isMountedRef.current = false;
      isMountedRefForCallbacks.current = false;

      // Unregister listeners - database writes are handled by actions layer
      if (listenersRef.current) {
        llmManager.unregisterListeners(convoId, listenersRef.current);
      }
    };
  }, [convoId, onToken, onMessageHistoryUpdate, entryId]); // Model config captured on first render via ref - won't change

  return { llm, isLoading, error };
}

/**
 * Convert Block[] (from database) to LlmMessage[] (for model)
 * Filters to markdown blocks and preserves role information
 */
export function blocksToLlmMessages(
  blocks: Block[],
  systemPrompt?: string
): LlmMessage[] {
  const messages: LlmMessage[] = [];

  // Use default system prompt if none provided
  const promptToUse = systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
  messages.push({ role: "system", content: promptToUse });

  const chatMessages = blocks
    .filter((m) => m.type === "markdown")
    .map((m) => ({
      role: (m.role || "user") as "user" | "assistant" | "system",
      content: m.content,
    }));

  messages.push(...chatMessages);
  return messages;
}
