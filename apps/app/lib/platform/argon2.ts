/**
 * Platform abstraction for argon2 key derivation (native implementation)
 *
 * Uses react-native-argon2 for native Argon2id key derivation.
 * On web, the .web.ts version is loaded instead.
 */

export { default as argon2 } from "react-native-argon2";
