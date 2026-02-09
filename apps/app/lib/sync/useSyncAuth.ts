/**
 * Sync Auth Hooks
 *
 * React hooks for managing sync authentication state.
 * Uses SyncAuthProvider context for shared state across components.
 */

import {
  useSyncAuthContext,
  type SyncAuthContextValue,
} from "./SyncAuthProvider";
import { getValidAccessToken } from "./syncTokenManager";

// Re-export types from provider
export type { SyncAuthStatus, SyncAuthState } from "./SyncAuthProvider";

export type UseSyncAuthReturn = SyncAuthContextValue;

/**
 * Hook for managing sync authentication
 *
 * Must be used within a SyncAuthProvider.
 */
export function useSyncAuth(): UseSyncAuthReturn {
  return useSyncAuthContext();
}

/**
 * Get a valid access token for API calls
 */
export { getValidAccessToken };
