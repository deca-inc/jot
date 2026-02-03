/**
 * Real-Time STT Provider Detection and Configuration
 *
 * Provides utilities for detecting and configuring real-time speech-to-text
 * providers that support WebSocket streaming (Deepgram, OpenAI Realtime).
 */

// =============================================================================
// TYPES
// =============================================================================

export type RealTimeProvider = "deepgram" | "openai-realtime";

export interface RealTimeConfigOptions {
  /** User-provided base URL. If a WebSocket URL, used directly. */
  baseUrl?: string;
  /** Language code (e.g., "en", "fr") */
  language?: string;
  /** Model name override */
  modelName?: string;
}

export interface RealTimeConfig {
  /** WebSocket URL for connection */
  wsUrl: string;
  /** Headers to include in WebSocket connection (may not work in all environments) */
  headers: Record<string, string>;
  /** Auth token for URL-based or message-based authentication */
  authToken?: string;
  /** Model name to use (for providers that need it in messages) */
  modelName?: string;
  /** Provider type for message parsing */
  provider: RealTimeProvider;
}

// =============================================================================
// PROVIDER DETECTION
// =============================================================================

/**
 * Check if a URL is a WebSocket URL (wss:// or ws://).
 */
export function isWebSocketUrl(url: string): boolean {
  if (!url) return false;
  const lowerUrl = url.toLowerCase().trim();
  return lowerUrl.startsWith("wss://") || lowerUrl.startsWith("ws://");
}

/**
 * Detect the real-time provider from a base URL.
 * Returns the provider type if it supports real-time streaming, null otherwise.
 *
 * Supports both HTTP and WebSocket URLs:
 * - https://api.deepgram.com/v1 → deepgram
 * - wss://api.deepgram.com/v1/listen → deepgram
 *
 * Note: Only Deepgram truly supports real-time streaming with interim results.
 * OpenAI Realtime API only returns transcription after audio is committed,
 * so it's not included here - use batch mode for OpenAI STT instead.
 */
export function detectRealTimeProvider(
  baseUrl: string,
): RealTimeProvider | null {
  if (!baseUrl) {
    return null;
  }

  const lowerUrl = baseUrl.toLowerCase();

  // Deepgram: api.deepgram.com or *.deepgram.com
  // Only Deepgram supports true real-time streaming with interim results
  if (lowerUrl.includes("deepgram.com")) {
    return "deepgram";
  }

  // OpenAI Realtime doesn't provide interim results, so we don't include it here.
  // Users should use batch mode (non-realtime) for OpenAI Whisper API.

  return null;
}

/**
 * Check if a base URL supports real-time streaming.
 * Returns true for providers that support real-time OR if a WebSocket URL is provided.
 */
export function supportsRealTime(baseUrl: string): boolean {
  // If it's a WebSocket URL, real-time is implied
  if (isWebSocketUrl(baseUrl)) {
    return true;
  }
  return detectRealTimeProvider(baseUrl) !== null;
}

// =============================================================================
// PROVIDER CONFIGURATION
// =============================================================================

/**
 * Get the WebSocket configuration for a real-time provider.
 *
 * @param provider - The real-time provider type
 * @param apiKey - The API key for authentication
 * @param options - Configuration options
 * @returns WebSocket URL and headers for connection
 */
export function getRealTimeConfig(
  provider: RealTimeProvider,
  apiKey: string,
  options: RealTimeConfigOptions,
): RealTimeConfig {
  switch (provider) {
    case "deepgram":
      return getDeepgramConfig(apiKey, options);
    case "openai-realtime":
      return getOpenAIRealtimeConfig(apiKey, options);
    default:
      throw new Error(`Unknown real-time provider: ${provider}`);
  }
}

// =============================================================================
// DEEPGRAM CONFIGURATION
// =============================================================================

/**
 * Deepgram WebSocket API configuration.
 * Docs: https://developers.deepgram.com/docs/getting-started-with-live-streaming-audio
 *
 * Uses the user's WebSocket URL if provided, but ensures required audio encoding
 * parameters are present for the audio to be parsed correctly.
 *
 * Note: We pass the token in the URL because browser/RN WebSocket doesn't
 * reliably support custom headers. Deepgram accepts both header and URL auth.
 */
function getDeepgramConfig(
  apiKey: string,
  options: RealTimeConfigOptions,
): RealTimeConfig {
  let wsUrl: string;

  // Required parameters for our audio format (16kHz mono 16-bit PCM)
  const requiredParams: Record<string, string> = {
    encoding: "linear16",
    sample_rate: "16000",
    channels: "1",
    interim_results: "true",
  };

  // If user provided a WebSocket URL, use it as base and add missing params
  if (options.baseUrl && isWebSocketUrl(options.baseUrl)) {
    const url = new URL(options.baseUrl);

    // Add required params if not already present
    for (const [key, value] of Object.entries(requiredParams)) {
      if (!url.searchParams.has(key)) {
        url.searchParams.set(key, value);
      }
    }

    // Add model if specified and not in URL
    if (options.modelName && !url.searchParams.has("model")) {
      url.searchParams.set("model", options.modelName);
    }

    // Add language if specified and not in URL
    if (options.language && !url.searchParams.has("language")) {
      url.searchParams.set("language", options.language);
    }

    wsUrl = url.toString();
  } else {
    // Construct default Deepgram URL with all params
    const params = new URLSearchParams({
      model: options.modelName || "nova-2",
      punctuate: "true",
      endpointing: "300", // 300ms of silence before finalizing
      ...requiredParams,
    });

    if (options.language) {
      params.set("language", options.language);
    }

    wsUrl = `wss://api.deepgram.com/v1/listen?${params.toString()}`;
  }

  return {
    wsUrl,
    headers: {
      Authorization: `Token ${apiKey}`,
    },
    // Also include token for URL-based auth (more reliable in RN)
    authToken: apiKey,
    provider: "deepgram",
  };
}

// =============================================================================
// OPENAI REALTIME CONFIGURATION
// =============================================================================

/**
 * OpenAI Realtime API configuration.
 * Docs: https://platform.openai.com/docs/guides/realtime
 *
 * If user provides a WebSocket URL, use it directly.
 * Otherwise construct the default OpenAI Realtime URL.
 *
 * Note: OpenAI Realtime requires Bearer auth. In React Native, we can pass
 * headers via the WebSocket options. The model is specified in the URL.
 */
function getOpenAIRealtimeConfig(
  apiKey: string,
  options: RealTimeConfigOptions,
): RealTimeConfig {
  // gpt-realtime is the GA model (2025), gpt-4o-realtime-preview is the preview
  const model = options.modelName || "gpt-realtime";

  // If user provided a WebSocket URL, use it directly
  const wsUrl =
    options.baseUrl && isWebSocketUrl(options.baseUrl)
      ? options.baseUrl
      : `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`;

  return {
    wsUrl,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "OpenAI-Beta": "realtime=v1",
    },
    authToken: apiKey,
    modelName: model,
    provider: "openai-realtime",
  };
}
