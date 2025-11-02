import { StatusBar } from "expo-status-bar";
import { StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { DatabaseProvider } from "./lib/db/DatabaseProvider";
import { ThemeProvider } from "./lib/theme/ThemeProvider";
import { SimpleNavigation } from "./lib/navigation/SimpleNavigation";

export default function App() {
  return (
    <SafeAreaProvider>
      <DatabaseProvider>
        <ThemeProvider>
          <StatusBar style="auto" />
          <SimpleNavigation />
        </ThemeProvider>
      </DatabaseProvider>
    </SafeAreaProvider>
  );
}
