/**
 * Web shim for react-native-quick-crypto
 *
 * On web, the browser's native crypto API (crypto.subtle) is already available.
 * The install() function polyfills global.Buffer since application code depends on it.
 */

import { Buffer } from "buffer";

/**
 * Install global Buffer polyfill for web.
 * react-native-quick-crypto's install() sets up global.Buffer on native.
 * On web, we use the 'buffer' package to provide the same global.
 */
export function install(): void {
  if (typeof globalThis.Buffer === "undefined") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- polyfilling global
    (globalThis as any).Buffer = Buffer;
  }
}
