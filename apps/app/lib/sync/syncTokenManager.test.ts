/**
 * Sync Token Manager Tests
 *
 * Tests that network errors (server offline) are handled differently
 * from actual auth errors (expired/invalid tokens).
 */
// eslint-disable-next-line import/order
import { SyncAuthError } from "./syncAuthService";
// Mock syncAuthService
const mockRefreshAccessToken = jest.fn();
jest.mock("./syncAuthService", () => ({
  refreshAccessToken: (...args: unknown[]) => mockRefreshAccessToken(...args),
  SyncAuthError: jest.requireActual("./syncAuthService").SyncAuthError,
}));

// Mock syncAuthStorage
const mockGetAccessToken = jest.fn();
const mockSetAccessToken = jest.fn();
const mockClearAccessToken = jest.fn();
const mockGetRefreshToken = jest.fn();
const mockStoreRefreshToken = jest.fn();
const mockDeleteRefreshToken = jest.fn();
const mockIsAccessTokenExpired = jest.fn();
const mockGetAccessTokenTTL = jest.fn();
const mockClearAllTokens = jest.fn();

jest.mock("./syncAuthStorage", () => ({
  getAccessToken: () => mockGetAccessToken(),
  setAccessToken: (...args: unknown[]) => mockSetAccessToken(...args),
  clearAccessToken: () => mockClearAccessToken(),
  getRefreshToken: () => mockGetRefreshToken(),
  storeRefreshToken: (...args: unknown[]) => mockStoreRefreshToken(...args),
  deleteRefreshToken: () => mockDeleteRefreshToken(),
  isAccessTokenExpired: () => mockIsAccessTokenExpired(),
  getAccessTokenTTL: () => mockGetAccessTokenTTL(),
  clearAllTokens: () => mockClearAllTokens(),
}));

import {
  initializeTokenManager,
  setAuthStateCallback,
  storeAuthTokens,
  getValidAccessToken,
  initializeAuth,
  clearAuth,
  hasAuthTokens,
} from "./syncTokenManager";

describe("syncTokenManager", () => {
  let authCallback: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    authCallback = jest.fn();
    setAuthStateCallback(authCallback);
    initializeTokenManager("http://localhost:3000");
    mockGetAccessTokenTTL.mockReturnValue(900_000); // 15 min
    mockClearAllTokens.mockResolvedValue(undefined);
    mockStoreRefreshToken.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    setAuthStateCallback(null);
  });

  describe("network errors vs auth errors during token refresh", () => {
    it("should NOT clear tokens when server is unreachable (network error)", async () => {
      mockGetRefreshToken.mockResolvedValue("valid-refresh-token");
      mockGetAccessToken.mockReturnValue(null);
      mockIsAccessTokenExpired.mockReturnValue(true);

      // Simulate server offline - fetch throws TypeError
      mockRefreshAccessToken.mockRejectedValue(
        new TypeError("Network request failed"),
      );

      const token = await getValidAccessToken();

      expect(token).toBeNull();
      // Tokens should NOT be cleared
      expect(mockClearAllTokens).not.toHaveBeenCalled();
      // Auth callback should NOT fire with error
      expect(authCallback).not.toHaveBeenCalledWith(false, expect.any(String));
    });

    it("should clear tokens when server returns INVALID_REFRESH_TOKEN", async () => {
      mockGetRefreshToken.mockResolvedValue("expired-refresh-token");
      mockGetAccessToken.mockReturnValue(null);
      mockIsAccessTokenExpired.mockReturnValue(true);

      // Simulate actual auth error from server
      mockRefreshAccessToken.mockRejectedValue(
        new SyncAuthError("Token expired", "INVALID_REFRESH_TOKEN"),
      );

      const token = await getValidAccessToken();

      expect(token).toBeNull();
      // Tokens SHOULD be cleared for real auth errors
      expect(mockClearAllTokens).toHaveBeenCalled();
      // Callback should fire with session expired message
      expect(authCallback).toHaveBeenCalledWith(
        false,
        "Session expired. Please log in again.",
      );
    });

    it("should clear tokens when server returns INVALID_ACCESS_TOKEN", async () => {
      mockGetRefreshToken.mockResolvedValue("some-refresh-token");
      mockGetAccessToken.mockReturnValue(null);
      mockIsAccessTokenExpired.mockReturnValue(true);

      mockRefreshAccessToken.mockRejectedValue(
        new SyncAuthError("Token invalid", "INVALID_ACCESS_TOKEN"),
      );

      const token = await getValidAccessToken();

      expect(token).toBeNull();
      expect(mockClearAllTokens).toHaveBeenCalled();
      expect(authCallback).toHaveBeenCalledWith(
        false,
        "Session expired. Please log in again.",
      );
    });

    it("should schedule a retry after network error", async () => {
      mockGetRefreshToken.mockResolvedValue("valid-refresh-token");
      mockGetAccessToken.mockReturnValue(null);
      mockIsAccessTokenExpired.mockReturnValue(true);

      mockRefreshAccessToken.mockRejectedValueOnce(
        new TypeError("Network request failed"),
      );

      await getValidAccessToken();

      // After network error, should schedule retry (30s)
      mockRefreshAccessToken.mockResolvedValue({
        accessToken: "new-access-token",
      });

      jest.advanceTimersByTime(30_000);
      await Promise.resolve(); // flush microtasks

      expect(mockRefreshAccessToken).toHaveBeenCalledTimes(2);
    });
  });

  describe("initializeAuth with server offline", () => {
    it("should return true when server is offline but refresh token exists", async () => {
      mockGetRefreshToken.mockResolvedValue("valid-refresh-token");

      // Server offline
      mockRefreshAccessToken.mockRejectedValue(
        new TypeError("Network request failed"),
      );

      const result = await initializeAuth();

      // Should return true - we have tokens, server is just offline
      expect(result).toBe(true);
      // Should NOT clear tokens
      expect(mockClearAllTokens).not.toHaveBeenCalled();
    });

    it("should return false when server rejects the refresh token", async () => {
      mockGetRefreshToken.mockResolvedValue("expired-refresh-token");

      // Server explicitly rejects
      mockRefreshAccessToken.mockRejectedValue(
        new SyncAuthError("Token expired", "INVALID_REFRESH_TOKEN"),
      );

      const result = await initializeAuth();

      expect(result).toBe(false);
    });

    it("should return false when no refresh token exists", async () => {
      mockGetRefreshToken.mockResolvedValue(null);

      const result = await initializeAuth();

      expect(result).toBe(false);
    });
  });

  describe("storeAuthTokens", () => {
    it("should store tokens and notify callback", async () => {
      await storeAuthTokens("access-token", "refresh-token", 900);

      expect(mockSetAccessToken).toHaveBeenCalledWith("access-token", 900);
      expect(mockStoreRefreshToken).toHaveBeenCalledWith("refresh-token");
      expect(authCallback).toHaveBeenCalledWith(true);
    });
  });

  describe("getValidAccessToken", () => {
    it("should return existing valid token without refreshing", async () => {
      mockGetAccessToken.mockReturnValue("valid-token");
      mockIsAccessTokenExpired.mockReturnValue(false);

      const token = await getValidAccessToken();

      expect(token).toBe("valid-token");
      expect(mockRefreshAccessToken).not.toHaveBeenCalled();
    });

    it("should refresh when access token is expired", async () => {
      mockGetAccessToken
        .mockReturnValueOnce(null) // first call - expired
        .mockReturnValueOnce("new-token"); // after refresh
      mockIsAccessTokenExpired.mockReturnValue(true);
      mockGetRefreshToken.mockResolvedValue("refresh-token");
      mockRefreshAccessToken.mockResolvedValue({
        accessToken: "new-token",
      });

      const token = await getValidAccessToken();

      expect(token).toBe("new-token");
      expect(mockRefreshAccessToken).toHaveBeenCalled();
    });
  });

  describe("clearAuth", () => {
    it("should clear all tokens and notify callback", async () => {
      await clearAuth();

      expect(mockClearAllTokens).toHaveBeenCalled();
      expect(authCallback).toHaveBeenCalledWith(false);
    });
  });

  describe("hasAuthTokens", () => {
    it("should return true if access token exists", async () => {
      mockGetAccessToken.mockReturnValue("some-token");

      const result = await hasAuthTokens();

      expect(result).toBe(true);
    });

    it("should check refresh token if no access token", async () => {
      mockGetAccessToken.mockReturnValue(null);
      mockGetRefreshToken.mockResolvedValue("refresh-token");

      const result = await hasAuthTokens();

      expect(result).toBe(true);
    });

    it("should return false if no tokens exist", async () => {
      mockGetAccessToken.mockReturnValue(null);
      mockGetRefreshToken.mockResolvedValue(null);

      const result = await hasAuthTokens();

      expect(result).toBe(false);
    });
  });
});
