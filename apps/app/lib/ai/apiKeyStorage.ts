/**
 * API Key Storage
 *
 * Secure storage for API keys using the OS keychain via expo-secure-store.
 * API keys are never stored in SQLite - only in the secure keychain.
 */

import * as SecureStore from "expo-secure-store";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Prefix for all API key entries in the keychain */
export const API_KEY_PREFIX = "jot_api_key_";

// Re-export generateApiKeyRef from modelTypeGuards for backward compatibility
export { generateApiKeyRef } from "./modelTypeGuards";

// =============================================================================
// STORAGE FUNCTIONS
// =============================================================================

/**
 * Store an API key in the secure keychain.
 *
 * @param keyRef - Reference identifier for the key (e.g., "remote-openai-gpt-4-key")
 * @param apiKey - The actual API key value to store
 * @throws Error if storage fails
 */
export async function storeApiKey(
  keyRef: string,
  apiKey: string,
): Promise<void> {
  const fullKey = `${API_KEY_PREFIX}${keyRef}`;

  await SecureStore.setItemAsync(fullKey, apiKey);
}

/**
 * Retrieve an API key from the secure keychain.
 *
 * @param keyRef - Reference identifier for the key
 * @returns The API key if found, null otherwise
 * @throws Error if retrieval fails (other than key not found)
 */
export async function getApiKey(keyRef: string): Promise<string | null> {
  const fullKey = `${API_KEY_PREFIX}${keyRef}`;

  const value = await SecureStore.getItemAsync(fullKey);
  return value;
}

/**
 * Delete an API key from the secure keychain.
 *
 * @param keyRef - Reference identifier for the key
 * @throws Error if deletion fails
 */
export async function deleteApiKey(keyRef: string): Promise<void> {
  const fullKey = `${API_KEY_PREFIX}${keyRef}`;

  await SecureStore.deleteItemAsync(fullKey);
}

/**
 * Check if an API key exists in the secure keychain.
 *
 * @param keyRef - Reference identifier for the key
 * @returns true if the key exists and has a non-empty value
 */
export async function hasApiKey(keyRef: string): Promise<boolean> {
  const value = await getApiKey(keyRef);
  return value !== null && value.length > 0;
}

/**
 * Check if secure storage is available on this device.
 *
 * @returns true if secure storage is available
 */
export async function isSecureStorageAvailable(): Promise<boolean> {
  return SecureStore.isAvailableAsync();
}
