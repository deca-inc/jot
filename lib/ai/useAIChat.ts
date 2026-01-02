/**
 * useAIChat - Simple hook for AI chat
 *
 * Uses the shared LLM from LLMProvider (which stays mounted at app level).
 * Handles message history and callbacks for a single conversation.
 *
 * Persistence is handled by the consuming component via onResponseComplete.
 */

import { useCallback, useRef } from "react";
import { Message } from "react-native-executorch";
import { useLLMContext } from "./LLMProvider";

export interface UseAIChatOptions {
  /** Callback while response is generating */
  onResponseUpdate?: (response: string) => void;
  /** Callback when response is complete */
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
  const { onResponseUpdate, onResponseComplete, onError } = options;

  // Get shared LLM from context
  const llm = useLLMContext();

  // Track message history for this conversation
  const messageHistoryRef = useRef<Message[]>([]);

  // Track options with refs to avoid stale closures
  const onResponseUpdateRef = useRef(onResponseUpdate);
  onResponseUpdateRef.current = onResponseUpdate;
  const onResponseCompleteRef = useRef(onResponseComplete);
  onResponseCompleteRef.current = onResponseComplete;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

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
        const response = await llm.sendMessage(
          messageHistoryRef.current,
          onResponseUpdateRef.current
            ? { responseCallback: onResponseUpdateRef.current }
            : undefined,
        );
        const cleanResponse = stripThinkTags(response);

        // Add assistant response to history
        messageHistoryRef.current = [
          ...messageHistoryRef.current,
          { role: "assistant", content: cleanResponse },
        ];

        onResponseCompleteRef.current?.(cleanResponse);
        return messageHistoryRef.current;
      } catch (err) {
        console.error("[useAIChat] Generation failed:", err);
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
    isGenerating: llm.isGenerating,

    // Message history for this conversation
    messageHistory: messageHistoryRef.current,

    // Actions
    sendMessage,
    setMessageHistory,
    clearHistory,
    stop,
  };
}
