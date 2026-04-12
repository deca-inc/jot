// Polyfill must be imported before anything else
import "../lib/polyfills";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useState, useEffect, useRef } from "react";
import { AppState, LogBox, Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { UnifiedModelProvider } from "../lib/ai/UnifiedModelProvider";
import { ConditionalPostHogProvider } from "../lib/analytics/PostHogProvider";
import {
  startAttachmentServer,
  stopAttachmentServer,
} from "../lib/attachments";
import { ToastProvider } from "../lib/components/ToastProvider";
import { DatabaseProvider, useDatabase } from "../lib/db/DatabaseProvider";
import { EntryRepository } from "../lib/db/entries";
import { OnboardingSettingsRepository } from "../lib/db/onboardingSettings";
import { getOrCreateMasterKey } from "../lib/encryption/keyDerivation";
import { SyncAuthProvider } from "../lib/sync/SyncAuthProvider";
import { SyncInitializer } from "../lib/sync/SyncInitializer";
import {
  SeasonalThemeProvider,
  useSeasonalThemeContext,
} from "../lib/theme/SeasonalThemeProvider";
import { ThemeProvider } from "../lib/theme/ThemeProvider";
import {
  setupNotificationResponseHandler,
  getLastNotificationResponse,
  NotificationData,
} from "../lib/utils/notifications";
import {
  refreshCountdownNotifications,
  registerBackgroundTask,
} from "../lib/utils/notificationScheduler";
import { syncCountdownsToWidgets } from "../lib/widgets/widgetDataBridge";

// Suppress harmless warnings
LogBox.ignoreLogs([
  "CHHapticPattern",
  "Error creating CHHapticPattern",
  "_UIKBFeedbackGenerator",
  "TextInputUI",
  "Background tasks are not supported on iOS simulators",
  "Skipped registering task",
  "You seem to update props of the",
  "You seem to update the renderers prop",
  "expo-background-fetch: This library is deprecated",
  "[React Native ExecuTorch] No content-length header",
]);

SplashScreen.preventAutoHideAsync();

// On web (including the Tauri desktop webview) the app doesn't ship a
// custom font, so text falls back to the browser default — which in
// WKWebView is a serif (Times). Inject a system-font stack once at
// startup so everything renders in SF Pro / Segoe UI / Roboto depending
// on OS. Native (iOS/Android) already picks a nice system font, so skip.
if (Platform.OS === "web" && typeof document !== "undefined") {
  const style = document.createElement("style");
  style.setAttribute("data-jot-font-stack", "");
  style.textContent = `
    html, body, #root, button, input, textarea, select {
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text",
        "Segoe UI", system-ui, Roboto, "Helvetica Neue", Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
  `;
  document.head.appendChild(style);
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 30,
      gcTime: 1000 * 60 * 60,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    },
    mutations: {
      retry: 1,
    },
  },
});

export default function RootLayout() {
  const [encryptionKey, setEncryptionKey] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        const key = await getOrCreateMasterKey();
        setEncryptionKey(key);

        try {
          await startAttachmentServer();
        } catch (serverError) {
          console.warn("[App] Failed to start attachment server:", serverError);
        }
      } catch (error) {
        console.error("Error initializing encryption:", error);
        setEncryptionKey(null);
      } finally {
        setIsInitializing(false);
      }
    };

    initializeApp();

    return () => {
      stopAttachmentServer();
    };
  }, []);

  useEffect(() => {
    if (!isInitializing) {
      SplashScreen.hideAsync();
    }
  }, [isInitializing]);

  if (isInitializing || !encryptionKey) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <DatabaseProvider encryptionKey={encryptionKey}>
          <ConditionalPostHogProvider>
            <UnifiedModelProvider>
              <ThemeProvider>
                <SeasonalThemeProvider>
                  <ToastProvider>
                    <SyncAuthProvider>
                      <SyncInitializer />
                      <StatusBarController />
                      <OnboardingGate />
                      <Stack
                        screenOptions={{
                          headerShown: false,
                          gestureEnabled: false,
                        }}
                      >
                        <Stack.Screen name="(onboarding)" />
                        <Stack.Screen name="(main)" />
                      </Stack>
                    </SyncAuthProvider>
                  </ToastProvider>
                </SeasonalThemeProvider>
              </ThemeProvider>
            </UnifiedModelProvider>
          </ConditionalPostHogProvider>
        </DatabaseProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

// Handles onboarding redirect, notification responses, and background sync.
// Renders nothing — just runs effects.
function OnboardingGate() {
  const db = useDatabase();
  const hasHandledInitialNotificationRef = useRef(false);
  const hasNavigatedRef = useRef(false);

  // Check onboarding status and redirect
  useEffect(() => {
    const checkAndRedirect = async () => {
      try {
        const repo = new OnboardingSettingsRepository(db);
        const hasCompleted = await repo.hasCompletedOnboarding();
        if (hasNavigatedRef.current) return;
        hasNavigatedRef.current = true;

        if (!hasCompleted) {
          router.replace("/(onboarding)/welcome");
        } else {
          router.replace("/(main)");
        }
      } catch (error) {
        console.error("Error checking onboarding status:", error);
        if (!hasNavigatedRef.current) {
          hasNavigatedRef.current = true;
          router.replace("/(onboarding)/welcome");
        }
      }
    };

    checkAndRedirect();
  }, [db]);

  // Handle notification responses
  useEffect(() => {
    const handleNotificationTap = (
      entryId: number,
      type: "countdown-complete" | "checkin-reminder",
    ) => {
      const showCheckinPrompt = type === "checkin-reminder";
      router.push(
        `/(main)/entry/${entryId}${showCheckinPrompt ? "?checkinPrompt=true" : ""}`,
      );
    };

    const cleanup = setupNotificationResponseHandler(handleNotificationTap);

    const checkInitialNotification = async () => {
      if (hasHandledInitialNotificationRef.current) return;

      try {
        const response = await getLastNotificationResponse();
        if (response) {
          const data = response.notification.request.content
            .data as NotificationData;
          if (
            data?.entryId &&
            (data?.type === "countdown-complete" ||
              data?.type === "checkin-reminder")
          ) {
            hasHandledInitialNotificationRef.current = true;
            setTimeout(() => {
              handleNotificationTap(
                data.entryId as number,
                data.type as "countdown-complete" | "checkin-reminder",
              );
            }, 500);
          }
        }
      } catch (error) {
        console.error("Error checking initial notification:", error);
      }
    };

    checkInitialNotification();

    return cleanup;
  }, []);

  // Refresh countdown notifications and sync widgets
  useEffect(() => {
    const entryRepository = new EntryRepository(db);

    const refreshAndSync = async () => {
      await refreshCountdownNotifications(entryRepository);

      try {
        const countdowns = await entryRepository.getAll({ type: "countdown" });
        await syncCountdownsToWidgets(countdowns);
      } catch (error) {
        console.warn("[App] Failed to sync widgets:", error);
      }
    };

    refreshAndSync();
    registerBackgroundTask();

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        refreshAndSync();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [db]);

  return null;
}

function StatusBarController() {
  const { theme } = useSeasonalThemeContext();
  return <StatusBar style={theme.isDark ? "light" : "dark"} />;
}
