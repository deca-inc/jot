/**
 * Sync Auth Provider
 *
 * Context provider for sharing sync authentication state across components.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  type ReactNode,
} from "react";
import { useSyncSettings, type SyncSettings } from "../db/syncSettings";
import {
  createUEKForRegistration,
  unwrapUEKForLogin,
  storeUEK,
  deleteUEK,
} from "./encryption/keyManager";
import * as authService from "./syncAuthService";
import {
  initializeTokenManager,
  setAuthStateCallback,
  storeAuthTokens,
  initializeAuth,
  clearAuth,
  hasAuthTokens,
  getRefreshToken,
} from "./syncTokenManager";

export type SyncAuthStatus =
  | "initializing"
  | "unauthenticated"
  | "authenticated"
  | "error";

export interface SyncAuthState {
  status: SyncAuthStatus;
  settings: SyncSettings | null;
  error: string | null;
  isLoading: boolean;
}

export interface SyncAuthContextValue {
  state: SyncAuthState;
  checkServerConnection: (serverUrl: string) => Promise<boolean>;
  register: (
    serverUrl: string,
    email: string,
    password: string,
  ) => Promise<void>;
  login: (serverUrl: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSettings: () => Promise<void>;
}

const SyncAuthContext = createContext<SyncAuthContextValue | null>(null);

export interface SyncAuthProviderProps {
  children: ReactNode;
}

export function SyncAuthProvider({ children }: SyncAuthProviderProps) {
  const syncSettings = useSyncSettings();
  const syncSettingsRef = useRef(syncSettings);
  syncSettingsRef.current = syncSettings;

  const [state, setState] = useState<SyncAuthState>({
    status: "initializing",
    settings: null,
    error: null,
    isLoading: true,
  });

  // Use refs to access latest values in callbacks
  const stateRef = useRef(state);
  stateRef.current = state;

  const hasInitializedRef = useRef(false);

  // Initialize on mount - only once
  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    let mounted = true;

    const initialize = async () => {
      try {
        // Load settings
        const settings = await syncSettingsRef.current.getSettings();

        if (!mounted) return;

        if (!settings.serverUrl || !settings.enabled) {
          setState({
            status: "unauthenticated",
            settings,
            error: null,
            isLoading: false,
          });
          return;
        }

        // Initialize token manager with server URL
        initializeTokenManager(settings.serverUrl);

        // Set up auth state callback
        setAuthStateCallback((isAuthenticated, error) => {
          if (!mounted) return;

          setState((prev) => ({
            ...prev,
            status: isAuthenticated ? "authenticated" : "error",
            error: error || null,
          }));
        });

        // Try to restore authentication
        const hasAuth = await hasAuthTokens();
        if (hasAuth) {
          const success = await initializeAuth();
          if (!mounted) return;

          setState({
            status: success ? "authenticated" : "error",
            settings,
            error: success ? null : "Session expired. Please log in again.",
            isLoading: false,
          });
        } else {
          setState({
            status: "unauthenticated",
            settings,
            error: null,
            isLoading: false,
          });
        }
      } catch (error) {
        if (!mounted) return;

        const err = error as { message?: string };
        setState({
          status: "error",
          settings: null,
          error: err.message || "Failed to initialize sync",
          isLoading: false,
        });
      }
    };

    initialize();

    return () => {
      mounted = false;
      setAuthStateCallback(null);
    };
  }, []); // Empty deps - only run once

  // Check server connection
  const checkServerConnection = useCallback(
    async (serverUrl: string): Promise<boolean> => {
      try {
        const status = await authService.checkServerStatus(serverUrl);
        return status.ok;
      } catch {
        return false;
      }
    },
    [],
  );

  // Register
  const register = useCallback(
    async (
      serverUrl: string,
      email: string,
      password: string,
    ): Promise<void> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        // Initialize token manager
        initializeTokenManager(serverUrl);

        // Create UEK for E2EE (wrapped with KEK derived from password)
        const { registrationData, uek } =
          await createUEKForRegistration(password);

        // Register on server with UEK data
        const response = await authService.register(
          serverUrl,
          email,
          password,
          registrationData,
        );

        // Store tokens
        await storeAuthTokens(response.accessToken, response.refreshToken);

        // Store UEK locally (unwrapped)
        const uekVersion = response.uek?.version ?? 1;
        await storeUEK(uek, uekVersion);

        // Save settings
        await syncSettingsRef.current.setSettings({
          serverUrl,
          email: response.user.email,
          userId: response.user.id,
          enabled: true,
          lastError: null,
        });

        // Update state
        const settings = await syncSettingsRef.current.getSettings();
        setState({
          status: "authenticated",
          settings,
          error: null,
          isLoading: false,
        });
      } catch (error) {
        const err = error as { message?: string };
        setState((prev) => ({
          ...prev,
          status: "error",
          error: err.message || "Registration failed",
          isLoading: false,
        }));
        throw error;
      }
    },
    [],
  );

  // Login
  const login = useCallback(
    async (
      serverUrl: string,
      email: string,
      password: string,
    ): Promise<void> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        // Initialize token manager
        initializeTokenManager(serverUrl);

        // Login on server
        const response = await authService.login(serverUrl, email, password);

        // Store tokens
        await storeAuthTokens(response.accessToken, response.refreshToken);

        // Unwrap and store UEK if available
        if (response.uek) {
          const uek = await unwrapUEKForLogin(password, response.uek);
          await storeUEK(uek, response.uek.version);
        }

        // Save settings
        await syncSettingsRef.current.setSettings({
          serverUrl,
          email: response.user.email,
          userId: response.user.id,
          enabled: true,
          lastError: null,
        });

        // Update state
        const settings = await syncSettingsRef.current.getSettings();
        setState({
          status: "authenticated",
          settings,
          error: null,
          isLoading: false,
        });
      } catch (error) {
        const err = error as { message?: string };
        setState((prev) => ({
          ...prev,
          status: "error",
          error: err.message || "Login failed",
          isLoading: false,
        }));
        throw error;
      }
    },
    [],
  );

  // Logout
  const logout = useCallback(async (): Promise<void> => {
    setState((prev) => ({ ...prev, isLoading: true }));

    try {
      const settings = stateRef.current.settings;

      // Try to logout on server (best effort)
      if (settings?.serverUrl) {
        const refreshToken = await getRefreshToken();
        if (refreshToken) {
          try {
            await authService.logout(settings.serverUrl, refreshToken);
          } catch {
            // Ignore server logout errors
          }
        }
      }

      // Clear local auth state
      await clearAuth();

      // Clear UEK (E2EE key)
      await deleteUEK();

      // Clear settings
      await syncSettingsRef.current.setSettings({
        enabled: false,
        lastSyncAt: null,
        lastError: null,
      });

      // Update state
      const updatedSettings = await syncSettingsRef.current.getSettings();
      setState({
        status: "unauthenticated",
        settings: updatedSettings,
        error: null,
        isLoading: false,
      });
    } catch (error) {
      const err = error as { message?: string };
      setState((prev) => ({
        ...prev,
        error: err.message || "Logout failed",
        isLoading: false,
      }));
    }
  }, []);

  // Refresh settings
  const refreshSettings = useCallback(async (): Promise<void> => {
    const settings = await syncSettingsRef.current.getSettings();
    setState((prev) => ({ ...prev, settings }));
  }, []);

  const contextValue = useMemo(
    () => ({
      state,
      checkServerConnection,
      register,
      login,
      logout,
      refreshSettings,
    }),
    [state, checkServerConnection, register, login, logout, refreshSettings],
  );

  return (
    <SyncAuthContext.Provider value={contextValue}>
      {children}
    </SyncAuthContext.Provider>
  );
}

/**
 * Hook for accessing sync authentication context
 */
export function useSyncAuthContext(): SyncAuthContextValue {
  const context = useContext(SyncAuthContext);
  if (!context) {
    throw new Error(
      "useSyncAuthContext must be used within a SyncAuthProvider",
    );
  }
  return context;
}
