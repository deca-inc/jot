/**
 * LLMProvider - Keeps a single LLM instance mounted at the app level
 *
 * Uses LLMModule directly (instead of useLLM hook) for explicit control over
 * model loading and unloading to prevent OOM when switching models.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { LLMModule, Message } from "react-native-executorch";
import { Block } from "../db/entries";
import { useModelSettings } from "../db/modelSettings";
import { registerBackgroundTasks } from "./backgroundTasks";
import { truncateContext, fitsInContext } from "./contextManager";
import {
  LlmModelConfig,
  getModelById,
  MODEL_IDS,
  DEFAULT_SYSTEM_PROMPT,
} from "./modelConfig";
import { ensureModelPresent } from "./modelManager";

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
  isGenerating: boolean;
  sendMessage: (
    messages: Message[],
    options?: {
      responseCallback?: (responseSoFar: string) => void;
      completeCallback?: (results: string) => void;
    },
  ) => Promise<string>;
  registerPendingSave: (save: PendingSave) => void;
  clearPendingSave: () => void;
  interrupt: () => void;
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

interface ModelLibrary {
  llm?: {
    config: LlmModelConfig;
    module: LLMModule;
  };
}

// Singleton - exists outside React lifecycle to avoid closure/ref issues
const modelLibrarySingleton: ModelLibrary = {};

async function modelLoader(type: "llm", modelId: MODEL_IDS): Promise<void> {
  if (
    modelLibrarySingleton[type] &&
    modelLibrarySingleton[type].config.modelId === modelId
  ) {
    return;
  }

  const hasNewModelAssigned =
    modelLibrarySingleton[type] &&
    modelLibrarySingleton[type].config.modelId !== modelId;

  if (modelLibrarySingleton[type] && hasNewModelAssigned) {
    modelLibrarySingleton[type].module.interrupt();
    modelLibrarySingleton[type].module.delete();
    delete modelLibrarySingleton[type];
    // Wait an arbitrary amount of time for gc
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  const config = getModelById(modelId);
  const llm = new LLMModule({});

  if (!config) {
    throw new Error(`No model config for ${modelId}`);
  }

  const modelFiles = await ensureModelPresent(config);

  await llm.load({
    modelSource: addFilePrefix(modelFiles.ptePath),
    tokenizerSource: addFilePrefix(modelFiles.tokenizerPath || ""),
    tokenizerConfigSource: addFilePrefix(modelFiles.tokenizerConfigPath || ""),
  });

  modelLibrarySingleton[type] = {
    config,
    module: llm,
  };
}

async function sendLLMModelMessage(
  currentModelName: MODEL_IDS,
  messages: Message[],
  options?: {
    tokenCallback?: (token: string) => void;
    responseCallback?: (responseSoFar: string) => void;
    completeCallback?: (result: string) => void;
  },
): Promise<string> {
  await modelLoader("llm", currentModelName);
  let response = "";
  modelLibrarySingleton.llm?.module.setTokenCallback({
    tokenCallback: (token: string) => {
      response += token;
      options?.responseCallback?.(response);
    },
  });

  // trim context if neccessary
  let preparedMessages = messages;
  if (!modelLibrarySingleton.llm) throw new Error("Model not loaded");
  if (!fitsInContext(messages, modelLibrarySingleton.llm.config.modelId)) {
    preparedMessages = truncateContext(
      messages,
      modelLibrarySingleton.llm.config.modelId,
    );
  }
  preparedMessages = [
    {
      role: "system",
      content: DEFAULT_SYSTEM_PROMPT,
    } as Message,
    ...messages,
  ];

  const result = await modelLibrarySingleton.llm?.module.generate(
    preparedMessages,
  );
  if (!result) {
    throw new Error("No content from generation");
  }
  options?.completeCallback?.(result);
  return result;
}

export function LLMProvider({ children }: { children: React.ReactNode }) {
  const modelSettings = useModelSettings();

  // LLM state
  const [isGenerating, setIsGenerating] = useState(false);

  // Register background tasks on mount
  useEffect(() => {
    registerBackgroundTasks();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      modelLibrarySingleton.llm?.module.interrupt();
      modelLibrarySingleton.llm?.module.delete();
      delete modelLibrarySingleton.llm;
    };
  }, []);

  // Pending save - stores info needed to save response even if component unmounts
  const pendingSaveRef = useRef<PendingSave | null>(null);

  const registerPendingSave = useCallback((save: PendingSave) => {
    pendingSaveRef.current = save;
  }, []);

  const clearPendingSave = useCallback(() => {
    pendingSaveRef.current = null;
  }, []);

  // Send message helper that handles context limits
  const sendMessage = useCallback(
    async (
      messages: Message[],
      options?: {
        responseCallback?: (responseSoFar: string) => void;
        completeCallback?: (results: string) => void;
      },
    ): Promise<string> => {
      const selectedModelId = await modelSettings.getSelectedModelId();
      if (!selectedModelId) {
        throw new Error("No model selected");
      }
      if (isGenerating) {
        throw new Error("Already generating");
      }

      setIsGenerating(true);
      const result = await sendLLMModelMessage(
        selectedModelId,
        messages,
        options
          ? {
              responseCallback: options.responseCallback,
              completeCallback: options.completeCallback,
            }
          : undefined,
      );
      // Singleton is mutated in place, no need to reassign
      setIsGenerating(false);

      try {
        // Handle pending save
        const pendingSave = pendingSaveRef.current;
        if (pendingSave) {
          const { entryId, existingBlocks, updateEntry, onComplete, onError } =
            pendingSave;
          const cleanResponse = stripThinkTags(result);

          const filteredBlocks = existingBlocks.filter((b) => {
            if (b.role === "assistant" && b.type === "markdown") {
              return b.content && b.content.trim().length > 0;
            }
            return true;
          });

          const updatedBlocks: Block[] = [
            ...filteredBlocks,
            { type: "markdown", content: cleanResponse, role: "assistant" },
          ];

          updateEntry
            .mutateAsync({ id: entryId, input: { blocks: updatedBlocks } })
            .then(() => onComplete?.(cleanResponse))
            .catch((err) => {
              console.error("[LLMProvider] Failed to save response:", err);
              onError?.(err instanceof Error ? err.message : "Failed to save");
            })
            .finally(() => {
              pendingSaveRef.current = null;
            });
        }

        return result;
      } catch (err) {
        setIsGenerating(false);
        throw err;
      }
    },
    [isGenerating],
  );

  const interrupt = useCallback(() => {
    modelLibrarySingleton.llm?.module.interrupt();
  }, []);

  const contextValue = useMemo<LLMContextValue>(
    () => ({
      isGenerating,
      sendMessage,
      interrupt,
      registerPendingSave,
      clearPendingSave,
    }),
    [
      isGenerating,
      sendMessage,
      interrupt,
      registerPendingSave,
      clearPendingSave,
    ],
  );

  return (
    <LLMContext.Provider value={contextValue}>{children}</LLMContext.Provider>
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
