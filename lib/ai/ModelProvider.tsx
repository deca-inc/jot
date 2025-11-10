import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
} from "react";
import { Alert, AppState, AppStateStatus } from "react-native";
import {
  useLLM,
  Message as LlmMessage,
  LLMModule,
} from "react-native-executorch";
import { Llama32_1B_Instruct, LlmModelConfig } from "./modelConfig";
import { ensureModelPresent } from "./modelManager";
import { Block, EntryRepository } from "../db/entries";
import { llmQueue } from "./LLMQueue";

// Re-export for convenience
export { llmQueue };
import {
  registerBackgroundTasks,
  unregisterBackgroundTasks,
  isBackgroundTaskAvailable,
} from "./backgroundTasks";
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

async function createLLMForConvo(
  config: LlmModelConfig,
  listeners: LLMListeners,
  convoId?: string,
  generatingTracker?: Set<string>
): Promise<LLMForConvo> {
  if (
    !config.pteSource ||
    !config.tokenizerSource ||
    !config.tokenizerConfigSource
  ) {
    throw new Error(`Model config ${config.modelId} is not valid`);
  }

  let llm: LLMModule | null = null;
  let isDeleted = false; // Flag to invalidate callbacks after deletion

  try {
    // Ensure model files are downloaded/available before loading
    const modelPaths = await ensureModelPresent(config);

    // Create safe wrappers for callbacks that check if instance is still valid
    const safeTokenCallback = (token: string) => {
      if (isDeleted || !llm) {
        return; // Ignore callbacks after deletion
      }
      try {
        listeners.onToken(token);
      } catch (e) {
        console.error(`[createLLMForConvo] Error in safeTokenCallback:`, e);
      }
    };

    const safeMessageHistoryCallback = (messages: LlmMessage[]) => {
      if (isDeleted || !llm) {
        return; // Ignore callbacks after deletion
      }
      try {
        listeners.onMessageHistoryUpdate(messages);
      } catch (e) {
        console.error(
          `[createLLMForConvo] Error in safeMessageHistoryCallback:`,
          e
        );
      }
    };

    llm = new LLMModule({
      tokenCallback: safeTokenCallback,
      messageHistoryCallback: safeMessageHistoryCallback,
    });

    // Load model with error handling
    try {
      await llm.load(
        {
          modelSource: modelPaths.ptePath,
          tokenizerSource: modelPaths.tokenizerPath || "",
          tokenizerConfigSource: modelPaths.tokenizerConfigPath || "",
        },
        (progress) => {
          // Download progress callback (optional)
        }
      );

      // Small delay to ensure native module is fully initialized
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (loadError) {
      console.error(`[createLLMForConvo] Failed to load model:`, loadError);
      isDeleted = true; // Mark as deleted to prevent callbacks
      // Clean up the LLM instance if load failed
      try {
        if (llm) {
          llm.delete();
        }
      } catch (cleanupError) {
        console.error(
          `[createLLMForConvo] Failed to cleanup after load error:`,
          cleanupError
        );
      }
      throw loadError;
    }

    // Track if this instance is currently generating to prevent concurrent calls
    let isGenerating = false;

    return {
      llm,
      sendMessage: async (message: string) => {
        if (isDeleted || !llm) {
          throw new Error("LLM instance has been deleted");
        }
        try {
          await llm.sendMessage(message);
        } catch (e) {
          console.error(`[createLLMForConvo] sendMessage failed:`, e);
          throw e;
        }
      },
      generate: async (messages: LlmMessage[]) => {
        if (isDeleted || !llm) {
          throw new Error("LLM instance has been deleted");
        }

        // Prevent concurrent generate() calls on the same instance
        if (isGenerating) {
          console.warn(
            `[createLLMForConvo] Generation already in progress, ignoring concurrent call`
          );
          throw new Error("Generation already in progress");
        }

        if (convoId && generatingTracker) {
          if (generatingTracker.has(convoId)) {
            console.warn(
              `[createLLMForConvo] Generation already in progress for ${convoId}`
            );
            throw new Error("Generation already in progress");
          }
          generatingTracker.add(convoId);
        }

        isGenerating = true;

        try {
          // generate() returns the response string and triggers tokenCallback during generation
          // But it doesn't update messageHistory automatically like sendMessage() does
          const response = await llm.generate(messages);

          // Only update message history if not deleted
          if (!isDeleted) {
            // generate() doesn't automatically update messageHistory, so we need to manually
            // reconstruct the full conversation and trigger the callback
            // This ensures the UI/database gets the final state
            const fullHistory = [
              ...messages,
              { role: "assistant" as const, content: response },
            ];
            listeners.onMessageHistoryUpdate(fullHistory);
          }

          return response;
        } catch (e) {
          console.error(`[createLLMForConvo] Generation failed:`, e);
          throw e;
        } finally {
          isGenerating = false;
          if (convoId && generatingTracker) {
            generatingTracker.delete(convoId);
          }
        }
      },
      interrupt: () => {
        if (isDeleted || !llm) {
          return;
        }
        try {
          llm.interrupt();
        } catch (e) {
          console.error(`[createLLMForConvo] Failed to interrupt:`, e);
        } finally {
          isGenerating = false;
          if (convoId && generatingTracker) {
            generatingTracker.delete(convoId);
          }
        }
      },
      delete: () => {
        if (isDeleted) {
          return; // Already deleted
        }
        isDeleted = true; // Mark as deleted first to stop callbacks

        try {
          if (llm) {
            // Interrupt any ongoing generation first
            if (isGenerating) {
              try {
                llm.interrupt();
              } catch (e) {
                // Ignore errors during interrupt
              }
            }
          }
        } catch (e) {
          console.error(
            `[createLLMForConvo] Error during interrupt before delete:`,
            e
          );
        }

        try {
          if (llm) {
            llm.delete();
            llm = null; // Clear reference
          }
        } catch (e) {
          console.error(`[createLLMForConvo] Failed to delete LLM:`, e);
        } finally {
          isGenerating = false;
          if (convoId && generatingTracker) {
            generatingTracker.delete(convoId);
          }
        }
      },
    };
  } catch (error) {
    // If we created an LLM instance but failed somewhere, clean it up
    isDeleted = true; // Mark as deleted to prevent callbacks
    if (llm) {
      try {
        llm.delete();
      } catch (cleanupError) {
        console.error(
          `[createLLMForConvo] Failed to cleanup after error:`,
          cleanupError
        );
      }
      llm = null;
    }
    throw error;
  }
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
  private currentConfig: LlmModelConfig = Llama32_1B_Instruct;

  constructor() {
    // Initialize on first use
  }

  /**
   * Reload the LLM with a new model configuration
   */
  async reloadWithConfig(config: LlmModelConfig): Promise<void> {
    console.log(`[LLMManager] Reloading with model: ${config.modelId}`);
    
    // Unload current model
    await llmQueue.unload();
    this.isLoaded = false;
    
    // Update config
    this.currentConfig = config;
    
    // Load new model
    await llmQueue.load(config);
    this.isLoaded = true;
    
    console.log(`[LLMManager] Successfully reloaded with ${config.modelId}`);
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

    // Load LLM queue if not already loaded
    // CRITICAL: Check both our flag and the queue's actual state
    if (!this.isLoaded || !llmQueue.getIsLoaded()) {
      try {
        await llmQueue.load(config);
        // Only set our flag if queue confirms it's loaded
        if (llmQueue.getIsLoaded()) {
          this.isLoaded = true;
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
  const [currentConfig, setCurrentConfig] = useState<LlmModelConfig>(
    Llama32_1B_Instruct
  );

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
  initialBlocks?: Block[]
) {
  const listenersRef = useRef<LLMListeners | null>(null);
  const [llm, setLlm] = useState<LLMForConvo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const db = useDatabase(); // Get database instance for writes
  const entryRepositoryRef = useRef<EntryRepository | null>(null);
  const queryClient = useQueryClient();

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

  // Accumulate tokens for debounced DB writes
  const tokenBufferRef = useRef<string>("");
  const lastWriteTimeRef = useRef<number>(0);
  const DEBOUNCE_MS = 500; // Write to DB every 500ms
  const lastFullResponseRef = useRef<string>("");
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

  // Create listeners that handle both UI updates and DB writes
  const onToken = useCallback(
    async (token: string) => {
      // Guard: Don't process if component is unmounted
      if (!isMountedRefForCallbacks.current) {
        return;
      }

      if (!entryId || !entryRepositoryRef.current) {
        return;
      }

      // Accumulate tokens
      tokenBufferRef.current += token;
      lastFullResponseRef.current += token;

      const now = Date.now();
      const shouldWrite =
        now - lastWriteTimeRef.current >= DEBOUNCE_MS ||
        tokenBufferRef.current.length >= 100; // Or if buffer is large

      if (shouldWrite) {
        try {
          // Get current entry to preserve existing blocks
          const entry = await entryRepositoryRef.current.getById(entryId);
          if (!entry) {
            console.warn(`[${convoId}] Entry ${entryId} not found`);
            return;
          }

          // Update assistant message block (last one should be assistant)
          const updatedBlocks = [...entry.blocks];
          const lastBlock = updatedBlocks[updatedBlocks.length - 1];

          if (
            lastBlock &&
            lastBlock.role === "assistant" &&
            lastBlock.type === "markdown"
          ) {
            // Update existing assistant block
            updatedBlocks[updatedBlocks.length - 1] = {
              type: "markdown",
              content: lastFullResponseRef.current,
              role: "assistant",
            } as Block;
          } else {
            // Add new assistant block
            updatedBlocks.push({
              type: "markdown",
              content: lastFullResponseRef.current,
              role: "assistant",
            });
          }

          // Write to database (works even when backgrounded)
          await entryRepositoryRef.current.update(entryId, {
            blocks: updatedBlocks,
          });

          // Update React Query cache (for UI updates)
          // React Query uses deep equality, so new blocks array will trigger updates
          queryClient.setQueryData(entryKeys.detail(entryId), {
            ...entry,
            blocks: updatedBlocks,
          });

          // Clear buffer and update write time
          tokenBufferRef.current = "";
          lastWriteTimeRef.current = now;
        } catch (e) {
          console.error(`[${convoId}] Failed to write token to DB:`, e);
          // Don't throw - continue generation even if write fails
        }
      }
    },
    [convoId, entryId, queryClient]
  );

  const onMessageHistoryUpdate = useCallback(
    async (messages: LlmMessage[]) => {
      // Guard: Don't process if component is unmounted
      if (!isMountedRefForCallbacks.current) {
        return;
      }

      // Final message history update - ensure DB is up to date
      if (entryId && entryRepositoryRef.current) {
        try {
          const entry = await entryRepositoryRef.current.getById(entryId);
          if (!entry) return;

          // Convert LLM messages back to blocks
          const updatedBlocks = messages
            .filter((m) => m.role !== "system")
            .map((m) => ({
              type: "markdown" as const,
              content: m.content,
              role: m.role as "user" | "assistant",
            }));

          // CRITICAL FIX: Prevent overwriting existing blocks with empty messages
          // This can happen when:
          // 1. LLM instance initializes and calls callback with empty array
          // 2. Opening an existing conversation triggers initialization
          // 3. We should never replace existing content with empty content
          if (updatedBlocks.length === 0) {
            // If messages are empty and entry already has blocks, don't overwrite
            if (entry.blocks && entry.blocks.length > 0) {
              console.log(
                `[${convoId}] Ignoring empty message history update - entry has ${entry.blocks.length} existing blocks`
              );
              return;
            }
          }

          // If we have existing blocks and the new blocks are shorter than existing,
          // this might be an initialization issue - compare more carefully
          if (
            entry.blocks &&
            entry.blocks.length > 0 &&
            updatedBlocks.length < entry.blocks.length
          ) {
            // Check if existing blocks are actually different from new blocks
            // Only update if new blocks have more content or are actually different
            const existingContent = entry.blocks
              .filter((b) => b.type === "markdown")
              .map((b) => b.content)
              .join("");
            const newContent = updatedBlocks.map((b) => b.content).join("");

            // If new content is empty or shorter than existing, don't overwrite
            if (!newContent || newContent.length < existingContent.length) {
              console.log(
                `[${convoId}] Ignoring message history update - would lose ${
                  entry.blocks.length - updatedBlocks.length
                } blocks`
              );
              return;
            }
          }

          // Only update if we have actual messages to write
          if (updatedBlocks.length > 0 || entry.blocks.length === 0) {
            await entryRepositoryRef.current.update(entryId, {
              blocks: updatedBlocks,
            });

            // Update React Query cache (triggers UI updates)
            queryClient.setQueryData(entryKeys.detail(entryId), {
              ...entry,
              blocks: updatedBlocks,
            });
          }

          // Clear token buffer
          tokenBufferRef.current = "";
          lastFullResponseRef.current = "";
        } catch (e) {
          console.error(`[${convoId}] Failed to write message history:`, e);
        }
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

    llmManager
      .getOrCreate(convoId, Llama32_1B_Instruct, listeners, initialBlocks)
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
      isMountedRef.current = false; // Mark as unmounted to prevent state updates

      // Interrupt any ongoing generation before cleanup
      if (listenersRef.current) {
        try {
          // Interrupt via queue if this conversation is currently processing
          if (llmQueue.getCurrentRequestId() === convoId) {
            llmQueue.interrupt();
          }
        } catch (e) {
          console.error(`[${convoId}] Failed to interrupt on unmount:`, e);
        }

        // Unregister listeners
        llmManager.unregisterListeners(convoId, listenersRef.current);
      }

      // Write any remaining buffered tokens (but only if entry still exists)
      // CRITICAL: Don't write to database on unmount if entry was deleted
      // This prevents crashes from trying to update deleted entries
      if (tokenBufferRef.current && entryId && entryRepositoryRef.current) {
        // Final write on unmount - use setTimeout to avoid blocking unmount
        // But only if we have a valid entryId and the component is unmounted
        finalWriteTimeout = setTimeout(() => {
          if (!isMountedRef.current && entryRepositoryRef.current) {
            // Only proceed if still unmounted (avoid race condition)
            entryRepositoryRef.current
              .getById(entryId)
              .then((entry) => {
                // Guard: Check if entry still exists and component is still unmounted
                if (
                  entry &&
                  !isMountedRef.current &&
                  entryRepositoryRef.current
                ) {
                  try {
                    const updatedBlocks = [...entry.blocks];
                    const lastBlock = updatedBlocks[updatedBlocks.length - 1];
                    if (
                      lastBlock &&
                      lastBlock.role === "assistant" &&
                      lastBlock.type === "markdown"
                    ) {
                      updatedBlocks[updatedBlocks.length - 1] = {
                        type: "markdown",
                        content: lastFullResponseRef.current,
                        role: "assistant",
                      } as Block;
                    }
                    return entryRepositoryRef.current.update(entryId, {
                      blocks: updatedBlocks,
                    });
                  } catch (updateError) {
                    // Entry might have been deleted - ignore error
                    console.warn(
                      `[${convoId}] Final write failed - entry may be deleted:`,
                      updateError
                    );
                  }
                }
              })
              .catch((e) => {
                // Entry doesn't exist or was deleted - this is expected, don't log as error
                if (e?.message?.includes("not found")) {
                  console.log(
                    `[${convoId}] Entry ${entryId} not found for final write - already deleted`
                  );
                } else {
                  console.error(`[${convoId}] Final write failed:`, e);
                }
              });
          }
        }, 0);
      }

      // Clear timeout on cleanup if it was set
      if (finalWriteTimeout) {
        clearTimeout(finalWriteTimeout);
      }
    };
  }, [convoId, onToken, onMessageHistoryUpdate, entryId]); // Don't include initialBlocks - only for initial setup

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

  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }

  const chatMessages = blocks
    .filter((m) => m.type === "markdown")
    .map((m) => ({
      role: (m.role || "user") as "user" | "assistant" | "system",
      content: m.content,
    }));

  messages.push(...chatMessages);
  return messages;
}
