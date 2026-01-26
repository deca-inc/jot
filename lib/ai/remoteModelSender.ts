/**
 * Remote Model Sender
 *
 * Helper module for sending messages to remote API models.
 * Separates the remote model logic from UnifiedModelProvider for testability.
 */

import { createRemoteApiClient, RemoteApiError } from "./remoteApiClient";
import type { RemoteModelConfig, ApiStyle } from "./customModels";
import type { ChatMessage, StreamingOptions } from "./remoteApiClient";

// =============================================================================
// TYPES
// =============================================================================

export interface RemoteModelDependencies {
  /** Get model config by modelId */
  getModelConfig: (modelId: string) => Promise<RemoteModelConfig | null>;
  /** Get API key by keyRef */
  getApiKey: (keyRef: string) => Promise<string | null>;
}

export interface SendRemoteMessageOptions {
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  responseCallback?: (responseSoFar: string) => void;
  completeCallback?: (result: string) => void;
  abortSignal?: AbortSignal;
}

// =============================================================================
// ERROR CLASSES
// =============================================================================

export class RemoteModelNotFoundError extends Error {
  constructor(modelId: string) {
    super(`Remote model not found: ${modelId}`);
    this.name = "RemoteModelNotFoundError";
  }
}

export class RemoteModelApiKeyMissingError extends Error {
  constructor(modelId: string) {
    super(`API key not found for remote model: ${modelId}`);
    this.name = "RemoteModelApiKeyMissingError";
  }
}

export class RemoteModelPrivacyNotAcknowledgedError extends Error {
  constructor(modelId: string) {
    super(`Privacy not acknowledged for remote model: ${modelId}`);
    this.name = "RemoteModelPrivacyNotAcknowledgedError";
  }
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Send a message to a remote API model.
 *
 * @param modelId - The remote model ID (e.g., "remote-openai-gpt-4")
 * @param messages - The chat messages to send
 * @param options - Optional settings for the request
 * @param dependencies - External dependencies (for testability)
 * @returns The generated response
 */
export async function sendRemoteMessage(
  modelId: string,
  messages: ChatMessage[],
  options: SendRemoteMessageOptions | undefined,
  dependencies: RemoteModelDependencies,
): Promise<string> {
  // 1. Get model config from database
  const modelConfig = await dependencies.getModelConfig(modelId);
  if (!modelConfig) {
    throw new RemoteModelNotFoundError(modelId);
  }

  // 2. Check privacy acknowledgment
  if (!modelConfig.privacyAcknowledged) {
    throw new RemoteModelPrivacyNotAcknowledgedError(modelId);
  }

  // 3. Get API key from secure storage (optional for self-hosted models)
  const apiKey = await dependencies.getApiKey(modelConfig.apiKeyRef);

  // 4. Create API client
  const client = createRemoteApiClient(
    modelConfig.providerId as ApiStyle,
    modelConfig.baseUrl,
    modelConfig.modelName,
    apiKey || "", // Empty string for self-hosted models without API key
    modelConfig.customHeaders,
  );

  // 5. Determine streaming vs non-streaming
  const useStreaming = !!(
    options?.responseCallback || options?.completeCallback
  );

  // 6. Build streaming options
  const streamingOptions: StreamingOptions = {
    systemPrompt: options?.systemPrompt,
    maxTokens: options?.maxTokens ?? modelConfig.maxTokens,
    temperature: options?.temperature ?? modelConfig.temperature,
    responseCallback: options?.responseCallback,
    completeCallback: options?.completeCallback,
    abortSignal: options?.abortSignal,
  };

  // 7. Send message
  if (useStreaming) {
    return client.sendMessageStreaming(messages, streamingOptions);
  } else {
    return client.sendMessage(messages, {
      systemPrompt: options?.systemPrompt,
      maxTokens: options?.maxTokens ?? modelConfig.maxTokens,
      temperature: options?.temperature ?? modelConfig.temperature,
      abortSignal: options?.abortSignal,
    });
  }
}

// Re-export error class from remoteApiClient for convenience
export { RemoteApiError };
