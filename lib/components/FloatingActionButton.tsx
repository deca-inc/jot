import React, { useRef, useEffect } from "react";
import {
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  Platform,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { spacingPatterns, borderRadius } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { useTrackEvent } from "../analytics";

export interface FloatingActionButtonProps {
  onPress: () => void;
  scrollX?: Animated.Value;
  screenWidth?: number;
}

export function FloatingActionButton({
  onPress,
  scrollX,
  screenWidth,
}: FloatingActionButtonProps) {
  const seasonalTheme = useSeasonalTheme();
  const insets = useSafeAreaInsets();
  const trackEvent = useTrackEvent();
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const glowAnimation = useRef(new Animated.Value(0)).current;

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

  const handlePress = () => {
    trackEvent("FAB Pressed", { action: "create_journal_entry" });
    onPress();
  };

  const shadowOpacity = glowAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 0.6],
  });

  const shadowRadius = glowAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 20],
  });

  const elevation = glowAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 16],
  });

  // Calculate footer height: paddingTop (8) + tab padding top (4) + icon (22) + text marginTop (2) + text (~15) + tab padding bottom (4) + paddingBottom (4) + safe area
  // Note: Footer reduces paddingBottom by spacingPatterns.sm (12px) when safe area is present to avoid excessive spacing
  const footerHeightBase = 8 + 4 + 22 + 2 + 15 + 4 + 4;
  const safeAreaAdjustment =
    insets.bottom > 0 ? insets.bottom - spacingPatterns.sm : 0;
  const footerHeight = footerHeightBase + safeAreaAdjustment;
  // Position FAB: footer height + margin above footer (16px)
  const bottomPosition = footerHeight + 16;

  // Scale down as user swipes away from journal page
  const swipeScale =
    scrollX && screenWidth
      ? scrollX.interpolate({
          inputRange: [0, screenWidth],
          outputRange: [1, 0], // Full size at journal page, invisible at AI page
          extrapolate: "clamp",
        })
      : 1;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          bottom: bottomPosition,
          transform: [
            { scale: scaleAnim },
            { scale: swipeScale }, // Additional scale based on swipe
          ],
        },
      ]}
    >
      <Animated.View
        style={{
          shadowColor: "#000",
          shadowOpacity,
          shadowRadius,
          shadowOffset: { width: 0, height: 6 },
          elevation,
        }}
      >
        <TouchableOpacity
          onPress={handlePress}
          style={[
            styles.button,
            {
              backgroundColor: seasonalTheme.chipBg,
            },
          ]}
          activeOpacity={0.8}
        >
          {/* Solid backdrop layer to ensure full opacity */}
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: seasonalTheme.isDark ? "#1C1C1E" : "#FFFFFF",
                borderRadius: 28,
              },
            ]}
          />
          <Ionicons name="add" size={28} color={seasonalTheme.chipText} />
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    right: spacingPatterns.screen,
    zIndex: 10,
  },
  button: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
      },
      android: {
        elevation: 12,
      },
    }),
  },
});
