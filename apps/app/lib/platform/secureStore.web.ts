/**
 * Web shim for expo-secure-store
 *
 * Temporary web implementation using localStorage.
 * TODO: Replace with @tauri-apps/plugin-stronghold for production
 *
 * WARNING: localStorage is NOT secure storage. This is a development
 * placeholder only. API keys and sensitive data stored here are accessible
 * to any JavaScript running on the page.
 */

/** Prefix to namespace secure store keys in localStorage */
const SECURE_PREFIX = "secure_";

/** Options type to match expo-secure-store interface */
export interface SecureStoreOptions {
  keychainAccessible?: number;
}

/** Matches expo-secure-store constant (no-op on web) */
export const AFTER_FIRST_UNLOCK = 1;

function getStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export async function getItemAsync(
  key: string,
  _options?: SecureStoreOptions,
): Promise<string | null> {
  try {
    return getStorage()?.getItem(`${SECURE_PREFIX}${key}`) ?? null;
  } catch {
    return null;
  }
}

export async function setItemAsync(
  key: string,
  value: string,
  _options?: SecureStoreOptions,
): Promise<void> {
  try {
    getStorage()?.setItem(`${SECURE_PREFIX}${key}`, value);
  } catch {
    // Silently fail if storage unavailable
  }
}

export async function deleteItemAsync(
  key: string,
  _options?: SecureStoreOptions,
): Promise<void> {
  try {
    getStorage()?.removeItem(`${SECURE_PREFIX}${key}`);
  } catch {
    // Silently fail if storage unavailable
  }
}

export async function isAvailableAsync(): Promise<boolean> {
  try {
    const storage = getStorage();
    if (!storage) return false;
    const testKey = `${SECURE_PREFIX}__test__`;
    storage.setItem(testKey, "test");
    storage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}
