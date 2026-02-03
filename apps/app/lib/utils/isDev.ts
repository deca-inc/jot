/**
 * Check if the app is running in development mode
 */
export function isDev(): boolean {
  return __DEV__;
}

/**
 * Check if component playground should be enabled
 * In production, this can be gated behind a feature flag or developer menu
 */
export function isComponentPlaygroundEnabled(): boolean {
  return __DEV__;
}
