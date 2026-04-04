/**
 * Platform abstraction layer
 *
 * This module provides cross-platform abstractions for native modules
 * that don't work on web. Each module has a .ts (native) and .web.ts
 * (web/Tauri) implementation. Metro/webpack automatically resolves
 * the correct file based on the target platform.
 *
 * Usage:
 *   import { getItemAsync, setItemAsync } from '../platform/secureStore';
 *   import { createMMKV } from '../platform/mmkv';
 *   import { BlurView } from '../platform/blur';
 *   import { install } from '../platform/cryptoPolyfill';
 *   import { argon2 } from '../platform/argon2';
 *
 * Modules:
 * - secureStore: Secure key-value storage (expo-secure-store / localStorage)
 * - mmkv: Synchronous key-value storage (react-native-mmkv / localStorage)
 * - cryptoPolyfill: Crypto polyfill (react-native-quick-crypto / no-op)
 * - argon2: Argon2id key derivation (react-native-argon2 / PBKDF2 fallback)
 * - blur: Blur effect component (expo-blur / CSS backdrop-filter)
 */

// Re-export for convenience. Consumers should import from the specific
// module file for proper platform resolution (e.g., '../platform/secureStore')
// rather than from this index file, since bundlers resolve .web.ts files
// at the individual file level.
