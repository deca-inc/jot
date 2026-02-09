/**
 * Sync Auth Service
 *
 * API client for authentication endpoints on the sync server.
 */

export interface AuthUser {
  id: string;
  email: string;
}

/**
 * UEK data returned from server
 */
export interface UEKResponse {
  wrappedUek: string;
  salt: string;
  nonce: string;
  authTag: string;
  version: number;
}

/**
 * UEK data to send during registration
 */
export interface UEKRegistrationData {
  wrappedUek: string;
  salt: string;
  nonce: string;
  authTag: string;
}

export interface AuthResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  uek?: UEKResponse;
}

export interface RefreshResponse {
  accessToken: string;
}

export interface ServerStatus {
  ok: boolean;
  service: string;
}

export interface AuthError {
  error: string;
  code: string;
}

/**
 * Check if the server is reachable and responding
 */
export async function checkServerStatus(
  serverUrl: string,
): Promise<ServerStatus> {
  const response = await fetch(`${serverUrl}/api/status`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Server is not responding");
  }

  return response.json();
}

/**
 * Register a new user
 *
 * @param serverUrl - Server URL
 * @param email - User's email
 * @param password - User's password
 * @param uekData - Optional UEK data for E2EE
 */
export async function register(
  serverUrl: string,
  email: string,
  password: string,
  uekData?: UEKRegistrationData,
): Promise<AuthResponse> {
  const response = await fetch(`${serverUrl}/api/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      ...(uekData && { uek: uekData }),
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    const error = data as AuthError;
    throw new SyncAuthError(error.error || "Registration failed", error.code);
  }

  return data as AuthResponse;
}

/**
 * Login with email and password
 */
export async function login(
  serverUrl: string,
  email: string,
  password: string,
): Promise<AuthResponse> {
  const response = await fetch(`${serverUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  const data = await response.json();

  if (!response.ok) {
    const error = data as AuthError;
    throw new SyncAuthError(error.error || "Login failed", error.code);
  }

  return data as AuthResponse;
}

/**
 * Refresh the access token using a refresh token
 */
export async function refreshAccessToken(
  serverUrl: string,
  refreshToken: string,
): Promise<RefreshResponse> {
  const response = await fetch(`${serverUrl}/api/auth/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refreshToken }),
  });

  const data = await response.json();

  if (!response.ok) {
    const error = data as AuthError;
    throw new SyncAuthError(error.error || "Token refresh failed", error.code);
  }

  return data as RefreshResponse;
}

/**
 * Logout and invalidate the refresh token
 */
export async function logout(
  serverUrl: string,
  refreshToken: string,
): Promise<void> {
  const response = await fetch(`${serverUrl}/api/auth/logout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    // Ignore logout errors - the server might already have invalidated the token
    console.warn("Logout request failed, continuing with local cleanup");
  }
}

/**
 * Get the current user info
 */
export async function getCurrentUser(
  serverUrl: string,
  accessToken: string,
): Promise<{ user: AuthUser }> {
  const response = await fetch(`${serverUrl}/api/auth/me`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    const error = data as AuthError;
    throw new SyncAuthError(
      error.error || "Failed to get user info",
      error.code,
    );
  }

  return data as { user: AuthUser };
}

/**
 * Custom error class for sync authentication errors
 */
export class SyncAuthError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = "SyncAuthError";
  }

  /**
   * Check if this error indicates the session has expired
   */
  isSessionExpired(): boolean {
    return (
      this.code === "INVALID_REFRESH_TOKEN" ||
      this.code === "INVALID_ACCESS_TOKEN"
    );
  }
}
