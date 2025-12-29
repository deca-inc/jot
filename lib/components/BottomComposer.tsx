import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTrackEvent } from "../analytics";
import { type ComposerMode } from "../db/composerSettings";
import { spacingPatterns, borderRadius } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { ComposerInput } from "./ComposerInput";
import { Text } from "./Text";

export interface BottomComposerProps {
  mode: ComposerMode;
  onModeChange: (mode: ComposerMode) => void;
  onStartTyping?: (text: string) => void;
  onSubmit?: (text: string) => void;
  isKeyboardVisible?: boolean;
}

export function BottomComposer({
  mode,
  onModeChange,
  onStartTyping,
  onSubmit,
  isKeyboardVisible = false,
}: BottomComposerProps) {
  const seasonalTheme = useSeasonalTheme();
  const insets = useSafeAreaInsets();
  const isDark = seasonalTheme.isDark;
  const [inputText, setInputText] = useState("");
  const glowAnimation = useRef(new Animated.Value(0)).current;
  const trackEvent = useTrackEvent();

  // Slow pulsing glow animation with smooth easing
  useEffect(() => {
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnimation, {
          toValue: 1,
          duration: 4000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(glowAnimation, {
          toValue: 0,
          duration: 4000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ]),
    );
    pulseAnimation.start();
    return () => pulseAnimation.stop();
  }, [glowAnimation]);

  const handleTextChange = (text: string) => {
    setInputText(text);

    // In journal mode, start typing triggers full-screen
    if (mode === "journal" && text.length > 0 && onStartTyping) {
      onStartTyping(text);
      setInputText(""); // Clear input after triggering full editor
    }
  };

  const handleSubmit = () => {
    if (inputText.trim() && onSubmit) {
      onSubmit(inputText.trim());
      setInputText("");
    }
  };

  const content = (
    <View style={[styles.container, { paddingBottom: spacingPatterns.xs }]}>
      {/* Mode selector row */}
      <View style={styles.modeRow}>
        <TouchableOpacity
          onPress={() => {
            onModeChange("journal");
            trackEvent("Switch Composer Mode", { mode: "journal" });
          }}
          style={[
            styles.modeToggle,
            mode === "journal" && {
              backgroundColor: seasonalTheme.chipBg,
            },
          ]}
        >
          <Ionicons
            name={mode === "journal" ? "book" : "book-outline"}
            size={16}
            color={
              mode === "journal"
                ? seasonalTheme.chipText
                : seasonalTheme.textSecondary
            }
            style={{ marginRight: spacingPatterns.xs }}
          />
          <Text
            variant="label"
            style={{
              color:
                mode === "journal"
                  ? seasonalTheme.chipText
                  : seasonalTheme.textSecondary,
              fontWeight: mode === "journal" ? "600" : "400",
            }}
          >
            Journal
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            onModeChange("ai");
            trackEvent("Switch Composer Mode", { mode: "ai" });
          }}
          style={[
            styles.modeToggle,
            mode === "ai" && {
              backgroundColor: seasonalTheme.chipBg,
            },
          ]}
        >
          <Ionicons
            name={mode === "ai" ? "chatbubbles" : "chatbubbles-outline"}
            size={16}
            color={
              mode === "ai"
                ? seasonalTheme.chipText
                : seasonalTheme.textSecondary
            }
            style={{ marginRight: spacingPatterns.xs }}
          />
          <Text
            variant="label"
            style={{
              color:
                mode === "ai"
                  ? seasonalTheme.chipText
                  : seasonalTheme.textSecondary,
              fontWeight: mode === "ai" ? "600" : "400",
            }}
          >
            AI
          </Text>
        </TouchableOpacity>
      </View>

      {/* Input row */}
      <View style={[styles.inputRow, { marginTop: spacingPatterns.xxs }]}>
        <ComposerInput
          placeholder={
            mode === "journal"
              ? "Write a quick thought…"
              : "Ask your private AI…"
          }
          value={inputText}
          onChangeText={handleTextChange}
          multiline={true} // Always multiline for consistent height
          onSubmitEditing={mode === "ai" ? handleSubmit : undefined}
          returnKeyType={mode === "ai" ? "send" : "default"}
        />
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={!inputText.trim()}
          style={[
            styles.submitButton,
            !inputText.trim() && styles.submitButtonDisabled,
            {
              backgroundColor: inputText.trim()
                ? seasonalTheme.chipBg
                : seasonalTheme.textSecondary + "20",
            },
          ]}
        >
          <Ionicons
            name="send"
            size={18}
            color={
              inputText.trim()
                ? seasonalTheme.chipText
                : seasonalTheme.textSecondary + "80"
            }
          />
        </TouchableOpacity>
      </View>
    </View>
  );

  const peekHeight = 16; // How much the glow peeks up above the composer edge

  return (
    <View
      style={[
        styles.outerWrapper,
        { paddingTop: peekHeight },
        // Remove overflow hidden on iOS to allow filler to extend
        Platform.OS === "ios" && { overflow: "visible" },
      ]}
    >
      {/* Animated blob glow positioned to peek up over the composer */}
      {/* Positioned at top of outerWrapper to peek above */}
      <Animated.View
        style={[
          styles.wrapper,
          {
            shadowColor: seasonalTheme.subtleGlow.shadowColor,
            shadowOpacity: glowAnimation.interpolate({
              inputRange: [0, 1],
              outputRange: [
                seasonalTheme.subtleGlow.shadowOpacity * 0.7,
                seasonalTheme.subtleGlow.shadowOpacity * 1.3,
              ],
            }),
            shadowRadius: glowAnimation.interpolate({
              inputRange: [0, 1],
              outputRange: [20, 32],
            }),
            shadowOffset: { width: 0, height: -4 },
          },
          // Remove overflow hidden on iOS to allow filler to extend
          Platform.OS === "ios" && { overflow: "visible" },
        ]}
      >
        {Platform.OS === "ios" ? (
          // iOS: BlurView with liquid glass effect
          <BlurView
            intensity={100}
            tint={isDark ? "dark" : "light"}
            style={[
              styles.blurContainer,
              {
                paddingBottom: isKeyboardVisible
                  ? spacingPatterns.sm
                  : insets.bottom > 0
                  ? insets.bottom
                  : spacingPatterns.xxs,
              },
            ]}
          >
            {/* iOS: Liquid Glass effect with frosted glass appearance */}
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: isDark
                    ? "rgba(30, 30, 30, 0.65)"
                    : "rgba(255, 255, 255, 0.65)",
                  borderTopLeftRadius: borderRadius.xl,
                  borderTopRightRadius: borderRadius.xl,
                },
              ]}
            />
            {/* Subtle border for glass effect */}
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  borderTopWidth: 0.5,
                  borderTopColor: isDark
                    ? "rgba(255, 255, 255, 0.15)"
                    : "rgba(0, 0, 0, 0.1)",
                  borderTopLeftRadius: borderRadius.xl,
                  borderTopRightRadius: borderRadius.xl,
                },
              ]}
            />
            {/* Filler element to cover gap between composer and rounded keyboard */}
            <View
              style={{
                position: "absolute",
                bottom: -200, // Extend well below the composer
                left: 0,
                right: 0,
                height: 200,
                backgroundColor: isDark
                  ? "rgba(30, 30, 30, 0.65)"
                  : "rgba(255, 255, 255, 0.65)",
              }}
            />
            <View style={{ zIndex: 1 }}>{content}</View>
          </BlurView>
        ) : (
          // Android: Solid background (BlurView doesn't work well)
          <View
            style={[
              styles.blurContainer,
              {
                paddingBottom: isKeyboardVisible
                  ? spacingPatterns.xxs
                  : insets.bottom > 0
                  ? insets.bottom
                  : spacingPatterns.xxs,
              },
            ]}
          >
            {/* Solid opaque background layer */}
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: isDark
                    ? "#1C1C1E" // iOS dark gray
                    : "#FFFFFF", // Pure white
                  borderTopLeftRadius: borderRadius.xl,
                  borderTopRightRadius: borderRadius.xl,
                },
              ]}
            />
            <View style={{ zIndex: 1 }}>{content}</View>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerWrapper: {
    position: "relative",
    zIndex: 1,
    overflow: "hidden", // Enable overflow hidden as requested
  },
  wrapper: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "transparent", // Allow glow to show through
  },
  blurContainer: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    width: "100%",
  },
  container: {
    paddingHorizontal: spacingPatterns.md,
    paddingTop: spacingPatterns.sm,
    paddingBottom: 0,
  },
  modeRow: {
    flexDirection: "row",
    gap: spacingPatterns.xs,
    marginBottom: spacingPatterns.xs,
  },
  modeToggle: {
    flex: 1,
    flexDirection: "row",
    paddingVertical: spacingPatterns.xxs,
    paddingHorizontal: spacingPatterns.xs,
    borderRadius: borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacingPatterns.xs,
  },
  submitButton: {
    borderRadius: borderRadius.full,
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
});
