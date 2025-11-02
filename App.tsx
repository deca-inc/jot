import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";
import { DatabaseProvider } from "./lib/db/DatabaseProvider";

export default function App() {
  return (
    <DatabaseProvider>
      <View style={styles.container}>
        <Text>Open up App.tsx to start working on your app!</Text>
        <StatusBar style="auto" />
      </View>
    </DatabaseProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
});
