/**
 * Sync Auth Storage
 *
 * Secure storage for sync authentication tokens using the OS keychain via expo-secure-store.
 * Refresh tokens are stored securely; access tokens are kept in memory only.
 */

import * as SecureStore from "expo-secure-store";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Key for the refresh token in the keychain */
const REFRESH_TOKEN_KEY = "jot_sync_refresh_token";

// In-memory storage for access token (lost on app restart)
let accessToken: string | null = null;
let accessTokenExpiresAt: number | null = null;

// =============================================================================
// ACCESS TOKEN (MEMORY ONLY)
// =============================================================================

/**
 * Store an access token in memory.
 *
 * @param token - The access token
 * @param expiresIn - Token expiry time in seconds (default: 15 minutes)
 */
export function setAccessToken(token: string, expiresIn: number = 900): void {
  accessToken = token;
  // Calculate expiry time with a 60-second buffer for clock skew
  accessTokenExpiresAt = Date.now() + (expiresIn - 60) * 1000;
}

/**
 * Get the current access token if it's not expired.
 *
 * @returns The access token if valid, null otherwise
 */
export function getAccessToken(): string | null {
  if (!accessToken || !accessTokenExpiresAt) {
    return null;
  }

  // Check if token is expired
  if (Date.now() >= accessTokenExpiresAt) {
    clearAccessToken();
    return null;
  }

  return accessToken;
}

/**
 * Clear the access token from memory.
 */
export function clearAccessToken(): void {
  accessToken = null;
  accessTokenExpiresAt = null;
}

/**
 * Check if the access token is expired or about to expire.
 *
 * @param bufferMs - Buffer time in ms before expiry to consider it expired (default: 5 minutes)
 * @returns true if token is expired or will expire within buffer time
 */
export function isAccessTokenExpired(
  bufferMs: number = 5 * 60 * 1000,
): boolean {
  if (!accessToken || !accessTokenExpiresAt) {
    return true;
  }

  return Date.now() >= accessTokenExpiresAt - bufferMs;
}

/**
 * Get time until access token expires in milliseconds.
 *
 * @returns Time until expiry in ms, or 0 if expired/missing
 */
export function getAccessTokenTTL(): number {
  if (!accessToken || !accessTokenExpiresAt) {
    return 0;
  }

  const ttl = accessTokenExpiresAt - Date.now();
  return Math.max(0, ttl);
}

// =============================================================================
// REFRESH TOKEN (SECURE STORAGE)
// =============================================================================

/**
 * Store a refresh token in the secure keychain.
 *
 * @param token - The refresh token to store
 * @throws Error if storage fails
 */
export async function storeRefreshToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
}

/**
 * Retrieve the refresh token from the secure keychain.
 *
 * @returns The refresh token if found, null otherwise
 */
export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

/**
 * Delete the refresh token from the secure keychain.
 */
export async function deleteRefreshToken(): Promise<void> {
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

/**
 * Check if a refresh token exists.
 *
 * @returns true if a refresh token is stored
 */
export async function hasRefreshToken(): Promise<boolean> {
  const token = await getRefreshToken();
  return token !== null && token.length > 0;
}

// =============================================================================
// COMBINED OPERATIONS
// =============================================================================

/**
 * Clear all authentication tokens (both access and refresh).
 */
export async function clearAllTokens(): Promise<void> {
  clearAccessToken();
  await deleteRefreshToken();
}

/**
 * Check if we have any authentication state.
 *
 * @returns true if we have either an access token or refresh token
 */
export async function hasAuthState(): Promise<boolean> {
  if (getAccessToken()) {
    return true;
  }
  return hasRefreshToken();
}
