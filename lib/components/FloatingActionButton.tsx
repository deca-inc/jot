import React, { useRef, useEffect } from "react";
import {
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  Platform,
  View,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./Text";
import { spacingPatterns, borderRadius } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { useTrackEvent } from "../analytics";

export interface FloatingActionButtonProps {
  onPress: () => void;
  isOpen?: boolean;
  onCreateJournal?: () => void;
  onCreateAIChat?: () => void;
  onClose?: () => void;
}

export function FloatingActionButton({
  onPress,
  isOpen = false,
  onCreateJournal,
  onCreateAIChat,
  onClose,
}: FloatingActionButtonProps) {
  const seasonalTheme = useSeasonalTheme();
  const insets = useSafeAreaInsets();
  const trackEvent = useTrackEvent();
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const glowAnimation = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const menuAnim = useRef(new Animated.Value(0)).current;

  // Mount animation
  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 100,
      friction: 8,
    }).start();

    // Glow animation
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnimation, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(glowAnimation, {
          toValue: 0,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ])
    );
    pulseAnimation.start();

    return () => pulseAnimation.stop();
  }, [scaleAnim, glowAnimation]);

  // Animate menu open/close
  useEffect(() => {
    Animated.parallel([
      Animated.spring(rotateAnim, {
        toValue: isOpen ? 1 : 0,
        useNativeDriver: true,
        tension: 100,
        friction: 10,
      }),
      Animated.spring(menuAnim, {
        toValue: isOpen ? 1 : 0,
        useNativeDriver: true,
        tension: 80,
        friction: 12,
      }),
    ]).start();
  }, [isOpen, rotateAnim, menuAnim]);

  const handlePress = () => {
    trackEvent("FAB Pressed", { action: isOpen ? "close_menu" : "open_menu" });
    onPress();
  };

  const handleCreateJournal = () => {
    trackEvent("FAB Menu Item", { action: "create_journal_entry" });
    onCreateJournal?.();
  };

  const handleCreateAIChat = () => {
    trackEvent("FAB Menu Item", { action: "create_ai_chat" });
    onCreateAIChat?.();
  };

  const shadowOpacity = glowAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [seasonalTheme.isDark ? 0.4 : 0.15, seasonalTheme.isDark ? 0.6 : 0.25],
  });

  const shadowRadius = glowAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [8, 14],
  });

  const elevation = glowAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [6, 10],
  });

  // Rotate icon from + to X
  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "45deg"],
  });

  // Menu item animations
  const journalTranslateY = menuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -130],
  });

  const aiChatTranslateY = menuAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -70],
  });

  const menuItemScale = menuAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0.8, 1],
  });

  const menuItemOpacity = menuAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0.5, 1],
  });

  // Position from bottom
  const bottomPosition = insets.bottom > 0 ? insets.bottom : 0;

  return (
    <>
      {/* Backdrop for closing menu */}
      {isOpen && (
        <Pressable
          style={[StyleSheet.absoluteFill, styles.backdrop]}
          onPress={onClose}
        />
      )}

      <View style={[styles.container, { bottom: bottomPosition }]}>
        {/* Menu items */}
        <Animated.View
          style={[
            styles.menuItem,
            {
              transform: [
                { translateY: journalTranslateY },
                { scale: menuItemScale },
              ],
              opacity: menuItemOpacity,
            },
          ]}
          pointerEvents={isOpen ? "auto" : "none"}
        >
          <TouchableOpacity
            onPress={handleCreateJournal}
            style={[
              styles.menuItemButton,
              { backgroundColor: seasonalTheme.chipBg },
            ]}
            activeOpacity={0.8}
          >
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: seasonalTheme.isDark ? "#1C1C1E" : "#FFFFFF",
                  borderRadius: 24,
                },
              ]}
            />
            <Ionicons
              name="book-outline"
              size={22}
              color={seasonalTheme.chipText}
            />
          </TouchableOpacity>
          <Animated.View
            style={[
              styles.menuLabel,
              {
                backgroundColor: seasonalTheme.isDark
                  ? "rgba(30, 30, 30, 0.95)"
                  : "rgba(255, 255, 255, 0.95)",
                opacity: menuItemOpacity,
              },
            ]}
          >
            <Text
              variant="caption"
              style={{ color: seasonalTheme.textPrimary, fontWeight: "600" }}
            >
              New Entry
            </Text>
          </Animated.View>
        </Animated.View>

        <Animated.View
          style={[
            styles.menuItem,
            {
              transform: [
                { translateY: aiChatTranslateY },
                { scale: menuItemScale },
              ],
              opacity: menuItemOpacity,
            },
          ]}
          pointerEvents={isOpen ? "auto" : "none"}
        >
          <TouchableOpacity
            onPress={handleCreateAIChat}
            style={[
              styles.menuItemButton,
              { backgroundColor: seasonalTheme.chipBg },
            ]}
            activeOpacity={0.8}
          >
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: seasonalTheme.isDark ? "#1C1C1E" : "#FFFFFF",
                  borderRadius: 24,
                },
              ]}
            />
            <Ionicons
              name="chatbubbles-outline"
              size={22}
              color={seasonalTheme.chipText}
            />
          </TouchableOpacity>
          <Animated.View
            style={[
              styles.menuLabel,
              {
                backgroundColor: seasonalTheme.isDark
                  ? "rgba(30, 30, 30, 0.95)"
                  : "rgba(255, 255, 255, 0.95)",
                opacity: menuItemOpacity,
              },
            ]}
          >
            <Text
              variant="caption"
              style={{ color: seasonalTheme.textPrimary, fontWeight: "600" }}
            >
              New Chat
            </Text>
          </Animated.View>
        </Animated.View>

        {/* Main FAB button */}
        <Animated.View
          style={{
            transform: [{ scale: scaleAnim }],
          }}
        >
          <Animated.View
            style={Platform.select({
              ios: {
                shadowColor: "#000",
                shadowOpacity,
                shadowRadius,
                shadowOffset: { width: 0, height: 6 },
              },
              android: {},
            })}
          >
            <TouchableOpacity
              onPress={handlePress}
              style={[
                styles.button,
                {
                  backgroundColor: seasonalTheme.isDark ? "#1C1C1E" : "#FFFFFF",
                  elevation: Platform.OS === "android" ? 8 : 0,
                },
              ]}
              activeOpacity={0.8}
            >
              <Animated.View style={{ transform: [{ rotate }] }}>
                <Ionicons name="add" size={28} color={seasonalTheme.chipText} />
              </Animated.View>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    zIndex: 9,
  },
  container: {
    position: "absolute",
    right: spacingPatterns.screen,
    zIndex: 10,
    alignItems: "center",
  },
  button: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  menuItem: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    right: 0,
  },
  menuItemButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  menuLabel: {
    position: "absolute",
    right: 56,
    paddingHorizontal: spacingPatterns.sm,
    paddingVertical: spacingPatterns.xs,
    borderRadius: borderRadius.md,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
});
