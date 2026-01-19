/**
 * VoiceRecordButton - Tap-to-record button for voice transcription
 *
 * Uses on-device Whisper models via react-native-executorch for
 * speech-to-text transcription.
 */

import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  AppState,
  Dimensions,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { getSTTModelById } from "../ai/sttConfig";
import { useLLMContext } from "../ai/UnifiedModelProvider";
import {
  useSpeechToText,
  type TranscriptionResult,
} from "../ai/useSpeechToText";
import { useModelSettings } from "../db/modelSettings";
import { borderRadius, spacingPatterns } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { Text } from "./Text";

// Number of waveform bars
const NUM_BARS = 5;

/**
 * Animated waveform bars that respond to audio level
 */
function WaveformBars({
  level,
  color,
  barWidth = 3,
  maxHeight = 20,
  gap = 2,
}: {
  level: number;
  color: string;
  barWidth?: number;
  maxHeight?: number;
  gap?: number;
}) {
  // Create animated values for each bar with smooth transitions
  const barAnimations = useRef(
    Array.from({ length: NUM_BARS }, () => new Animated.Value(0.2)),
  ).current;

  // Track previous values for smooth interpolation
  const prevLevelRef = useRef(0);

  useEffect(() => {
    // Add some variation to each bar based on the level
    // Center bars are taller, edge bars are shorter
    const animations = barAnimations.map((anim, i) => {
      // Create a bell curve effect - center bars respond more
      const centerDistance = Math.abs(i - (NUM_BARS - 1) / 2);
      const centerFactor = 1 - (centerDistance / ((NUM_BARS - 1) / 2)) * 0.4;

      // Add slight variation to each bar
      const variation = 0.8 + Math.sin(i * 1.5 + Date.now() / 200) * 0.2;

      // Calculate target height (minimum 0.15, maximum 1.0)
      const targetHeight = Math.max(
        0.15,
        Math.min(1, level * centerFactor * variation),
      );

      return Animated.timing(anim, {
        toValue: targetHeight,
        duration: 80, // Smooth but responsive
        easing: Easing.out(Easing.ease),
        useNativeDriver: false, // Height changes need layout
      });
    });

    Animated.parallel(animations).start();
    prevLevelRef.current = level;
  }, [level, barAnimations]);

  const totalWidth = NUM_BARS * barWidth + (NUM_BARS - 1) * gap;

  return (
    <View
      style={[
        styles.waveformContainer,
        { width: totalWidth, height: maxHeight },
      ]}
    >
      {barAnimations.map((anim, i) => (
        <Animated.View
          key={i}
          style={[
            styles.waveformBar,
            {
              width: barWidth,
              backgroundColor: color,
              marginHorizontal: gap / 2,
              height: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [4, maxHeight],
              }),
            },
          ]}
        />
      ))}
    </View>
  );
}

export interface VoiceRecordButtonResult {
  /** The transcribed and corrected text */
  text: string;
  /** URI to the audio file (in cache, needs to be saved as attachment) */
  audioUri: string | null;
  /** Duration of the recording in seconds */
  duration: number;
}

export interface VoiceRecordButtonProps {
  /** Callback when transcription completes with final text and audio file */
  onTranscriptionComplete: (result: VoiceRecordButtonResult) => void;
  /** Callback when no voice model is downloaded - should open model manager */
  onNoModelAvailable: () => void;
  /** Callback when recording is cancelled */
  onCancel?: () => void;
  /** Size of the button */
  size?: "small" | "medium" | "large";
  /** Whether the button is disabled */
  disabled?: boolean;
}

const BUTTON_SIZES = {
  small: 36,
  medium: 44,
  large: 52,
};

const ICON_SIZES = {
  small: 18,
  medium: 22,
  large: 26,
};

export function VoiceRecordButton({
  onTranscriptionComplete,
  onNoModelAvailable,
  onCancel,
  size = "medium",
  disabled = false,
}: VoiceRecordButtonProps) {
  const seasonalTheme = useSeasonalTheme();
  const modelSettings = useModelSettings();
  const llmContext = useLLMContext();

  // State
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [hasVoiceModel, setHasVoiceModel] = useState<boolean | null>(null);
  const [hasLLMModel, setHasLLMModel] = useState(false);
  const [isCorrecting, setIsCorrecting] = useState(false);

  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  // Speech-to-text hook
  const {
    isModelLoaded,
    isRecording,
    isTranscribing,
    committedText,
    meteringLevel,
    loadModel,
    startRecording,
    stopRecording,
    cancelRecording,
    error,
  } = useSpeechToText({
    onTranscriptionComplete: async (result: TranscriptionResult) => {
      // Only process if we have actual text
      if (!result.text.trim()) return;

      // Try to correct with LLM if available
      const finalText = await correctWithLLM(result.text);

      // Pass the result with corrected text
      onTranscriptionComplete({
        text: finalText,
        audioUri: result.audioUri,
        duration: result.duration,
      });
    },
    onError: (err) => {
      console.error("[VoiceRecordButton] Error:", err);
    },
  });

  // Ref to track recording state for AppState handler
  const isRecordingRef = useRef(false);
  isRecordingRef.current = isRecording;
  const stopRecordingRef = useRef(stopRecording);
  stopRecordingRef.current = stopRecording;

  // Stop recording when app goes to background or component unmounts (screen leave)
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState !== "active" && isRecordingRef.current) {
        console.log("[VoiceRecordButton] App backgrounded, stopping recording");
        stopRecordingRef.current();
      }
    });

    return () => {
      subscription.remove();
      // Stop recording on unmount (e.g., navigating away from screen)
      if (isRecordingRef.current) {
        console.log("[VoiceRecordButton] Unmounting, stopping recording");
        stopRecordingRef.current();
      }
    };
  }, []);

  // Check if voice model and LLM are downloaded on mount
  useEffect(() => {
    const checkModels = async () => {
      const downloaded = await modelSettings.getDownloadedModels();
      const sttModels = downloaded.filter(
        (m) => m.modelType === "speech-to-text",
      );
      const llmModels = downloaded.filter((m) => m.modelType === "llm");
      setHasVoiceModel(sttModels.length > 0);
      setHasLLMModel(llmModels.length > 0);
    };
    checkModels();
  }, [modelSettings]);

  /**
   * Correct transcription using LLM for better grammar and accuracy
   */
  const correctWithLLM = useCallback(
    async (rawText: string): Promise<string> => {
      if (!hasLLMModel || !rawText.trim()) {
        return rawText;
      }

      try {
        setIsCorrecting(true);

        const correctedText = await llmContext.sendMessage([
          {
            role: "user",
            content: `You are a transcription corrector. Fix any grammar, punctuation, and obvious transcription errors in the following text. Keep the meaning and tone exactly the same. Only output the corrected text, nothing else.\n\nTranscription: "${rawText}"`,
          },
        ]);

        setIsCorrecting(false);
        return correctedText.trim() || rawText;
      } catch (err) {
        console.error("[VoiceRecordButton] LLM correction failed:", err);
        setIsCorrecting(false);
        return rawText; // Fallback to raw transcription
      }
    },
    [hasLLMModel, llmContext],
  );

  // Start pulse animation when recording
  useEffect(() => {
    if (isRecording) {
      pulseAnimRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      pulseAnimRef.current.start();
    } else {
      pulseAnimRef.current?.stop();
      pulseAnim.setValue(1);
    }

    return () => {
      pulseAnimRef.current?.stop();
    };
  }, [isRecording, pulseAnim]);

  /**
   * Load STT model if downloaded but not loaded
   */
  const ensureModelLoaded = useCallback(async () => {
    if (isModelLoaded) return true;

    setIsModelLoading(true);

    try {
      // Get selected STT model
      const selectedId = await modelSettings.getSelectedSttModelId();
      if (!selectedId) {
        // No model selected, use first downloaded STT model
        const downloaded = await modelSettings.getDownloadedModels();
        const sttModel = downloaded.find(
          (m) => m.modelType === "speech-to-text",
        );
        if (!sttModel) {
          throw new Error("No STT model downloaded");
        }
        const config = getSTTModelById(sttModel.modelId);
        if (!config) {
          throw new Error("STT model config not found");
        }
        await loadModel(config);
      } else {
        const config = getSTTModelById(selectedId);
        if (!config) {
          throw new Error("Selected STT model config not found");
        }
        await loadModel(config);
      }

      setIsModelLoading(false);
      return true;
    } catch (err) {
      console.error("[VoiceRecordButton] Failed to load model:", err);
      setIsModelLoading(false);
      return false;
    }
  }, [isModelLoaded, modelSettings, loadModel]);

  /**
   * Handle tap - toggle recording (tap to start, tap to stop)
   */
  const handlePress = useCallback(async () => {
    if (disabled || isModelLoading) return;

    // If already recording, stop and transcribe
    if (isRecording) {
      await stopRecording();
      return;
    }

    // If transcribing, ignore
    if (isTranscribing) return;

    // Check if voice model is downloaded
    if (!hasVoiceModel) {
      // Open model manager to voice tab
      onNoModelAvailable();
      return;
    }

    // Ensure model is loaded first
    const loaded = await ensureModelLoaded();
    if (!loaded) {
      // Model failed to load - might be corrupted, ask user to re-download
      onNoModelAvailable();
      return;
    }

    // Start recording
    await startRecording();
  }, [
    disabled,
    isRecording,
    isTranscribing,
    isModelLoading,
    hasVoiceModel,
    ensureModelLoaded,
    startRecording,
    stopRecording,
    onNoModelAvailable,
  ]);

  /**
   * Handle long press - cancel recording without transcribing
   */
  const handleLongPress = useCallback(async () => {
    if (isRecording || isTranscribing) {
      await cancelRecording();
      onCancel?.();
    }
  }, [isRecording, isTranscribing, cancelRecording, onCancel]);

  // Determine button state and appearance
  const buttonSize = BUTTON_SIZES[size];
  const iconSize = ICON_SIZES[size];

  const isActive = isRecording || isTranscribing || isCorrecting;
  const isLoading = isModelLoading;

  // Button background color
  const bgColor = isActive
    ? seasonalTheme.isDark
      ? "rgba(220, 38, 38, 0.2)" // Red tint when recording
      : "rgba(220, 38, 38, 0.1)"
    : seasonalTheme.isDark
      ? "rgba(255, 255, 255, 0.1)"
      : "rgba(0, 0, 0, 0.05)";

  // Icon color
  const iconColor = isActive
    ? "#DC2626" // Red when recording
    : disabled
      ? seasonalTheme.textSecondary + "80"
      : seasonalTheme.textSecondary;

  return (
    <View style={styles.container}>
      {/* Live transcription chat bubble - coming from left */}
      {isActive && committedText && (
        <View
          style={[
            styles.chatBubble,
            {
              backgroundColor: seasonalTheme.isDark
                ? "rgba(60, 60, 60, 0.95)"
                : "rgba(240, 240, 240, 0.95)",
              // Position bubble to the left of the button, up to 75% screen width
              width:
                Dimensions.get("window").width * 0.75 -
                spacingPatterns.lg -
                buttonSize,
              right: buttonSize + spacingPatterns.sm,
            },
          ]}
        >
          <Text
            variant="body"
            style={{
              color: seasonalTheme.textPrimary,
              textAlign: "right",
            }}
            numberOfLines={1}
            ellipsizeMode="head"
          >
            {committedText}
          </Text>
          {/* Speech bubble tail pointing right toward the mic button */}
          <View
            style={[
              styles.chatBubbleTail,
              {
                borderLeftColor: seasonalTheme.isDark
                  ? "rgba(60, 60, 60, 0.95)"
                  : "rgba(240, 240, 240, 0.95)",
              },
            ]}
          />
        </View>
      )}

      {/* Loading/Correcting indicator */}
      {(isLoading || isCorrecting) && (
        <View
          style={[
            styles.loadingBadge,
            {
              backgroundColor: seasonalTheme.isDark
                ? "rgba(30, 30, 30, 0.95)"
                : "rgba(255, 255, 255, 0.95)",
            },
          ]}
        >
          <Text
            variant="caption"
            style={{ color: seasonalTheme.textSecondary }}
          >
            {isCorrecting ? "Correcting..." : "Loading..."}
          </Text>
        </View>
      )}

      {/* Main button */}
      <Animated.View
        style={[
          {
            transform: [{ scale: pulseAnim }],
          },
          Platform.select({
            ios: {
              shadowColor: "#DC2626",
              shadowOpacity: isActive ? 0.4 : 0,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 0 },
            },
            android: {},
          }),
        ]}
      >
        <Pressable
          onPress={handlePress}
          onLongPress={handleLongPress}
          delayLongPress={1000}
          disabled={disabled || isLoading || isTranscribing || isCorrecting}
          style={[
            styles.button,
            {
              width: buttonSize,
              height: buttonSize,
              borderRadius: buttonSize / 2,
              backgroundColor: bgColor,
              opacity: disabled ? 0.5 : 1,
            },
          ]}
        >
          {isRecording ? (
            <WaveformBars
              level={meteringLevel}
              color={iconColor}
              barWidth={size === "large" ? 4 : 3}
              maxHeight={size === "large" ? 24 : size === "medium" ? 18 : 14}
              gap={size === "large" ? 3 : 2}
            />
          ) : (
            <Ionicons
              name={
                isTranscribing || isCorrecting
                  ? "hourglass-outline"
                  : "mic-outline"
              }
              size={iconSize}
              color={iconColor}
            />
          )}
        </Pressable>
      </Animated.View>

      {/* Error indicator */}
      {error && (
        <View style={styles.errorBadge}>
          <Ionicons name="alert-circle" size={12} color="#DC2626" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  button: {
    alignItems: "center",
    justifyContent: "center",
  },
  waveformContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  waveformBar: {
    borderRadius: 2,
  },
  chatBubble: {
    position: "absolute",
    paddingHorizontal: spacingPatterns.md,
    paddingVertical: spacingPatterns.sm,
    borderRadius: borderRadius.lg,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  chatBubbleTail: {
    position: "absolute",
    right: -8,
    top: "50%",
    marginTop: -6,
    width: 0,
    height: 0,
    borderTopWidth: 6,
    borderBottomWidth: 6,
    borderLeftWidth: 8,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
  },
  loadingBadge: {
    position: "absolute",
    bottom: "100%",
    marginBottom: spacingPatterns.xs,
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
  errorBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    backgroundColor: "#FEE2E2",
    borderRadius: 6,
    padding: 2,
  },
});
