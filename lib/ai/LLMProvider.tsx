/**
 * LLMProvider - Keeps a single LLM instance mounted at the app level
 *
 * Uses LLMModule directly (instead of useLLM hook) for explicit control over
 * model loading and unloading to prevent OOM when switching models.
 *
 * This provider only handles LLM operations. Persistence is handled by the
 * consuming components via the onResponseComplete callback.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import { LLMModule, Message } from "react-native-executorch";
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

interface LLMContextValue {
  isGenerating: boolean;
  sendMessage: (
    messages: Message[],
    options?: {
      responseCallback?: (responseSoFar: string) => void;
      completeCallback?: (results: string) => void;
    },
  ) => Promise<string>;
  interrupt: () => void;
}

const LLMContext = createContext<LLMContextValue | null>(null);

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
      try {
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
        return result;
      } finally {
        setIsGenerating(false);
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
    }),
    [isGenerating, sendMessage, interrupt],
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
