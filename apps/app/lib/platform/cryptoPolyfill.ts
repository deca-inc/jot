/**
 * Platform abstraction for react-native-quick-crypto polyfill (native implementation)
 *
 * On native platforms, installs the react-native-quick-crypto global polyfill
 * which provides crypto.subtle and Buffer via JSI.
 *
 * On web, the .web.ts version is loaded instead (no-op since browsers have native crypto).
 */

export { install } from "react-native-quick-crypto";
