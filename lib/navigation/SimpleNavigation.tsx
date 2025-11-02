import React, { useState, useRef } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text } from "../components";
import { useTheme } from "../theme/ThemeProvider";
import { spacingPatterns, borderRadius, springPresets } from "../theme";
import {
  HomeScreen,
  SettingsScreen,
  ComponentPlaygroundScreen,
} from "../screens";
import { isComponentPlaygroundEnabled } from "../utils/isDev";

type Screen = "home" | "settings" | "playground";

export function SimpleNavigation() {
  const [currentScreen, setCurrentScreen] = useState<Screen>("home");
  const theme = useTheme();

  const handleNavigateToPlayground = () => {
    setCurrentScreen("playground");
  };

  const renderScreen = () => {
    switch (currentScreen) {
      case "home":
        return <HomeScreen />;
      case "settings":
        return (
          <SettingsScreen onNavigateToPlayground={handleNavigateToPlayground} />
        );
      case "playground":
        return <ComponentPlaygroundScreen />;
      default:
        return <HomeScreen />;
    }
  };

  return (
    <SafeAreaView style={styles.safeAreaContainer} edges={["top", "bottom"]}>
      <View style={styles.container}>
        <View style={styles.content}>{renderScreen()}</View>
        <View style={[styles.tabBar, { borderTopColor: theme.colors.border }]}>
          <TabButton
            label="Home"
            isActive={currentScreen === "home"}
            onPress={() => setCurrentScreen("home")}
          />
          <TabButton
            label="Settings"
            isActive={currentScreen === "settings"}
            onPress={() => setCurrentScreen("settings")}
          />
          {isComponentPlaygroundEnabled() && (
            <TabButton
              label="Playground"
              isActive={currentScreen === "playground"}
              onPress={() => setCurrentScreen("playground")}
            />
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

interface TabButtonProps {
  label: string;
  isActive: boolean;
  onPress: () => void;
}

function TabButton({ label, isActive, onPress }: TabButtonProps) {
  const theme = useTheme();
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.spring(scale, {
        toValue: 0.95,
        ...springPresets.subtle,
      }),
      Animated.spring(scale, {
        toValue: 1,
        ...springPresets.subtle,
      }),
    ]).start();
    onPress();
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        style={[
          styles.tabButton,
          isActive && {
            backgroundColor: theme.colors.backgroundSecondary,
          },
        ]}
        onPress={handlePress}
      >
        <Text
          variant="label"
          color={isActive ? "textPrimary" : "textSecondary"}
          style={styles.tabLabel}
        >
          {label}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  safeAreaContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  tabBar: {
    flexDirection: "row",
    borderTopWidth: 1,
    backgroundColor: "#FFFFFF",
    paddingVertical: spacingPatterns.sm,
    paddingBottom:
      Platform.OS === "ios" ? spacingPatterns.md : spacingPatterns.sm,
    minHeight: 60,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacingPatterns.sm,
    paddingHorizontal: spacingPatterns.xs,
    borderRadius: borderRadius.md,
    marginHorizontal: spacingPatterns.xs,
    minHeight: 44, // Minimum touch target size
  },
  tabLabel: {
    fontWeight: "500",
  },
});
