/**
 * Web shim for keyboard-module
 *
 * The native keyboard module is only needed on Android to programmatically
 * show/hide the software keyboard. On web, the browser handles keyboard
 * display automatically. These are safe no-ops.
 */

/**
 * Show the software keyboard - no-op on web.
 * Web browsers manage keyboard display automatically via focus.
 */
export function showKeyboard(): boolean {
  return false;
}

/**
 * Hide the software keyboard - no-op on web.
 * Web browsers manage keyboard display automatically via blur.
 */
export function hideKeyboard(): boolean {
  return false;
}
