/**
 * Custom & Remote Models Type Definitions
 *
 * Defines types for:
 * - Custom local models (user-added ExecuTorch .pte files from HuggingFace)
 * - Remote API models (OpenAI, Anthropic, Groq, custom servers)
 * - Provider presets for easy remote model setup
 */

// =============================================================================
// MODEL TYPE DISCRIMINATORS
// =============================================================================

export type CustomModelType = "custom-local" | "remote-api";

/** Model category - LLM for chat models, STT for speech-to-text */
export type ModelCategory = "llm" | "stt";

// =============================================================================
// PROVIDER CONFIGURATION
// =============================================================================

/**
 * Provider ID for remote API models.
 * Detected automatically from URL or falls back to "openai-compatible".
 */
export type ProviderId =
  | "openai"
  | "anthropic"
  | "groq"
  | "deepgram"
  | "google"
  | "openai-compatible"; // Fallback for unknown providers

/** @deprecated Use ProviderId instead */
export type ApiStyle = ProviderId;

export interface ProviderConfig {
  id: ProviderId;
  displayName: string;
  /** URL patterns to match (checked with includes()) */
  urlPatterns: string[];
  /** Header name for API key */
  authHeader: string;
  /** Auth header format - "bearer" for "Bearer <key>", "raw" for just "<key>", "token" for "Token <key>" */
  authFormat: "bearer" | "raw" | "token";
  /** Additional default headers */
  defaultHeaders?: Record<string, string>;
  /** Default base URL for this provider */
  defaultBaseUrl?: string;
  /** Placeholder for model name input */
  modelPlaceholder?: string;
  /** Placeholder for API key input */
  apiKeyPlaceholder?: string;
}

/**
 * Known provider configurations.
 * Order matters - first match wins.
 */
export const PROVIDER_CONFIGS: ProviderConfig[] = [
  {
    id: "openai",
    displayName: "OpenAI",
    urlPatterns: ["openai.com"],
    authHeader: "Authorization",
    authFormat: "bearer",
    defaultBaseUrl: "https://api.openai.com/v1",
    modelPlaceholder: "gpt-4o, whisper-1",
    apiKeyPlaceholder: "sk-...",
  },
  {
    id: "anthropic",
    displayName: "Anthropic",
    urlPatterns: ["anthropic.com"],
    authHeader: "x-api-key",
    authFormat: "raw",
    defaultHeaders: {
      "anthropic-version": "2023-06-01",
    },
    defaultBaseUrl: "https://api.anthropic.com/v1",
    modelPlaceholder: "claude-sonnet-4-20250514",
    apiKeyPlaceholder: "sk-ant-...",
  },
  {
    id: "groq",
    displayName: "Groq",
    urlPatterns: ["groq.com"],
    authHeader: "Authorization",
    authFormat: "bearer",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    modelPlaceholder: "llama-3.3-70b-versatile, whisper-large-v3",
    apiKeyPlaceholder: "gsk_...",
  },
  {
    id: "deepgram",
    displayName: "Deepgram",
    urlPatterns: ["deepgram.com"],
    authHeader: "Authorization",
    authFormat: "token",
    defaultBaseUrl: "https://api.deepgram.com/v1",
    modelPlaceholder: "nova-2",
    apiKeyPlaceholder: "your-deepgram-key",
  },
  {
    id: "google",
    displayName: "Google AI",
    urlPatterns: ["googleapis.com", "generativelanguage.googleapis.com"],
    authHeader: "Authorization",
    authFormat: "bearer",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    modelPlaceholder: "gemini-1.5-pro",
    apiKeyPlaceholder: "your-google-api-key",
  },
  {
    id: "openai-compatible",
    displayName: "OpenAI-Compatible",
    urlPatterns: [], // Fallback - matches nothing, used when no other provider matches
    authHeader: "Authorization",
    authFormat: "bearer",
    modelPlaceholder: "model-name",
    apiKeyPlaceholder: "your-api-key",
  },
];

/**
 * Detect provider from a base URL.
 * Returns the matching provider config or the openai-compatible fallback.
 *
 * Supports both HTTP and WebSocket URLs:
 * - https://api.deepgram.com/v1 → deepgram
 * - wss://api.deepgram.com/v1/listen → deepgram
 */
export function detectProviderFromUrl(baseUrl: string): ProviderConfig {
  if (!baseUrl) {
    return PROVIDER_CONFIGS.find((p) => p.id === "openai-compatible")!;
  }

  const lowerUrl = baseUrl.toLowerCase();

  for (const provider of PROVIDER_CONFIGS) {
    if (provider.urlPatterns.some((pattern) => lowerUrl.includes(pattern))) {
      return provider;
    }
  }

  // Fallback to openai-compatible
  return PROVIDER_CONFIGS.find((p) => p.id === "openai-compatible")!;
}

/**
 * Check if a URL is a WebSocket URL (wss:// or ws://).
 * WebSocket URLs imply real-time streaming mode for STT.
 */
export function isWebSocketUrl(url: string): boolean {
  if (!url) return false;
  const lowerUrl = url.toLowerCase().trim();
  return lowerUrl.startsWith("wss://") || lowerUrl.startsWith("ws://");
}

/**
 * Get provider config by ID.
 */
export function getProviderConfig(providerId: ProviderId): ProviderConfig {
  return (
    PROVIDER_CONFIGS.find((p) => p.id === providerId) ||
    PROVIDER_CONFIGS.find((p) => p.id === "openai-compatible")!
  );
}

/**
 * Format the authorization header value based on provider config.
 */
export function formatAuthHeader(
  config: ProviderConfig,
  apiKey: string,
): string {
  switch (config.authFormat) {
    case "bearer":
      return `Bearer ${apiKey}`;
    case "token":
      return `Token ${apiKey}`;
    case "raw":
      return apiKey;
  }
}

// Legacy exports for backwards compatibility
/** @deprecated Use PROVIDER_CONFIGS instead */
export const API_STYLES = PROVIDER_CONFIGS.filter(
  (p) => p.id === "openai-compatible" || p.id === "anthropic",
).map((p) => ({
  id: p.id as ApiStyle,
  displayName: p.displayName,
  description: `${p.displayName} API`,
  defaultBaseUrl: p.defaultBaseUrl || "",
  authHeader: p.authHeader,
  authFormat: p.authFormat === "token" ? ("bearer" as const) : p.authFormat,
  defaultHeaders: p.defaultHeaders,
}));

/** @deprecated Use ProviderConfig instead */
export interface ApiStyleConfig {
  id: ApiStyle;
  displayName: string;
  description: string;
  defaultBaseUrl: string;
  authHeader: string;
  authFormat: "bearer" | "raw";
  defaultHeaders?: Record<string, string>;
}

/** @deprecated Use getProviderConfig instead */
export function getApiStyleConfig(
  apiStyle: ApiStyle,
): ApiStyleConfig | undefined {
  const config = getProviderConfig(apiStyle as ProviderId);
  return {
    id: config.id as ApiStyle,
    displayName: config.displayName,
    description: `${config.displayName} API`,
    defaultBaseUrl: config.defaultBaseUrl || "",
    authHeader: config.authHeader,
    authFormat: config.authFormat === "token" ? "bearer" : config.authFormat,
    defaultHeaders: config.defaultHeaders,
  };
}

// =============================================================================
// CUSTOM LOCAL MODEL CONFIG
// =============================================================================

/**
 * Configuration for a user-added local ExecuTorch (.pte) model
 * These models run on-device and require downloading from HuggingFace
 */
export interface CustomLocalModelConfig {
  /** Unique identifier, e.g., 'custom-mistral-7b' */
  modelId: string;
  modelType: "custom-local";
  /** Model category: 'llm' for chat models, 'stt' for speech-to-text */
  modelCategory: ModelCategory;
  displayName: string;
  description?: string;
  /** Source HuggingFace URL for the .pte model file */
  huggingFaceUrl?: string;
  /** Full URL to tokenizer.json */
  tokenizerUrl?: string;
  /** Full URL to tokenizer_config.json */
  tokenizerConfigUrl?: string;
  /** Storage folder name under app's model directory */
  folderName: string;
  /** Main model file name */
  pteFileName: string;
  tokenizerFileName?: string;
  tokenizerConfigFileName?: string;
  /** Model size for display, e.g., "7B", "13B" */
  modelSize?: string;
  /** Quantization format, e.g., "8-bit", "4-bit" */
  quantization?: string;
  /** RAM required for inference, e.g., "8GB" */
  ramRequired?: string;
  isEnabled: boolean;
  /** Whether the model files have been downloaded */
  isDownloaded: boolean;
}

// =============================================================================
// REMOTE API MODEL CONFIG
// =============================================================================

/**
 * Configuration for a remote API model (OpenAI, Anthropic, Groq, or custom)
 * These models send data to external servers
 */
export interface RemoteModelConfig {
  /** Unique identifier, e.g., 'remote-openai-gpt-4' */
  modelId: string;
  modelType: "remote-api";
  /** Model category: 'llm' for chat models, 'stt' for speech-to-text */
  modelCategory: ModelCategory;
  displayName: string;
  description?: string;
  /** Provider identifier for fetching presets */
  providerId: ProviderId;
  /** API endpoint (e.g., https://api.openai.com/v1) */
  baseUrl: string;
  /** Model name to send in API requests */
  modelName: string;
  /** Reference to keychain item storing the API key */
  apiKeyRef: string;
  /** Additional headers for API requests (JSON) */
  customHeaders?: Record<string, string>;
  /** Max tokens for generation */
  maxTokens?: number;
  /** Temperature for generation (0-2) */
  temperature?: number;
  isEnabled: boolean;
  /** Whether user has acknowledged privacy implications */
  privacyAcknowledged: boolean;
}

// =============================================================================
// UNIFIED TYPE
// =============================================================================

export type CustomModelConfig = CustomLocalModelConfig | RemoteModelConfig;

// =============================================================================
// TYPE GUARDS
// =============================================================================

export function isCustomLocalModel(
  config: CustomModelConfig,
): config is CustomLocalModelConfig {
  return config.modelType === "custom-local";
}

export function isRemoteModel(
  config: CustomModelConfig,
): config is RemoteModelConfig {
  return config.modelType === "remote-api";
}

// =============================================================================
// DATABASE ROW TYPE
// =============================================================================

/**
 * Raw database row type for custom_models table
 * Used internally by the repository
 */
export interface CustomModelRow {
  id: number;
  modelId: string;
  modelType: string;
  modelCategory: string;
  displayName: string;
  description: string | null;
  // Custom local model fields
  huggingFaceUrl: string | null;
  tokenizerUrl: string | null;
  tokenizerConfigUrl: string | null;
  folderName: string | null;
  pteFileName: string | null;
  tokenizerFileName: string | null;
  tokenizerConfigFileName: string | null;
  modelSize: string | null;
  quantization: string | null;
  ramRequired: string | null;
  isDownloaded: number;
  // Remote API model fields
  providerId: string | null;
  baseUrl: string | null;
  modelName: string | null;
  apiKeyRef: string | null;
  customHeaders: string | null;
  maxTokens: number | null;
  temperature: number | null;
  // Common fields
  isEnabled: number;
  privacyAcknowledged: number;
  createdAt: number;
  updatedAt: number;
}

// =============================================================================
// INPUT TYPES FOR CRUD OPERATIONS
// =============================================================================

export interface CreateCustomLocalModelInput {
  displayName: string;
  description?: string;
  /** Model category: 'llm' for chat models, 'stt' for speech-to-text. Defaults to 'llm' */
  modelCategory?: ModelCategory;
  /** Full URL to the .pte model file */
  huggingFaceUrl?: string;
  /** Full URL to tokenizer.json */
  tokenizerUrl?: string;
  /** Full URL to tokenizer_config.json */
  tokenizerConfigUrl?: string;
  folderName: string;
  pteFileName: string;
  tokenizerFileName?: string;
  tokenizerConfigFileName?: string;
  modelSize?: string;
  quantization?: string;
  ramRequired?: string;
}

export interface CreateRemoteModelInput {
  displayName: string;
  description?: string;
  /** Model category: 'llm' for chat models, 'stt' for speech-to-text. Defaults to 'llm' */
  modelCategory?: ModelCategory;
  /** API style determines auth format and endpoints */
  providerId: ApiStyle;
  baseUrl: string;
  modelName: string;
  customHeaders?: Record<string, string>;
  maxTokens?: number;
  temperature?: number;
}

export interface UpdateCustomModelInput {
  displayName?: string;
  description?: string;
  isEnabled?: boolean;
  privacyAcknowledged?: boolean;
  // Custom local model specific
  huggingFaceUrl?: string;
  tokenizerUrl?: string | null;
  tokenizerConfigUrl?: string | null;
  tokenizerFileName?: string | null;
  tokenizerConfigFileName?: string | null;
  isDownloaded?: boolean;
  // Remote model specific
  /** API base URL (e.g., https://api.openai.com/v1) */
  baseUrl?: string;
  /** Model name sent to API (e.g., gpt-4o, whisper-1) */
  modelName?: string;
  maxTokens?: number;
  temperature?: number;
  customHeaders?: Record<string, string>;
}
