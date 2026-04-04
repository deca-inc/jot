/**
 * Web shim for @react-native-async-storage/async-storage
 *
 * Used by posthog-react-native. Provides a localStorage-backed implementation.
 */

function getStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

const AsyncStorage = {
  async getItem(key: string): Promise<string | null> {
    return getStorage()?.getItem(key) ?? null;
  },
  async setItem(key: string, value: string): Promise<void> {
    getStorage()?.setItem(key, value);
  },
  async removeItem(key: string): Promise<void> {
    getStorage()?.removeItem(key);
  },
  async multiGet(keys: string[]): Promise<[string, string | null][]> {
    const storage = getStorage();
    return keys.map((key) => [key, storage?.getItem(key) ?? null]);
  },
  async multiSet(keyValuePairs: [string, string][]): Promise<void> {
    const storage = getStorage();
    keyValuePairs.forEach(([key, value]) => storage?.setItem(key, value));
  },
  async multiRemove(keys: string[]): Promise<void> {
    const storage = getStorage();
    keys.forEach((key) => storage?.removeItem(key));
  },
  async getAllKeys(): Promise<string[]> {
    const storage = getStorage();
    if (!storage) return [];
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key) keys.push(key);
    }
    return keys;
  },
  async clear(): Promise<void> {
    getStorage()?.clear();
  },
};

export default AsyncStorage;
