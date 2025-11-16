import { useState, useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LogBox } from "react-native";
import { DatabaseProvider, useDatabase } from "./lib/db/DatabaseProvider";
import { ThemeProvider } from "./lib/theme/ThemeProvider";
import { SeasonalThemeProvider } from "./lib/theme/SeasonalThemeProvider";
import { SimpleNavigation } from "./lib/navigation/SimpleNavigation";
import { OnboardingFlow } from "./lib/navigation/OnboardingFlow";
import { getOrCreateMasterKey } from "./lib/encryption/keyDerivation";
import { ModelProvider } from "./lib/ai/ModelProvider";
import { OnboardingSettingsRepository } from "./lib/db/onboardingSettings";
import { ConditionalPostHogProvider } from "./lib/analytics/PostHogProvider";

// Suppress harmless iOS system warnings
LogBox.ignoreLogs([
  "CHHapticPattern", // CoreHaptics warnings in iOS simulator
  "Error creating CHHapticPattern", // UIKitCore haptic feedback errors
  "_UIKBFeedbackGenerator", // Keyboard feedback generator warnings
  "TextInputUI", // TextInput accumulator timing warnings
  "Background tasks are not supported on iOS simulators", // Expected simulator limitation
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
    <ModelProvider>
      <ThemeProvider>
        <SeasonalThemeProvider>
          <StatusBarController />
          {showOnboarding ? (
            <OnboardingFlow onComplete={handleOnboardingComplete} />
          ) : (
            <SimpleNavigation />
          )}
        </SeasonalThemeProvider>
      </ThemeProvider>
    </ModelProvider>
  );
}

// Status bar controller that responds to the seasonal theme
function StatusBarController() {
  const { theme } =
    require("./lib/theme/SeasonalThemeProvider").useSeasonalThemeContext();

  return <StatusBar style={theme.isDark ? "light" : "dark"} />;
}
