/**
 * Context Manager - Handles context window limits for small local LLMs
 *
 * Small models (0.6B-4B) have limited context windows (typically 2048-4096 tokens).
 * This module provides:
 * 1. Token estimation (heuristic-based, no tokenizer needed)
 * 2. Context truncation to fit within model limits
 *
 * Used by LLMProvider to prepare messages before generation.
 */

import { Message as LlmMessage } from "react-native-executorch";

// Context limits by model size (conservative estimates with headroom for response)
// These are tokens available for input context (reserving ~512 for response)
const CONTEXT_LIMITS: Record<string, number> = {
  // Qwen models
  "qwen-3-0.6b": 1500, // 2048 context, reserve 500 for response
  "qwen-3-1.7b": 1500,
  "qwen-3-4b": 3500, // Larger model, more context

  // Llama models
  "llama-3.2-1b-instruct": 1500,
  "llama-3.2-3b-instruct": 3500,
};

const DEFAULT_CONTEXT_LIMIT = 1500;

/**
 * Estimate token count for a string
 * Heuristic: ~3.5 characters per token for English text
 * This is approximate but sufficient for context management
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/**
 * Estimate total tokens for a message array
 */
function estimateMessagesTokens(messages: LlmMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    // Add overhead for role tokens and message formatting (~4 tokens per message)
    total += estimateTokens(msg.content) + 4;
  }
  return total;
}

/**
 * Get context limit for a model
 */
function getContextLimit(modelId: string): number {
  return CONTEXT_LIMITS[modelId] || DEFAULT_CONTEXT_LIMIT;
}

/**
 * Check if messages fit within context limit
 */
export function fitsInContext(
  messages: LlmMessage[],
  modelId: string
): boolean {
  const limit = getContextLimit(modelId);
  const tokens = estimateMessagesTokens(messages);
  return tokens < limit;
}

/**
 * Truncate context to fit within model limits
 *
 * Strategy: Keep the most recent messages that fit within the limit.
 * System prompt is always preserved at the start.
 */
export function truncateContext(
  messages: LlmMessage[],
  modelId: string
): LlmMessage[] {
  const limit = getContextLimit(modelId);

  // Separate system prompt
  const systemMessage = messages.find((m) => m.role === "system");
  const conversationMessages = messages.filter((m) => m.role !== "system");

  // Start with recent messages and work backwards
  const result: LlmMessage[] = [];
  let tokenCount = systemMessage ? estimateMessagesTokens([systemMessage]) : 0;

  // Add messages from most recent to oldest until we hit limit
  for (let i = conversationMessages.length - 1; i >= 0; i--) {
    const msg = conversationMessages[i];
    const msgTokens = estimateTokens(msg.content) + 4;

    if (tokenCount + msgTokens > limit) {
      break;
    }

    result.unshift(msg);
    tokenCount += msgTokens;
  }

  // Add system message at the start
  if (systemMessage) {
    result.unshift(systemMessage);
  }

  return result;
}
