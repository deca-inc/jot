import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import React, { useRef, useEffect } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTrackEvent } from "../analytics";
import { type ComposerMode } from "../db/composerSettings";
import { spacingPatterns, borderRadius } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { Text } from "./Text";

export interface FooterProps {
  mode: ComposerMode;
  onModeChange: (mode: ComposerMode) => void;
}

export function Footer({ mode, onModeChange }: FooterProps) {
  const seasonalTheme = useSeasonalTheme();
  const insets = useSafeAreaInsets();
  const isDark = seasonalTheme.isDark;
  const trackEvent = useTrackEvent();

  // Animated values for the indicator
  const indicatorPosition = useRef(
    new Animated.Value(mode === "journal" ? 0 : 1),
  ).current;

  useEffect(() => {
    Animated.spring(indicatorPosition, {
      toValue: mode === "journal" ? 0 : 1,
      useNativeDriver: true, // Using native driver with transform
      tension: 80,
      friction: 12,
    }).start();
  }, [mode, indicatorPosition]);

  const handleJournalPress = () => {
    if (mode !== "journal") {
      onModeChange("journal");
      trackEvent("Switch Mode", { mode: "journal", source: "footer" });
    }
  };

  const handleAIPress = () => {
    if (mode !== "ai") {
      onModeChange("ai");
      trackEvent("Switch Mode", { mode: "ai", source: "footer" });
    }
  };

  const [tabContainerWidth, setTabContainerWidth] = React.useState(0);

  const content = (
    <View style={styles.container}>
      <View
        style={styles.tabContainer}
        onLayout={(event) => {
          const { width } = event.nativeEvent.layout;
          setTabContainerWidth(width);
        }}
      >
        <TouchableOpacity
          onPress={handleJournalPress}
          style={styles.tab}
          activeOpacity={0.7}
        >
          <Ionicons
            name={mode === "journal" ? "book" : "book-outline"}
            size={22}
            color={
              mode === "journal"
                ? seasonalTheme.textPrimary
                : seasonalTheme.textSecondary
            }
          />
          <Text
            variant="caption"
            style={{
              color:
                mode === "journal"
                  ? seasonalTheme.textPrimary
                  : seasonalTheme.textSecondary,
              fontSize: 11,
              marginTop: 2,
              fontWeight: mode === "journal" ? "600" : "400",
            }}
          >
            Notes
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleAIPress}
          style={styles.tab}
          activeOpacity={0.7}
        >
          <Ionicons
            name={mode === "ai" ? "chatbubbles" : "chatbubbles-outline"}
            size={22}
            color={
              mode === "ai"
                ? seasonalTheme.textPrimary
                : seasonalTheme.textSecondary
            }
          />
          <Text
            variant="caption"
            style={{
              color:
                mode === "ai"
                  ? seasonalTheme.textPrimary
                  : seasonalTheme.textSecondary,
              fontSize: 11,
              marginTop: 2,
              fontWeight: mode === "ai" ? "600" : "400",
            }}
          >
            Chat
          </Text>
        </TouchableOpacity>
      </View>

      {/* Animated indicator */}
      {tabContainerWidth > 0 && (
        <Animated.View
          style={[
            styles.indicator,
            {
              backgroundColor: seasonalTheme.textPrimary,
              left: spacingPatterns.screen, // Offset by the container's horizontal padding
              transform: [
                {
                  translateX: indicatorPosition.interpolate({
                    inputRange: [0, 1],
                    outputRange: [
                      tabContainerWidth * 0.25 - 20, // Center of first tab (25% of tab container width minus half indicator width)
                      tabContainerWidth * 0.75 - 20, // Center of second tab (75% of tab container width minus half indicator width)
                    ],
                  }),
                },
              ],
            },
          ]}
        />
      )}
    </View>
  );

  return (
    <View style={styles.wrapper}>
      {Platform.OS === "ios" ? (
        <BlurView
          intensity={100}
          tint={isDark ? "dark" : "light"}
          style={[
            styles.blurContainer,
            {
              paddingBottom:
                insets.bottom - (insets.bottom > 0 ? spacingPatterns.sm : 0),
            },
          ]}
        >
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: isDark
                  ? "rgba(30, 30, 30, 0.65)"
                  : "rgba(255, 255, 255, 0.65)",
              },
            ]}
          />
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                borderTopWidth: 0.5,
                borderTopColor: isDark
                  ? "rgba(255, 255, 255, 0.15)"
                  : "rgba(0, 0, 0, 0.1)",
              },
            ]}
          />
          <View style={{ zIndex: 1 }}>{content}</View>
        </BlurView>
      ) : (
        <View style={[styles.blurContainer, { paddingBottom: insets.bottom }]}>
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF",
              },
            ]}
          />
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                borderTopWidth: 0.5,
                borderTopColor: isDark
                  ? "rgba(255, 255, 255, 0.15)"
                  : "rgba(0, 0, 0, 0.1)",
              },
            ]}
          />
          <View style={{ zIndex: 1 }}>{content}</View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 15,
  },
  blurContainer: {
    borderTopWidth: 0.5,
    borderTopColor: "rgba(0, 0, 0, 0.1)",
  },
  container: {
    paddingTop: spacingPatterns.xs,
    paddingBottom: 0,
    paddingHorizontal: spacingPatterns.screen,
    position: "relative",
  },
  tabContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacingPatterns.xxs,
  },
  indicator: {
    position: "absolute",
    bottom: 0,
    width: 40,
    height: 3,
    borderRadius: borderRadius.full,
  },
});
