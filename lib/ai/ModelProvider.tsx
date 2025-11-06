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
  listeners: LLMListeners
): Promise<LLMForConvo> {
  if (
    !config.pteSource ||
    !config.tokenizerSource ||
    !config.tokenizerConfigSource
  ) {
    throw new Error(`Model config ${config.modelId} is not valid`);
  }

  // Ensure model files are downloaded/available before loading
  const modelPaths = await ensureModelPresent(config);

  const llm = new LLMModule({
    tokenCallback: (token) => {
      listeners.onToken(token);
    },
    messageHistoryCallback: (messages) => {
      listeners.onMessageHistoryUpdate(messages);
    },
  });

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

  return {
    llm,
    sendMessage: async (message: string) => {
      await llm.sendMessage(message);
    },
    generate: async (messages: LlmMessage[]) => {
      try {
        // generate() returns the response string and triggers tokenCallback during generation
        // But it doesn't update messageHistory automatically like sendMessage() does
        const response = await llm.generate(messages);

        // generate() doesn't automatically update messageHistory, so we need to manually
        // reconstruct the full conversation and trigger the callback
        // This ensures the UI/database gets the final state
        const fullHistory = [
          ...messages,
          { role: "assistant" as const, content: response },
        ];
        listeners.onMessageHistoryUpdate(fullHistory);

        return response;
      } catch (e) {
        console.error(`[createLLMForConvo] Generation failed:`, e);
        throw e;
      }
    },
    interrupt: () => {
      llm.interrupt();
    },
    delete: () => {
      llm.delete();
    },
  };
}

class LLMManager {
  private instances = new Map<string, LLMForConvo>();
  private listeners = new Map<string, Set<LLMListeners>>();
  private lastActivityTime = new Map<string, number>();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly INACTIVITY_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
  private readonly CHECK_INTERVAL_MS = 10 * 1000; // 10 seconds

  constructor() {
    this.startCleanupChecker();
  }

  private startCleanupChecker() {
    if (this.cleanupInterval) return;

    this.cleanupInterval = setInterval(() => {
      this.checkAndCleanupInactive();
    }, this.CHECK_INTERVAL_MS);
  }

  private checkAndCleanupInactive() {
    const now = Date.now();

    for (const [convoId, lastActive] of this.lastActivityTime.entries()) {
      const hasListeners = (this.listeners.get(convoId)?.size ?? 0) > 0;
      const timeSinceActivity = now - lastActive;

      if (!hasListeners && timeSinceActivity >= this.INACTIVITY_THRESHOLD_MS) {
        this.delete(convoId);
      }
    }
  }

  private markActivity(convoId: string) {
    this.lastActivityTime.set(convoId, Date.now());
  }

  async getOrCreate(
    convoId: string,
    config: LlmModelConfig,
    listeners?: LLMListeners,
    initialBlocks?: Block[]
  ): Promise<LLMForConvo> {
    if (this.instances.has(convoId)) {
      if (listeners) {
        this.registerListeners(convoId, listeners);
      }
      this.markActivity(convoId);
      return this.instances.get(convoId)!;
    }

    // Register listeners before creating LLM so they're in the map
    if (listeners) {
      this.registerListeners(convoId, listeners);
    }

    // Create broadcaster callbacks that route to all registered listeners
    const broadcasterCallbacks: LLMListeners = {
      onToken: (token) => {
        this.markActivity(convoId);
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
        this.markActivity(convoId);
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

    const llm = await createLLMForConvo(config, broadcasterCallbacks);

    // Configure LLM - always set system prompt
    // Note: We configure with an empty initial history because:
    // 1. If using sendMessage(), it will manage history statefully
    // 2. If using generate(), it receives the full context each time
    // This avoids duplication and ensures full context is always passed
    const systemPrompt = "You are a helpful AI assistant.";

    llm.llm.configure({
      chatConfig: {
        initialMessageHistory: [],
        systemPrompt,
      },
    });

    this.instances.set(convoId, llm);
    // Listeners already registered above, before creating LLM

    this.markActivity(convoId);

    return llm;
  }

  registerListeners(convoId: string, listeners: LLMListeners) {
    if (!this.listeners.has(convoId)) {
      this.listeners.set(convoId, new Set());
    }
    this.listeners.get(convoId)!.add(listeners);
    this.markActivity(convoId);
  }

  unregisterListeners(convoId: string, listeners: LLMListeners) {
    this.listeners.get(convoId)?.delete(listeners);
  }

  delete(convoId: string) {
    this.instances.get(convoId)?.delete();
    this.instances.delete(convoId);
    this.listeners.delete(convoId);
    this.lastActivityTime.delete(convoId);
  }

  unload(convoId: string) {
    this.delete(convoId);
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    for (const convoId of this.instances.keys()) {
      this.delete(convoId);
    }
  }
}

// Singleton instance
export const llmManager = new LLMManager();

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

  // Create listeners that handle both UI updates and DB writes
  const onToken = useCallback(
    async (token: string) => {
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

          await entryRepositoryRef.current.update(entryId, {
            blocks: updatedBlocks,
          });

          // Update React Query cache (triggers UI updates)
          queryClient.setQueryData(entryKeys.detail(entryId), {
            ...entry,
            blocks: updatedBlocks,
          });

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
        setLlm(instance);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error(`[${convoId}] Failed to load LLM:`, err);
        setError(err?.message || "Failed to load model");
        setIsLoading(false);
      });

    // On unmount: unregister listeners but DON'T delete instance
    return () => {
      if (listenersRef.current) {
        llmManager.unregisterListeners(convoId, listenersRef.current);
      }
      // Write any remaining buffered tokens
      if (tokenBufferRef.current && entryId && entryRepositoryRef.current) {
        // Final write on unmount
        entryRepositoryRef.current
          .getById(entryId)
          .then((entry) => {
            if (entry) {
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
              return entryRepositoryRef.current!.update(entryId, {
                blocks: updatedBlocks,
              });
            }
          })
          .catch((e) => console.error(`[${convoId}] Final write failed:`, e));
      }
    };
  }, [convoId, onToken, onMessageHistoryUpdate, entryId, initialBlocks]);

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
