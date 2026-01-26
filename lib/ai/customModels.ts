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
// API STYLES
// =============================================================================

/**
 * API style determines authentication and request format:
 * - "openai-compatible": Bearer auth, /chat/completions endpoint (OpenAI, Groq, Ollama, vLLM, etc.)
 * - "anthropic": x-api-key auth, /messages endpoint, anthropic-version header
 */
export type ApiStyle = "openai-compatible" | "anthropic";

// Keep ProviderId as alias for backwards compatibility with database
export type ProviderId = ApiStyle;

export interface ApiStyleConfig {
  id: ApiStyle;
  displayName: string;
  description: string;
  defaultBaseUrl: string;
  /** Header name for API key */
  authHeader: string;
  /** Auth header format - "bearer" for "Bearer <key>", "raw" for just "<key>" */
  authFormat: "bearer" | "raw";
  /** Additional default headers */
  defaultHeaders?: Record<string, string>;
}

export const API_STYLES: ApiStyleConfig[] = [
  {
    id: "openai-compatible",
    displayName: "OpenAI-Compatible",
    description: "Works with OpenAI, Groq, Ollama, vLLM, and most providers",
    defaultBaseUrl: "https://api.openai.com/v1",
    authHeader: "Authorization",
    authFormat: "bearer",
  },
  {
    id: "anthropic",
    displayName: "Anthropic",
    description: "For Claude models via Anthropic's API",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    authHeader: "x-api-key",
    authFormat: "raw",
    defaultHeaders: {
      "anthropic-version": "2023-06-01",
    },
  },
];

/**
 * Get API style config by ID
 */
export function getApiStyleConfig(
  apiStyle: ApiStyle,
): ApiStyleConfig | undefined {
  return API_STYLES.find((s) => s.id === apiStyle);
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
  maxTokens?: number;
  temperature?: number;
  customHeaders?: Record<string, string>;
}
