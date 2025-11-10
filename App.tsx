import { useState, useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LogBox } from "react-native";
import { DatabaseProvider } from "./lib/db/DatabaseProvider";
import { ThemeProvider } from "./lib/theme/ThemeProvider";
import { SeasonalThemeProvider } from "./lib/theme/SeasonalThemeProvider";
import { SimpleNavigation } from "./lib/navigation/SimpleNavigation";
import { getOrCreateMasterKey } from "./lib/encryption/keyDerivation";
import { ModelProvider } from "./lib/ai/ModelProvider";

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
      } finally {
        setIsInitializing(false);
      }
    };

    initializeEncryption();
  }, []);

  if (isInitializing || !encryptionKey) {
    // Show nothing while initializing (could add a loading screen here)
    return null;
  }

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <DatabaseProvider encryptionKey={encryptionKey}>
          <ModelProvider>
            <ThemeProvider>
              <SeasonalThemeProvider>
                <StatusBar style="auto" />
                <SimpleNavigation />
              </SeasonalThemeProvider>
            </ThemeProvider>
          </ModelProvider>
        </DatabaseProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
