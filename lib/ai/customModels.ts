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

// =============================================================================
// PROVIDER PRESETS
// =============================================================================

export type ProviderId = "openai" | "anthropic" | "groq" | "custom";

export interface ProviderPreset {
  providerId: ProviderId;
  displayName: string;
  baseUrl: string;
  description: string;
  models: ProviderModelPreset[];
  /** Whether to use x-api-key header instead of Bearer auth */
  usesApiKeyHeader?: boolean;
  /** Custom headers required by this provider */
  defaultHeaders?: Record<string, string>;
}

export interface ProviderModelPreset {
  modelName: string;
  displayName: string;
  description: string;
  maxTokens?: number;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    providerId: "openai",
    displayName: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    description: "GPT-4o, GPT-4 Turbo, and more",
    models: [
      {
        modelName: "gpt-4o",
        displayName: "GPT-4o",
        description: "Most capable, multimodal",
        maxTokens: 4096,
      },
      {
        modelName: "gpt-4-turbo",
        displayName: "GPT-4 Turbo",
        description: "Fast and capable",
        maxTokens: 4096,
      },
      {
        modelName: "gpt-3.5-turbo",
        displayName: "GPT-3.5 Turbo",
        description: "Fast and affordable",
        maxTokens: 4096,
      },
    ],
  },
  {
    providerId: "anthropic",
    displayName: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    description: "Claude 3.5 Sonnet, Claude 3 Opus, and more",
    usesApiKeyHeader: true,
    defaultHeaders: {
      "anthropic-version": "2023-06-01",
    },
    models: [
      {
        modelName: "claude-sonnet-4-20250514",
        displayName: "Claude Sonnet 4",
        description: "Best balance of speed and intelligence",
        maxTokens: 8192,
      },
      {
        modelName: "claude-3-5-sonnet-20241022",
        displayName: "Claude 3.5 Sonnet",
        description: "Fast and highly capable",
        maxTokens: 8192,
      },
      {
        modelName: "claude-3-haiku-20240307",
        displayName: "Claude 3 Haiku",
        description: "Fastest, most affordable",
        maxTokens: 4096,
      },
    ],
  },
  {
    providerId: "groq",
    displayName: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    description: "Ultra-fast inference with Llama and Mixtral",
    models: [
      {
        modelName: "llama-3.3-70b-versatile",
        displayName: "Llama 3.3 70B",
        description: "High quality, very fast",
        maxTokens: 8192,
      },
      {
        modelName: "llama-3.1-8b-instant",
        displayName: "Llama 3.1 8B",
        description: "Ultra-fast responses",
        maxTokens: 8192,
      },
      {
        modelName: "mixtral-8x7b-32768",
        displayName: "Mixtral 8x7B",
        description: "Large context, fast inference",
        maxTokens: 32768,
      },
    ],
  },
  {
    providerId: "custom",
    displayName: "Custom Server",
    baseUrl: "",
    description: "Self-hosted (Ollama, vLLM, etc.)",
    models: [],
  },
];

/**
 * Get a provider preset by ID
 */
export function getProviderPreset(
  providerId: ProviderId,
): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.providerId === providerId);
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
  displayName: string;
  description?: string;
  /** Source HuggingFace URL for reference */
  huggingFaceUrl?: string;
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
  displayName: string;
  description: string | null;
  // Custom local model fields
  huggingFaceUrl: string | null;
  folderName: string | null;
  pteFileName: string | null;
  tokenizerFileName: string | null;
  tokenizerConfigFileName: string | null;
  modelSize: string | null;
  quantization: string | null;
  ramRequired: string | null;
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
  huggingFaceUrl?: string;
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
  providerId: ProviderId;
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
  // Remote model specific
  maxTokens?: number;
  temperature?: number;
  customHeaders?: Record<string, string>;
}
