import React, { useState, useRef, useEffect } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  Platform,
  Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { ComposerInput } from "./ComposerInput";
import { spacingPatterns, borderRadius } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { useTrackEvent } from "../analytics";

export interface AIComposerInputProps {
  onSubmit?: (text: string) => void;
  isKeyboardVisible?: boolean;
  visible?: boolean;
  scrollX?: Animated.Value;
  screenWidth?: number;
}

export function AIComposerInput({
  onSubmit,
  isKeyboardVisible = false,
  visible = true,
  scrollX,
  screenWidth,
}: AIComposerInputProps) {
  const seasonalTheme = useSeasonalTheme();
  const insets = useSafeAreaInsets();
  const isDark = seasonalTheme.isDark;
  const [inputText, setInputText] = useState("");
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const glowAnimation = useRef(new Animated.Value(0)).current;
  // Initialize to hidden position (positive = down, below footer)
  const slideAnimation = useRef(new Animated.Value(100)).current;
  const trackEvent = useTrackEvent();

  // Glow animation
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
      ])
    );
    pulseAnimation.start();
    return () => pulseAnimation.stop();
  }, [glowAnimation]);

  // Slide animation when visibility changes
  useEffect(() => {
    if (visible) {
      // Delay showing by 200ms to let screen transition complete
      const timer = setTimeout(() => {
        Animated.timing(slideAnimation, {
          toValue: 0, // Slide to visible position
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      }, 200);
      return () => clearTimeout(timer);
    } else {
      // Hide immediately when switching away
      Animated.timing(slideAnimation, {
        toValue: 100, // Slide down below footer
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [visible, slideAnimation]);

  // Track keyboard height
  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const keyboardWillShow = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });

    const keyboardWillHide = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      keyboardWillShow.remove();
      keyboardWillHide.remove();
    };
  }, []);

  const handleSubmit = () => {
    if (inputText.trim() && onSubmit) {
      trackEvent("AI Message Sent", { length: inputText.length });
      onSubmit(inputText.trim());
      setInputText("");
    }
  };

  const content = (
    <View style={styles.container}>
      <View style={styles.inputRow}>
        <ComposerInput
          placeholder="Ask your private AI…"
          value={inputText}
          onChangeText={setInputText}
          multiline={true}
          onSubmitEditing={handleSubmit}
          returnKeyType="send"
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

  // Calculate the footer height (padding + tab content + safe area)
  // Footer has: paddingTop (8) + tab padding top (4) + icon (22) + text marginTop (2) + text (~15) + tab padding bottom (4) + paddingBottom (4) + safe area
  // Note: Footer reduces paddingBottom by spacingPatterns.sm (12px) when safe area is present to avoid excessive spacing
  const footerHeightBase = 8 + 4 + 22 + 2 + 15 + 4 + 4;
  const safeAreaAdjustment =
    insets.bottom > 0 ? insets.bottom - spacingPatterns.sm : 0;
  const footerHeight = footerHeightBase + safeAreaAdjustment + 2; // Base + adjusted safe area + 2px extra spacing

  // Determine final position: above keyboard if open, above footer otherwise
  // On Android, keyboard height includes the navigation bar area, so add bottom inset when open
  // When closed, Android needs the container's bottom padding added to position correctly
  const containerBottomPadding = spacingPatterns.sm;
  let targetBottomPosition;
  if (keyboardHeight > 0) {
    // When keyboard is open
    targetBottomPosition =
      Platform.OS === "android"
        ? keyboardHeight + insets.bottom
        : keyboardHeight;
  } else {
    // When keyboard is closed - Android needs extra bottom padding
    targetBottomPosition =
      Platform.OS === "android"
        ? footerHeight + containerBottomPadding
        : footerHeight;
  }
  const hiddenOffset = 200; // How far down to hide it

  // Slide in based on swipe progress: starts at 45% of swipe for better timing
  const swipeTranslateY =
    scrollX && screenWidth
      ? scrollX.interpolate({
          inputRange: [0, screenWidth * 0.45, screenWidth], // Starts moving at 45%, fully up at 100%
          outputRange: [hiddenOffset, hiddenOffset * 0.4, 0], // Gradual slide: hidden -> partially up -> fully visible
          extrapolate: "clamp",
        })
      : hiddenOffset;

  // Combine swipe animation with visibility animation
  const combinedTranslateY =
    scrollX && screenWidth
      ? Animated.add(
          slideAnimation.interpolate({
            inputRange: [0, 100],
            outputRange: [0, hiddenOffset], // Additional offset when not visible
          }),
          swipeTranslateY
        )
      : slideAnimation.interpolate({
          inputRange: [0, 100],
          outputRange: [0, hiddenOffset], // 0 = visible at targetBottom, hiddenOffset = hidden below
        });

  return (
    <Animated.View
      style={[
        styles.wrapper,
        {
          bottom: targetBottomPosition, // Dynamic position based on keyboard
          left: 0,
          right: 0,
          transform: [
            {
              translateY: combinedTranslateY, // Slide animation
            },
          ],
          opacity: slideAnimation.interpolate({
            inputRange: [0, 100],
            outputRange: [1, 0],
          }),
        },
      ]}
      pointerEvents={visible ? "auto" : "none"}
    >
      <Animated.View
        style={{
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
        }}
      >
        {Platform.OS === "ios" ? (
          <BlurView
            intensity={100}
            tint={isDark ? "dark" : "light"}
            style={styles.blurContainer}
          >
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: isDark
                    ? "rgba(30, 30, 30, 0.85)"
                    : "rgba(255, 255, 255, 0.85)",
                  borderRadius: 0,
                },
              ]}
            />
            <View style={{ zIndex: 1 }}>{content}</View>
          </BlurView>
        ) : (
          <View style={styles.blurContainer}>
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF",
                  borderRadius: 0,
                  elevation: 8,
                },
              ]}
            />
            <View style={{ zIndex: 1 }}>{content}</View>
          </View>
        )}
      </Animated.View>

      {/* Extension to fill curved keyboard area - sibling to main content */}
      {Platform.OS === "ios" ? (
        <BlurView
          intensity={100}
          tint={isDark ? "dark" : "light"}
          style={styles.keyboardExtension}
        >
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: isDark
                  ? "rgba(30, 30, 30, 0.85)"
                  : "rgba(255, 255, 255, 0.85)",
              },
            ]}
          />
        </BlurView>
      ) : (
        <View
          style={[
            styles.keyboardExtension,
            { backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF" },
          ]}
        />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    borderRadius: 0,
    overflow: "visible", // Allow extension to extend beyond bounds
    zIndex: 8,
  },
  blurContainer: {
    borderRadius: 0,
    width: "100%",
    overflow: "hidden", // Clip the blur, but not the extension
  },
  container: {
    paddingHorizontal: spacingPatterns.md,
    paddingVertical: spacingPatterns.sm,
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
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  keyboardExtension: {
    position: "absolute",
    top: "100%", // Position right below the content
    left: 0,
    right: 0,
    height: 80,
    width: "100%",
  },
});
