/**
 * Runtime Tauri environment detection.
 *
 * Returns true only when running inside a Tauri webview. Safe to call
 * from Node (SSR, Jest) — returns false when `window` is undefined.
 *
 * Tauri 2 exposes its IPC bridge on `window.__TAURI_INTERNALS__`. We check
 * for that property rather than `window.__TAURI__` (which can be configured
 * off) because `__TAURI_INTERNALS__` is always present in a Tauri webview.
 */

interface TauriWindow {
  __TAURI_INTERNALS__?: unknown;
}

/**
 * Check whether the current JS context is running inside a Tauri webview.
 *
 * This is a cheap property check with no side effects — safe to call
 * repeatedly on hot paths.
 */
export function isTauri(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const w = window as unknown as TauriWindow;
  return typeof w.__TAURI_INTERNALS__ !== "undefined";
}
