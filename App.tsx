import { useState, useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { DatabaseProvider } from "./lib/db/DatabaseProvider";
import { ThemeProvider } from "./lib/theme/ThemeProvider";
import { SimpleNavigation } from "./lib/navigation/SimpleNavigation";
import { getOrCreateMasterKey } from "./lib/encryption/keyDerivation";

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
      <DatabaseProvider encryptionKey={encryptionKey}>
        <ThemeProvider>
          <StatusBar style="auto" />
          <SimpleNavigation />
        </ThemeProvider>
      </DatabaseProvider>
    </SafeAreaProvider>
  );
}
