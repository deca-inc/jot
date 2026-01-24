import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { useState, useEffect, useRef } from "react";
import { AppState, LogBox } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { UnifiedModelProvider } from "./lib/ai/UnifiedModelProvider";
import { ConditionalPostHogProvider } from "./lib/analytics/PostHogProvider";
import { ToastProvider } from "./lib/components/ToastProvider";
import { DatabaseProvider, useDatabase } from "./lib/db/DatabaseProvider";
import { EntryRepository } from "./lib/db/entries";
import { OnboardingSettingsRepository } from "./lib/db/onboardingSettings";
import { getOrCreateMasterKey } from "./lib/encryption/keyDerivation";
import { OnboardingFlow } from "./lib/navigation/OnboardingFlow";
import {
  SimpleNavigation,
  getNavigationRef,
} from "./lib/navigation/SimpleNavigation";
import {
  SeasonalThemeProvider,
  useSeasonalThemeContext,
} from "./lib/theme/SeasonalThemeProvider";
import { ThemeProvider } from "./lib/theme/ThemeProvider";
import {
  setupNotificationResponseHandler,
  getLastNotificationResponse,
  NotificationData,
} from "./lib/utils/notifications";
import {
  refreshCountdownNotifications,
  registerBackgroundTask,
} from "./lib/utils/notificationScheduler";
import { syncCountdownsToWidgets } from "./lib/widgets/widgetDataBridge";

// Suppress harmless warnings
LogBox.ignoreLogs([
  "CHHapticPattern", // CoreHaptics warnings in iOS simulator
  "Error creating CHHapticPattern", // UIKitCore haptic feedback errors
  "_UIKBFeedbackGenerator", // Keyboard feedback generator warnings
  "TextInputUI", // TextInput accumulator timing warnings
  "Background tasks are not supported on iOS simulators", // Expected simulator limitation
  "Skipped registering task", // Background task registration on simulator
  "You seem to update props of the", // RenderHTML throttling warning (we handle this internally)
  "You seem to update the renderers prop", // RenderHTML throttling warning
  "expo-background-fetch: This library is deprecated", // Will migrate to expo-background-task later
]);

// Create a query client with optimized cache settings for better performance
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 30, // 30 minutes - entries don't change that often
      gcTime: 1000 * 60 * 60, // 1 hour - keep in cache longer for better navigation
      refetchOnWindowFocus: false, // Don't refetch on app focus
      refetchOnReconnect: false, // Don't refetch on reconnect
      retry: 1, // Only retry once on failure
    },
    mutations: {
      retry: 1, // Only retry once on mutation failure
    },
  },
});

export default function App() {
  const [encryptionKey, setEncryptionKey] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const initializeEncryption = async () => {
      try {
        // Get or create the encryption key automatically
        // This provides seamless UX - no passphrase needed
        // Key is stored securely in OS keystore (Keychain)
        const key = await getOrCreateMasterKey();
        setEncryptionKey(key);
      } catch (error) {
        console.error("Error initializing encryption:", error);
        // Still allow app to continue - will use null encryption key
        setEncryptionKey(null);
      } finally {
        setIsInitializing(false);
      }
    };

    initializeEncryption();
  }, []);

  if (isInitializing) {
    // Show nothing while initializing (could add a loading screen here)
    return null;
  }

  if (!encryptionKey) {
    // Encryption key failed to initialize - this shouldn't happen in production
    console.error("Failed to initialize encryption key");
    return null;
  }

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <DatabaseProvider encryptionKey={encryptionKey}>
          <ConditionalPostHogProvider>
            <OnboardingWrapper />
          </ConditionalPostHogProvider>
        </DatabaseProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

// Wrapper component that checks onboarding status after database is ready
function OnboardingWrapper() {
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  const [isCheckingOnboarding, setIsCheckingOnboarding] = useState(true);
  const db = useDatabase(); // Use the hook at component level
  const hasHandledInitialNotificationRef = useRef(false);

  useEffect(() => {
    const checkOnboarding = async () => {
      try {
        const repo = new OnboardingSettingsRepository(db);
        const hasCompleted = await repo.hasCompletedOnboarding();
        setShowOnboarding(!hasCompleted);
      } catch (error) {
        console.error("Error checking onboarding status:", error);
        // If we can't check onboarding status, default to showing it
        // This ensures fresh installs show onboarding even if there's an issue
        setShowOnboarding(true);
      } finally {
        setIsCheckingOnboarding(false);
      }
    };

    checkOnboarding();
  }, [db]);

  // Handle notification responses (user tapping on notification)
  useEffect(() => {
    // Handler for when user taps a notification
    const handleNotificationTap = (
      entryId: number,
      type: "countdown-complete" | "checkin-reminder",
    ) => {
      const navRef = getNavigationRef();
      if (navRef) {
        // For check-in reminders, show the check-in prompt
        const showCheckinPrompt = type === "checkin-reminder";
        navRef.navigateToCountdownViewer(entryId, showCheckinPrompt);
      }
    };

    // Set up listener for notification responses
    const cleanup = setupNotificationResponseHandler(handleNotificationTap);

    // Check if app was launched from a notification
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
            // Delay slightly to ensure navigation is ready
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

  // Refresh countdown notifications and sync widgets on app open and when returning to foreground
  useEffect(() => {
    const entryRepository = new EntryRepository(db);

    // Function to refresh notifications and sync widgets
    const refreshAndSync = async () => {
      // Refresh notifications
      await refreshCountdownNotifications(entryRepository);

      // Sync countdown data to widgets
      try {
        const countdowns = await entryRepository.getAll({ type: "countdown" });
        await syncCountdownsToWidgets(countdowns);
      } catch (error) {
        console.warn("[App] Failed to sync widgets:", error);
      }
    };

    // Refresh immediately on mount
    refreshAndSync();

    // Register background task
    registerBackgroundTask();

    // Also refresh when app comes to foreground
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        refreshAndSync();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [db]);

  const handleOnboardingComplete = async () => {
    try {
      const repo = new OnboardingSettingsRepository(db);
      await repo.markOnboardingComplete();
      setShowOnboarding(false);
    } catch (error) {
      console.error("Error marking onboarding complete:", error);
      setShowOnboarding(false);
    }
  };

  if (isCheckingOnboarding || showOnboarding === null) {
    // Could show a loading screen here
    return null;
  }

  return (
    <UnifiedModelProvider>
      <ThemeProvider>
        <SeasonalThemeProvider>
          <ToastProvider>
            <StatusBarController />
            {showOnboarding ? (
              <OnboardingFlow onComplete={handleOnboardingComplete} />
            ) : (
              <SimpleNavigation />
            )}
          </ToastProvider>
        </SeasonalThemeProvider>
      </ThemeProvider>
    </UnifiedModelProvider>
  );
}

// Status bar controller that responds to the seasonal theme
function StatusBarController() {
  const { theme } = useSeasonalThemeContext();

  return <StatusBar style={theme.isDark ? "light" : "dark"} />;
}
