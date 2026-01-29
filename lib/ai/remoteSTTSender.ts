/**
 * Remote STT Sender
 *
 * Helper module for sending audio to remote speech-to-text APIs.
 * Separates the remote STT logic from the hook for testability.
 */

import {
  createRemoteApiClient,
  RemoteApiError,
  type TranscriptionResult,
  type TranscriptionOptions,
} from "./remoteApiClient";
import type { RemoteModelConfig, ApiStyle } from "./customModels";

// =============================================================================
// TYPES
// =============================================================================

export interface RemoteSTTDependencies {
  /** Get model config by modelId */
  getModelConfig: (modelId: string) => Promise<RemoteModelConfig | null>;
  /** Get API key by keyRef */
  getApiKey: (keyRef: string) => Promise<string | null>;
}

export interface SendRemoteTranscriptionOptions {
  /** ISO 639-1 language code (e.g., "en", "fr") */
  language?: string;
  /** Response format */
  responseFormat?: TranscriptionOptions["responseFormat"];
  /** Optional prompt to guide transcription style */
  prompt?: string;
  /** AbortSignal for cancellation */
  abortSignal?: AbortSignal;
}

// =============================================================================
// ERROR CLASSES
// =============================================================================

export class RemoteSTTNotFoundError extends Error {
  constructor(modelId: string) {
    super(`Remote STT model not found: ${modelId}`);
    this.name = "RemoteSTTNotFoundError";
  }
}

export class RemoteSTTApiKeyMissingError extends Error {
  constructor(modelId: string) {
    super(`API key not found for remote STT model: ${modelId}`);
    this.name = "RemoteSTTApiKeyMissingError";
  }
}

export class RemoteSTTPrivacyNotAcknowledgedError extends Error {
  constructor(modelId: string) {
    super(`Privacy not acknowledged for remote STT model: ${modelId}`);
    this.name = "RemoteSTTPrivacyNotAcknowledgedError";
  }
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Send audio to a remote STT API for transcription.
 *
 * @param modelId - The remote STT model ID (e.g., "remote-openai-whisper")
 * @param audioData - Audio data as Uint8Array or base64 string
 * @param options - Optional settings for the request
 * @param dependencies - External dependencies (for testability)
 * @returns Transcription result with text
 */
export async function sendRemoteTranscription(
  modelId: string,
  audioData: Uint8Array | string,
  options: SendRemoteTranscriptionOptions | undefined,
  dependencies: RemoteSTTDependencies,
): Promise<TranscriptionResult> {
  // 1. Get model config from database
  const modelConfig = await dependencies.getModelConfig(modelId);
  if (!modelConfig) {
    throw new RemoteSTTNotFoundError(modelId);
  }

  // 2. Verify this is an STT model
  if (modelConfig.modelCategory !== "stt") {
    throw new RemoteSTTNotFoundError(modelId);
  }

  // 3. Check privacy acknowledgment
  if (!modelConfig.privacyAcknowledged) {
    throw new RemoteSTTPrivacyNotAcknowledgedError(modelId);
  }

  // 4. Get API key from secure storage (optional for self-hosted models)
  const apiKey = await dependencies.getApiKey(modelConfig.apiKeyRef);

  // 5. Create API client
  const client = createRemoteApiClient(
    modelConfig.providerId as ApiStyle,
    modelConfig.baseUrl,
    modelConfig.modelName,
    apiKey || "", // Empty string for self-hosted models without API key
    modelConfig.customHeaders,
  );

  // 6. Build transcription options
  const transcriptionOptions: TranscriptionOptions = {
    language: options?.language,
    responseFormat: options?.responseFormat,
    prompt: options?.prompt,
    abortSignal: options?.abortSignal,
  };

  // 7. Send audio for transcription
  return client.transcribeAudio(audioData, transcriptionOptions);
}

// Re-export error class from remoteApiClient for convenience
export { RemoteApiError };
