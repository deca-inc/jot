/**
 * Web shim for react-native-mmkv
 *
 * Provides a synchronous key-value store backed by localStorage.
 * Mirrors the MMKV interface used in the app.
 */

export interface MMKV {
  getString(key: string): string | undefined;
  set(key: string, value: string | number | boolean): void;
  getNumber(key: string): number | undefined;
  getBoolean(key: string): boolean | undefined;
  delete(key: string): void;
  getAllKeys(): string[];
  clearAll(): void;
  contains(key: string): boolean;
  /** Alias used internally */
  remove?(key: string): void;
}

interface CreateMMKVOptions {
  id?: string;
}

/**
 * Create a localStorage-backed MMKV-compatible store.
 *
 * Keys are prefixed with the store ID to avoid collisions.
 */
function getStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function createMMKV(options?: CreateMMKVOptions): MMKV {
  const prefix = `mmkv_${options?.id ?? "default"}_`;

  function prefixedKey(key: string): string {
    return `${prefix}${key}`;
  }

  const store: MMKV = {
    getString(key: string): string | undefined {
      try {
        const value = getStorage()?.getItem(prefixedKey(key));
        return value ?? undefined;
      } catch {
        return undefined;
      }
    },

    set(key: string, value: string | number | boolean): void {
      try {
        getStorage()?.setItem(prefixedKey(key), String(value));
      } catch {
        console.warn("[mmkv.web] Failed to write to localStorage");
      }
    },

    getNumber(key: string): number | undefined {
      const value = store.getString(key);
      if (value === undefined) return undefined;
      const num = Number(value);
      return isNaN(num) ? undefined : num;
    },

    getBoolean(key: string): boolean | undefined {
      const value = store.getString(key);
      if (value === undefined) return undefined;
      return value === "true";
    },

    delete(key: string): void {
      try {
        getStorage()?.removeItem(prefixedKey(key));
      } catch {
        console.warn("[mmkv.web] Failed to delete from localStorage");
      }
    },

    getAllKeys(): string[] {
      try {
        const storage = getStorage();
        if (!storage) return [];
        const keys: string[] = [];
        for (let i = 0; i < storage.length; i++) {
          const fullKey = storage.key(i);
          if (fullKey?.startsWith(prefix)) {
            keys.push(fullKey.slice(prefix.length));
          }
        }
        return keys;
      } catch {
        return [];
      }
    },

    clearAll(): void {
      try {
        const storage = getStorage();
        if (!storage) return;
        const keysToRemove: string[] = [];
        for (let i = 0; i < storage.length; i++) {
          const fullKey = storage.key(i);
          if (fullKey?.startsWith(prefix)) {
            keysToRemove.push(fullKey);
          }
        }
        keysToRemove.forEach((k) => storage.removeItem(k));
      } catch {
        console.warn("[mmkv.web] Failed to clear localStorage");
      }
    },

    contains(key: string): boolean {
      try {
        return getStorage()?.getItem(prefixedKey(key)) !== null;
      } catch {
        return false;
      }
    },

    remove(key: string): void {
      store.delete(key);
    },
  };

  return store;
}
