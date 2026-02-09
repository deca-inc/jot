/**
 * Sync Token Manager
 *
 * Manages automatic token refresh and maintains authentication state.
 */

import { refreshAccessToken, SyncAuthError } from "./syncAuthService";
import {
  getAccessToken,
  setAccessToken,
  clearAccessToken,
  getRefreshToken,
  storeRefreshToken,
  deleteRefreshToken,
  isAccessTokenExpired,
  getAccessTokenTTL,
  clearAllTokens,
} from "./syncAuthStorage";

// Refresh interval timer
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

// Callbacks for state changes
type AuthStateCallback = (isAuthenticated: boolean, error?: string) => void;
let stateCallback: AuthStateCallback | null = null;

// Server URL cache
let cachedServerUrl: string | null = null;

/**
 * Initialize the token manager with a server URL
 */
export function initializeTokenManager(serverUrl: string): void {
  cachedServerUrl = serverUrl;
}

/**
 * Set the callback for authentication state changes
 */
export function setAuthStateCallback(callback: AuthStateCallback | null): void {
  stateCallback = callback;
}

/**
 * Store tokens after successful login/register
 */
export async function storeAuthTokens(
  accessToken: string,
  refreshToken: string,
  expiresIn: number = 900,
): Promise<void> {
  setAccessToken(accessToken, expiresIn);
  await storeRefreshToken(refreshToken);
  scheduleTokenRefresh();
  stateCallback?.(true);
}

/**
 * Get a valid access token, refreshing if necessary
 */
export async function getValidAccessToken(): Promise<string | null> {
  // Check if we have a valid access token in memory
  const currentToken = getAccessToken();
  if (currentToken && !isAccessTokenExpired()) {
    return currentToken;
  }

  // Try to refresh using the refresh token
  try {
    await performTokenRefresh();
    return getAccessToken();
  } catch {
    return null;
  }
}

/**
 * Perform token refresh
 */
async function performTokenRefresh(): Promise<void> {
  if (!cachedServerUrl) {
    throw new Error("Server URL not configured");
  }

  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    throw new Error("No refresh token available");
  }

  try {
    const response = await refreshAccessToken(cachedServerUrl, refreshToken);
    // Default to 15 minutes (900 seconds) if not specified
    setAccessToken(response.accessToken, 900);
    scheduleTokenRefresh();
    stateCallback?.(true);
  } catch (error) {
    // If refresh fails, clear all tokens
    await clearAllTokens();
    cancelTokenRefresh();

    if (error instanceof SyncAuthError && error.isSessionExpired()) {
      stateCallback?.(false, "Session expired. Please log in again.");
    } else {
      stateCallback?.(false, "Failed to refresh session.");
    }

    throw error;
  }
}

/**
 * Schedule automatic token refresh
 */
function scheduleTokenRefresh(): void {
  cancelTokenRefresh();

  const ttl = getAccessTokenTTL();
  if (ttl <= 0) {
    return;
  }

  // Refresh when 5 minutes remaining or at 75% of TTL, whichever is sooner
  const refreshAt = Math.min(ttl - 5 * 60 * 1000, ttl * 0.75);

  if (refreshAt <= 0) {
    // Token is about to expire, refresh immediately
    performTokenRefresh().catch((error) => {
      console.error("Failed to refresh token:", error);
    });
    return;
  }

  refreshTimer = setTimeout(() => {
    performTokenRefresh().catch((error) => {
      console.error("Failed to refresh token:", error);
    });
  }, refreshAt);
}

/**
 * Cancel scheduled token refresh
 */
function cancelTokenRefresh(): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

/**
 * Initialize authentication state on app start
 */
export async function initializeAuth(): Promise<boolean> {
  // Check if we have a refresh token
  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    return false;
  }

  // Try to get a fresh access token
  try {
    await performTokenRefresh();
    return true;
  } catch {
    return false;
  }
}

/**
 * Clear all authentication state (logout)
 */
export async function clearAuth(): Promise<void> {
  cancelTokenRefresh();
  await clearAllTokens();
  stateCallback?.(false);
}

/**
 * Check if we have authentication tokens
 */
export async function hasAuthTokens(): Promise<boolean> {
  const accessToken = getAccessToken();
  if (accessToken) {
    return true;
  }

  const refreshToken = await getRefreshToken();
  return !!refreshToken;
}

// Re-export storage functions for convenience
export {
  getAccessToken,
  setAccessToken,
  clearAccessToken,
  getRefreshToken,
  storeRefreshToken,
  deleteRefreshToken,
  isAccessTokenExpired,
  clearAllTokens,
};
