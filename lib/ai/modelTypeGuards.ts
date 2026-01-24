/**
 * Model Type Guards with Zod Schemas
 *
 * Provides runtime validation and type guards for different model categories:
 * - Built-in LLM models: Defined in modelConfig.ts (e.g., "qwen-3-1.7b")
 * - Platform models: OS-native models (e.g., "gemini-nano", "apple-foundation")
 * - Remote API models: prefixed with "remote-" (e.g., "remote-openai-gpt-4")
 * - Custom local models: prefixed with "custom-" (e.g., "custom-mistral-7b")
 *
 * Uses Zod for runtime validation, useful for form validation.
 */

import { z } from "zod";

// =============================================================================
// MODEL ID PATTERNS
// =============================================================================

export const REMOTE_MODEL_PREFIX = "remote-";
export const CUSTOM_LOCAL_MODEL_PREFIX = "custom-";

// Built-in model IDs (from modelConfig.ts)
export const BUILT_IN_MODEL_IDS = [
  "smollm2-135m",
  "smollm2-360m",
  "smollm2-1.7b",
  "llama-3.2-1b-instruct",
  "llama-3.2-3b-instruct",
  "qwen-3-0.6b",
  "qwen-3-1.7b",
  "qwen-3-4b",
] as const;

// Platform model IDs
export const PLATFORM_MODEL_IDS = [
  "gemini-nano",
  "apple-foundation",
  "android-speech",
  "apple-speech",
] as const;

// =============================================================================
// ZOD SCHEMAS
// =============================================================================

/** Schema for built-in downloadable LLM model IDs */
export const BuiltInModelIdSchema = z.enum(BUILT_IN_MODEL_IDS);

/** Schema for platform model IDs */
export const PlatformModelIdSchema = z.enum(PLATFORM_MODEL_IDS);

/** Schema for remote API model IDs (starts with "remote-") */
export const RemoteModelIdSchema = z
  .string()
  .startsWith(REMOTE_MODEL_PREFIX)
  .describe("Remote API model ID (e.g., remote-openai-gpt-4)");

/** Schema for custom local model IDs (starts with "custom-") */
export const CustomLocalModelIdSchema = z
  .string()
  .startsWith(CUSTOM_LOCAL_MODEL_PREFIX)
  .describe("Custom local model ID (e.g., custom-mistral-7b)");

/** Schema for any valid model ID */
export const ModelIdSchema = z.union([
  BuiltInModelIdSchema,
  PlatformModelIdSchema,
  RemoteModelIdSchema,
  CustomLocalModelIdSchema,
]);

// =============================================================================
// MODEL CATEGORIES
// =============================================================================

export type ModelCategory =
  | "built-in" // Built-in downloadable LLM models
  | "platform" // OS-native platform models (Apple Foundation, Gemini Nano)
  | "remote" // Remote API models (OpenAI, Anthropic, etc.)
  | "custom-local" // User-added local ExecuTorch models
  | "unknown"; // Unrecognized model ID

export const ModelCategorySchema = z.enum([
  "built-in",
  "platform",
  "remote",
  "custom-local",
  "unknown",
]);

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 * Check if the modelId is a built-in downloadable LLM model.
 */
export function isBuiltInModelId(modelId: string): boolean {
  // Check built-in models first
  if (BuiltInModelIdSchema.safeParse(modelId).success) {
    return true;
  }

  // Also include platform models in "built-in" category for backward compatibility
  if (PlatformModelIdSchema.safeParse(modelId).success) {
    return true;
  }

  return false;
}

/**
 * Check if the modelId is a downloadable LLM model (not platform, not remote, not custom).
 */
export function isDownloadableModelId(modelId: string): boolean {
  return BuiltInModelIdSchema.safeParse(modelId).success;
}

/**
 * Check if the modelId is a remote API model.
 * Remote models have the "remote-" prefix.
 */
export function isRemoteModelId(modelId: string): boolean {
  return RemoteModelIdSchema.safeParse(modelId).success;
}

/**
 * Check if the modelId is a custom local model.
 * Custom local models have the "custom-" prefix.
 */
export function isCustomLocalModelId(modelId: string): boolean {
  return CustomLocalModelIdSchema.safeParse(modelId).success;
}

/**
 * Check if the modelId is a platform model (Apple Foundation, Gemini Nano).
 */
export function isPlatformModelId(modelId: string): boolean {
  return PlatformModelIdSchema.safeParse(modelId).success;
}

/**
 * Get the category of a model based on its ID.
 * Useful for routing and UI display.
 */
export function getModelCategory(modelId: string): ModelCategory {
  if (!modelId) {
    return "unknown";
  }

  // Check remote first (prefix-based)
  if (isRemoteModelId(modelId)) {
    return "remote";
  }

  // Check custom local (prefix-based)
  if (isCustomLocalModelId(modelId)) {
    return "custom-local";
  }

  // Check platform models
  if (isPlatformModelId(modelId)) {
    return "platform";
  }

  // Check built-in downloadable models
  if (isDownloadableModelId(modelId)) {
    return "built-in";
  }

  return "unknown";
}

/**
 * Check if a model requires data to be sent to external servers.
 * Returns true for remote API models, false for local/platform models.
 */
export function requiresNetworkForInference(modelId: string): boolean {
  return isRemoteModelId(modelId);
}

/**
 * Check if a model runs locally on the device.
 * Returns true for built-in, platform, and custom local models.
 */
export function isLocalModel(modelId: string): boolean {
  const category = getModelCategory(modelId);
  return (
    category === "built-in" ||
    category === "platform" ||
    category === "custom-local"
  );
}

// =============================================================================
// MODEL ID GENERATORS
// =============================================================================

/**
 * Generate a model ID for a custom local model based on folder name.
 */
export function generateCustomLocalModelId(folderName: string): string {
  // Sanitize folder name to create a valid model ID
  const sanitized = folderName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return `${CUSTOM_LOCAL_MODEL_PREFIX}${sanitized}`;
}

/**
 * Generate a model ID for a remote API model based on provider and model name.
 */
export function generateRemoteModelId(
  providerId: string,
  modelName: string,
): string {
  // Sanitize to create a valid model ID
  const sanitizedProvider = providerId
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-");
  const sanitizedModel = modelName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return `${REMOTE_MODEL_PREFIX}${sanitizedProvider}-${sanitizedModel}`;
}

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Validate a model ID and return its category if valid.
 * Returns null if the model ID is invalid.
 */
export function validateModelId(
  modelId: unknown,
): { valid: true; category: ModelCategory } | { valid: false; error: string } {
  if (typeof modelId !== "string" || !modelId) {
    return { valid: false, error: "Model ID must be a non-empty string" };
  }

  const category = getModelCategory(modelId);
  if (category === "unknown") {
    return { valid: false, error: `Unknown model ID format: ${modelId}` };
  }

  return { valid: true, category };
}

/**
 * Generate a unique key reference for a remote model's API key.
 * This is used to store/retrieve the API key from secure storage.
 *
 * @param modelId - The model ID (e.g., "remote-openai-gpt-4")
 * @returns A key reference string (e.g., "remote-openai-gpt-4-key")
 */
export function generateApiKeyRef(modelId: string): string {
  return `${modelId}-key`;
}
