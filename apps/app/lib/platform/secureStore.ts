/**
 * Platform abstraction for secure storage (native implementation)
 *
 * Uses expo-secure-store on native platforms (iOS/Android/macOS).
 * On web, the .web.ts version is loaded instead via Metro/webpack resolution.
 */

export {
  getItemAsync,
  setItemAsync,
  deleteItemAsync,
  isAvailableAsync,
  AFTER_FIRST_UNLOCK,
} from "expo-secure-store";

export type { SecureStoreOptions } from "expo-secure-store";
