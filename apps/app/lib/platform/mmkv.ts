/**
 * Platform abstraction for MMKV storage (native implementation)
 *
 * Uses react-native-mmkv on native platforms for synchronous key-value storage.
 * On web, the .web.ts version is loaded instead via Metro/webpack resolution.
 */

export { createMMKV, type MMKV } from "react-native-mmkv";
