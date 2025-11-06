import { useState, useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DatabaseProvider } from "./lib/db/DatabaseProvider";
import { ThemeProvider } from "./lib/theme/ThemeProvider";
import { SeasonalThemeProvider } from "./lib/theme/SeasonalThemeProvider";
import { SimpleNavigation } from "./lib/navigation/SimpleNavigation";
import { getOrCreateMasterKey } from "./lib/encryption/keyDerivation";

// Create a query client with aggressive memory management
// CRITICAL: Reduce cache times to prevent OOM crashes
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30, // 30 seconds - entries can be refreshed quickly
      gcTime: 1000 * 60 * 2, // 2 minutes - much shorter to free memory faster
      refetchOnWindowFocus: false, // Don't refetch on focus to save memory
      refetchOnReconnect: false, // Don't refetch on reconnect
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
          <ThemeProvider>
            <SeasonalThemeProvider>
              <StatusBar style="auto" />
              <SimpleNavigation />
            </SeasonalThemeProvider>
          </ThemeProvider>
        </DatabaseProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
