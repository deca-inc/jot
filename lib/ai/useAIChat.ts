/**
 * useAIChat - Simple hook for AI chat
 *
 * Uses the shared LLM from LLMProvider (which stays mounted at app level).
 * Handles message history and callbacks for a single conversation.
 *
 * Key feature: Can auto-save responses to the database even if the component
 * unmounts during generation (e.g., user navigates away).
 */

import { useCallback, useRef, useEffect } from "react";
import { Message } from "react-native-executorch";
import { Block } from "../db/entries";
import { useUpdateEntry } from "../db/useEntries";
import { useLLMContext } from "./LLMProvider";

export interface UseAIChatOptions {
  /** Entry ID to save responses to (enables auto-save even if component unmounts) */
  entryId?: number;
  /** Current blocks in the entry (used for auto-save) */
  currentBlocks?: Block[];
  /** Callback when response is complete (called after auto-save if enabled) */
  onResponseComplete?: (response: string) => void;
  /** Callback on error */
  onError?: (error: string) => void;
}

/**
 * Strip think tags from response (Qwen models use these for reasoning)
 */
function stripThinkTags(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/<\/?think>/g, "")
    .trim();
}

export function useAIChat(options: UseAIChatOptions = {}) {
  const { entryId, currentBlocks, onResponseComplete, onError } = options;

  // Get shared LLM from context
  const llm = useLLMContext();

  // Get update mutation for saving responses
  const updateEntry = useUpdateEntry();
  const updateEntryRef = useRef(updateEntry);
  updateEntryRef.current = updateEntry;

  // Track message history for this conversation
  const messageHistoryRef = useRef<Message[]>([]);

  // Track options with refs to avoid stale closures
  const entryIdRef = useRef(entryId);
  entryIdRef.current = entryId;
  const currentBlocksRef = useRef(currentBlocks);
  currentBlocksRef.current = currentBlocks;
  const onResponseCompleteRef = useRef(onResponseComplete);
  onResponseCompleteRef.current = onResponseComplete;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // Register pending save whenever entryId and blocks change during generation
  useEffect(() => {
    if (llm.isGenerating && entryId && currentBlocks) {
      llm.registerPendingSave({
        entryId,
        existingBlocks: currentBlocks,
        updateEntry: updateEntryRef.current,
        onComplete: onResponseCompleteRef.current,
        onError: onErrorRef.current,
      });
    }
  }, [llm.isGenerating, entryId, currentBlocks]);

  /**
   * Send a message and generate a response
   */
  const sendMessage = useCallback(
    async (userMessage: string): Promise<Message[]> => {
      if (!userMessage.trim() || llm.isGenerating) {
        return messageHistoryRef.current;
      }

      // Note: We don't check llm.isReady here - the provider's sendMessage
      // will trigger lazy loading and wait for the model to be ready

      let cleanedUserMessage = userMessage.trim();
      if (cleanedUserMessage.indexOf("/think") !== 0) {
        cleanedUserMessage = `/no_think ${cleanedUserMessage}`;
      }

      // Add user message to history
      const userMsg: Message = { role: "user", content: cleanedUserMessage };
      messageHistoryRef.current = [...messageHistoryRef.current, userMsg];

      try {
        // Send all messages (LLMProvider handles system prompt and context limits)
        const response = await llm.sendMessage(messageHistoryRef.current);
        const cleanResponse = stripThinkTags(response);

        // Clear pending save since component is still mounted and handling it
        llm.clearPendingSave();

        // Add assistant response to history
        messageHistoryRef.current = [
          ...messageHistoryRef.current,
          { role: "assistant", content: cleanResponse },
        ];

        onResponseCompleteRef.current?.(cleanResponse);
        return messageHistoryRef.current;
      } catch (err) {
        console.error("[useAIChat] Generation failed:", err);
        llm.clearPendingSave();
        onErrorRef.current?.(
          err instanceof Error ? err.message : "Generation failed",
        );
        return messageHistoryRef.current;
      }
    },
    [llm],
  );

  /**
   * Set the message history (for loading existing conversations)
   */
  const setMessageHistory = useCallback((messages: Message[]) => {
    messageHistoryRef.current = messages.filter((m) => m.role !== "system");
  }, []);

  /**
   * Clear message history
   */
  const clearHistory = useCallback(() => {
    messageHistoryRef.current = [];
  }, []);

  /**
   * Stop current generation
   */
  const stop = useCallback(() => {
    llm.interrupt();
  }, [llm]);

  return {
    // State from shared LLM
    isReady: llm.isReady,
    isGenerating: llm.isGenerating,
    isLoading: llm.isLoading,
    error: llm.error,

    // Current response (raw for streaming display)
    response: llm.response,
    rawResponse: llm.rawResponse,

    // Message history for this conversation
    messageHistory: messageHistoryRef.current,

    // Model info
    modelConfig: llm.modelConfig,

    // Actions
    sendMessage,
    setMessageHistory,
    clearHistory,
    stop,
  };
}
