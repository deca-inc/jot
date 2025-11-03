import React, { useState, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Animated,
  Easing,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./Text";
import { spacingPatterns, borderRadius } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";

export type ComposerMode = "journal" | "ai";

export interface BottomComposerProps {
  mode: ComposerMode;
  onModeChange: (mode: ComposerMode) => void;
  onStartTyping?: (text: string) => void;
  onSubmit?: (text: string) => void;
}

export function BottomComposer({
  mode,
  onModeChange,
  onStartTyping,
  onSubmit,
}: BottomComposerProps) {
  const seasonalTheme = useSeasonalTheme();
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const [inputText, setInputText] = useState("");
  const glowAnimation = useRef(new Animated.Value(0)).current;

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
      ])
    );
    pulseAnimation.start();
    return () => pulseAnimation.stop();
  }, [glowAnimation]);

  const handleTextChange = (text: string) => {
    setInputText(text);

    // In journal mode, start typing triggers full-screen
    if (mode === "journal" && text.length > 0 && onStartTyping) {
      onStartTyping(text);
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
          onPress={() => onModeChange("journal")}
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
          onPress={() => onModeChange("ai")}
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
        <TextInput
          style={[
            styles.input,
            {
              color: seasonalTheme.textPrimary,
              backgroundColor: seasonalTheme.cardBg + "CC",
              borderColor: seasonalTheme.textSecondary + "30",
            },
          ]}
          placeholder={
            mode === "journal"
              ? "Write a quick thought…"
              : "Ask your private AI…"
          }
          placeholderTextColor={seasonalTheme.textSecondary + "CC"}
          value={inputText}
          onChangeText={handleTextChange}
          multiline={mode === "ai"} // Only multiline for AI mode
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
          <Text
            variant="label"
            style={{
              color: inputText.trim()
                ? seasonalTheme.chipText
                : seasonalTheme.textSecondary + "80",
              fontWeight: "600",
            }}
          >
            {mode === "journal" ? "→" : "Send"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
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
      ]}
    >
      <BlurView
        intensity={80}
        tint={colorScheme === "dark" ? "dark" : "light"}
        style={[
          styles.blurContainer,
          {
            paddingBottom:
              insets.bottom > 0 ? insets.bottom : spacingPatterns.xxs,
          },
        ]}
      >
        {content}
      </BlurView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    overflow: "hidden",
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
  input: {
    flex: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacingPatterns.sm,
    paddingVertical: spacingPatterns.xxs,
    fontSize: 16,
    borderWidth: 1,
    minHeight: 36,
    maxHeight: 100,
  },
  submitButton: {
    borderRadius: borderRadius.full,
    paddingHorizontal: spacingPatterns.sm,
    paddingVertical: spacingPatterns.xxs,
    minWidth: 50,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 36,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
});
