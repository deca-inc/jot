/**
 * VoiceRecordButton - Tap-to-record button for voice transcription
 *
 * Uses on-device Whisper models via react-native-executorch or
 * platform-native speech recognition (Apple Speech / Android SpeechRecognizer).
 */

import { Ionicons } from "@expo/vector-icons";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
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
import { getModelsDirectory, scanForWhisperFiles } from "../ai/modelManager";
import { PLATFORM_STT_IDS } from "../ai/platformModels";
import { getSTTModelById } from "../ai/sttConfig";
import { useLLMContext } from "../ai/UnifiedModelProvider";
import { usePlatformModels } from "../ai/usePlatformModels";
import {
  usePlatformSpeechToText,
  type PlatformTranscriptionResult,
} from "../ai/usePlatformSpeechToText";
import {
  useRealTimeSpeechToText,
  type RealTimeTranscriptionResult,
} from "../ai/useRealTimeSpeechToText";
import {
  useRemoteSpeechToText,
  type RemoteTranscriptionResult,
} from "../ai/useRemoteSpeechToText";
import {
  useSpeechToText,
  type TranscriptionResult,
} from "../ai/useSpeechToText";
import { useModelSettings } from "../db/modelSettings";
import { useCustomModels } from "../db/useCustomModels";
import { borderRadius, spacingPatterns } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { Text } from "./Text";
import type {
  CustomLocalModelConfig,
  RemoteModelConfig,
} from "../ai/customModels";

// Check if glass effect is available (iOS 26+)
const glassAvailable = Platform.OS === "ios" && isLiquidGlassAvailable();

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

      // Amplify the level for more visible animation (levels are typically 0.05-0.15)
      // Multiply by 5 to make 0.1 → 0.5, then add base of 0.2 for idle animation
      const amplifiedLevel = Math.min(1, level * 5 + 0.2);

      // Calculate target height (minimum 0.2, maximum 1.0)
      const targetHeight = Math.max(
        0.2,
        Math.min(1, amplifiedLevel * centerFactor * variation),
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
  /** Callback when recording starts */
  onRecordingStart?: () => void;
  /** Callback when recording stops (before transcription completes) */
  onRecordingStop?: () => void;
  /** Callback when live transcript text changes */
  onTranscriptChange?: (text: string) => void;
  /** Callback when recording is cancelled */
  onCancel?: () => void;
  /** Size of the button */
  size?: "small" | "medium" | "large" | "xlarge";
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Hide the built-in chat bubble (when parent handles transcript display) */
  hideTranscriptBubble?: boolean;
}

const BUTTON_SIZES = {
  small: 36,
  medium: 44,
  large: 52,
  xlarge: 60,
};

const ICON_SIZES = {
  small: 18,
  medium: 22,
  large: 26,
  xlarge: 30,
};

// Helper to check if an STT model ID is a platform model
function isPlatformSttModelId(modelId: string): boolean {
  return Object.values(PLATFORM_STT_IDS).includes(
    modelId as (typeof PLATFORM_STT_IDS)[keyof typeof PLATFORM_STT_IDS],
  );
}

export function VoiceRecordButton({
  onTranscriptionComplete,
  onNoModelAvailable,
  onRecordingStart,
  onRecordingStop,
  onTranscriptChange,
  onCancel,
  size = "medium",
  disabled = false,
  hideTranscriptBubble = false,
}: VoiceRecordButtonProps) {
  const seasonalTheme = useSeasonalTheme();
  const modelSettings = useModelSettings();
  const llmContext = useLLMContext();
  const { hasPlatformSTT } = usePlatformModels();
  const customModels = useCustomModels();

  // State
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [hasVoiceModel, setHasVoiceModel] = useState<boolean | null>(null);
  const [hasLLMModel, setHasLLMModel] = useState(false);
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [usePlatformSTT, setUsePlatformSTT] = useState(false);
  const [useRemoteSTT, setUseRemoteSTT] = useState(false);
  const [useRealTimeSTT, setUseRealTimeSTT] = useState(false);
  const [remoteSTTModelId, setRemoteSTTModelId] = useState<string>("");

  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  // Ref for correctWithLLM to avoid stale closures
  const correctWithLLMRef = useRef<(text: string) => Promise<string>>(
    async (text) => text,
  );

  // Platform speech-to-text hook (Apple Speech / Android SpeechRecognizer)
  const platformSTT = usePlatformSpeechToText({
    onTranscriptionComplete: async (result: PlatformTranscriptionResult) => {
      // Always call onTranscriptionComplete even if text is empty
      // This ensures audio files get injected even if transcription failed
      const rawText = result.text.trim();
      const finalText = rawText ? await correctWithLLMRef.current(rawText) : "";
      onTranscriptionComplete({
        text: finalText,
        audioUri: result.audioUri,
        duration: result.duration,
      });
    },
    onError: (err) => {
      console.error("[VoiceRecordButton] Platform STT error:", err);
    },
  });

  // Whisper speech-to-text hook (react-native-executorch)
  const whisperSTT = useSpeechToText({
    onTranscriptionComplete: async (result: TranscriptionResult) => {
      if (!result.text.trim()) return;
      const finalText = await correctWithLLMRef.current(result.text);
      onTranscriptionComplete({
        text: finalText,
        audioUri: result.audioUri,
        duration: result.duration,
      });
    },
    onError: (err) => {
      console.error("[VoiceRecordButton] Whisper STT error:", err);
    },
  });

  // Remote speech-to-text hook (OpenAI, Groq, etc.) - batch mode
  const remoteSTT = useRemoteSpeechToText({
    modelId: remoteSTTModelId,
    onTranscriptionComplete: async (result: RemoteTranscriptionResult) => {
      if (!result.text.trim()) return;
      const finalText = await correctWithLLMRef.current(result.text);
      onTranscriptionComplete({
        text: finalText,
        audioUri: result.audioUri,
        duration: result.duration,
      });
    },
    onError: (err) => {
      console.error("[VoiceRecordButton] Remote STT error:", err);
    },
  });

  // Real-time speech-to-text hook (Deepgram, OpenAI Realtime) - streaming mode
  const realTimeSTT = useRealTimeSpeechToText({
    modelId: remoteSTTModelId,
    onInterimTranscript: (text: string) => {
      // Interim transcripts are handled via the hook's state
      console.log("[VoiceRecordButton] Interim transcript:", text);
    },
    onTranscriptionComplete: async (result: RealTimeTranscriptionResult) => {
      if (!result.text.trim()) return;
      const finalText = await correctWithLLMRef.current(result.text);
      onTranscriptionComplete({
        text: finalText,
        audioUri: result.audioUri,
        duration: result.duration,
      });
    },
    onError: (err) => {
      console.error("[VoiceRecordButton] Real-time STT error:", err);
    },
  });

  // Select the active STT based on mode
  const isRecording = useRealTimeSTT
    ? realTimeSTT.isRecording
    : useRemoteSTT
      ? remoteSTT.isRecording
      : usePlatformSTT
        ? platformSTT.isRecording
        : whisperSTT.isRecording;
  const isTranscribing = useRealTimeSTT
    ? realTimeSTT.isConnecting || realTimeSTT.isProcessing
    : useRemoteSTT
      ? remoteSTT.isTranscribing
      : usePlatformSTT
        ? platformSTT.isProcessing
        : whisperSTT.isTranscribing;
  const committedText = useRealTimeSTT
    ? realTimeSTT.finalText +
      (realTimeSTT.interimText ? " " + realTimeSTT.interimText : "")
    : useRemoteSTT
      ? ""
      : usePlatformSTT
        ? platformSTT.currentText
        : whisperSTT.committedText;
  const meteringLevel = useRealTimeSTT
    ? realTimeSTT.meteringLevel
    : useRemoteSTT
      ? remoteSTT.meteringLevel
      : usePlatformSTT
        ? 0.5
        : whisperSTT.meteringLevel; // Platform STT doesn't provide metering

  const stopRecording = useRealTimeSTT
    ? realTimeSTT.stopRecording
    : useRemoteSTT
      ? remoteSTT.stopRecording
      : usePlatformSTT
        ? platformSTT.stopRecording
        : whisperSTT.stopRecording;
  const cancelRecording = useRealTimeSTT
    ? realTimeSTT.cancelRecording
    : useRemoteSTT
      ? remoteSTT.cancelRecording
      : usePlatformSTT
        ? platformSTT.cancelRecording
        : whisperSTT.cancelRecording;
  const error = useRealTimeSTT
    ? realTimeSTT.error
    : useRemoteSTT
      ? remoteSTT.error
      : usePlatformSTT
        ? platformSTT.error
        : whisperSTT.error;

  // Notify parent of transcript changes
  useEffect(() => {
    onTranscriptChange?.(committedText);
  }, [committedText, onTranscriptChange]);

  // Track recording state changes to notify parent when recording stops
  const prevIsRecordingRef = useRef(false);
  useEffect(() => {
    if (prevIsRecordingRef.current && !isRecording) {
      // Recording just stopped
      onRecordingStop?.();
    }
    prevIsRecordingRef.current = isRecording;
  }, [isRecording, onRecordingStop]);

  // Ref to track recording state for AppState/cleanup handlers
  const isRecordingRef = useRef(false);
  isRecordingRef.current = isRecording;
  const cancelRecordingRef = useRef(cancelRecording);
  cancelRecordingRef.current = cancelRecording;

  // Cancel recording when app goes to background or component unmounts (screen leave)
  // We cancel (not stop) because we don't want to try processing/transcribing
  // when the user navigates away - just clean up gracefully
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState !== "active" && isRecordingRef.current) {
        console.log(
          "[VoiceRecordButton] App backgrounded, cancelling recording",
        );
        cancelRecordingRef.current();
      }
    });

    return () => {
      subscription.remove();
      // Cancel recording on unmount (e.g., navigating away from screen)
      if (isRecordingRef.current) {
        console.log("[VoiceRecordButton] Unmounting, cancelling recording");
        cancelRecordingRef.current();
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
      // Voice model available if: downloaded Whisper model OR platform STT available
      setHasVoiceModel(sttModels.length > 0 || hasPlatformSTT);
      setHasLLMModel(llmModels.length > 0);
    };
    checkModels();
  }, [modelSettings, hasPlatformSTT]);

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

  // Update the ref whenever correctWithLLM changes
  correctWithLLMRef.current = correctWithLLM;

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
   * Returns { success: boolean, usePlatform: boolean, useRemote: boolean, useRealTime: boolean, modelId?: string }
   */
  const ensureModelLoaded = useCallback(async (): Promise<{
    success: boolean;
    usePlatform: boolean;
    useRemote: boolean;
    useRealTime: boolean;
    modelId?: string;
  }> => {
    setIsModelLoading(true);

    try {
      // Get selected STT model
      const selectedId = await modelSettings.getSelectedSttModelId();

      // Helper to find and load a downloadable STT model
      const loadDownloadableModel = async () => {
        setUsePlatformSTT(false);
        const downloaded = await modelSettings.getDownloadedModels();
        const sttModel = downloaded.find(
          (m) => m.modelType === "speech-to-text",
        );
        if (!sttModel) {
          throw new Error(
            "No STT model downloaded. Please download a voice model in settings.",
          );
        }
        const config = getSTTModelById(sttModel.modelId);
        if (!config) {
          throw new Error("STT model config not found");
        }
        if (!whisperSTT.isModelLoaded) {
          await whisperSTT.loadModel(config);
        }
      };

      let shouldUsePlatform = false;

      if (!selectedId) {
        // No model selected - prefer downloaded Whisper model over platform STT
        // This way users who downloaded a Whisper model get it used by default
        const downloaded = await modelSettings.getDownloadedModels();
        const hasDownloadedSTT = downloaded.some(
          (m) => m.modelType === "speech-to-text",
        );

        if (hasDownloadedSTT) {
          console.log(
            "[VoiceRecordButton] No model selected, using downloaded Whisper model",
          );
          await loadDownloadableModel();
        } else if (hasPlatformSTT) {
          console.log(
            "[VoiceRecordButton] No model selected, no Whisper downloaded, using platform STT",
          );
          shouldUsePlatform = true;
          setUsePlatformSTT(true);
        } else {
          throw new Error(
            "No STT model available. Please download a voice model in settings.",
          );
        }
      } else if (isPlatformSttModelId(selectedId)) {
        // Platform STT selected (apple-speech or android-speech)
        console.log(`[VoiceRecordButton] Using platform STT (${selectedId})`);
        shouldUsePlatform = true;
        setUsePlatformSTT(true);
      } else {
        // Downloadable Whisper model selected (built-in or custom)
        setUsePlatformSTT(false);
        if (!whisperSTT.isModelLoaded) {
          // First try built-in STT models
          let config = getSTTModelById(selectedId);

          // If not found, check if it's a custom local STT model
          if (!config) {
            console.log(
              `[VoiceRecordButton] Built-in config not found for ${selectedId}, checking custom models`,
            );
            const customModel = await customModels.getByModelId(selectedId);

            if (
              customModel &&
              customModel.modelType === "custom-local" &&
              customModel.modelCategory === "stt"
            ) {
              const customLocalModel = customModel as CustomLocalModelConfig;
              if (!customLocalModel.isDownloaded) {
                throw new Error(
                  "Custom voice model not downloaded. Please download it first in settings.",
                );
              }

              // Scan the model folder for Whisper-style encoder/decoder files
              const whisperFiles = await scanForWhisperFiles(
                customLocalModel.folderName,
              );

              if (whisperFiles) {
                // Found encoder/decoder/tokenizer - construct config for Whisper
                const modelsDir = getModelsDirectory();
                const modelDir = `${modelsDir}/${customLocalModel.folderName}`;

                config = {
                  modelType: "speech-to-text" as const,
                  // Custom models don't use the enum, but loadModel doesn't validate this
                  modelId:
                    selectedId as unknown as import("../ai/sttConfig").STT_MODEL_IDS,
                  displayName: customLocalModel.displayName,
                  description:
                    customLocalModel.description || "Custom voice model",
                  size: customLocalModel.modelSize || "Unknown",
                  folderName: customLocalModel.folderName,
                  isMultilingual: false, // Assume English-only for custom models
                  available: true,
                  encoderFileName: whisperFiles.encoderFileName!,
                  decoderFileName: whisperFiles.decoderFileName!,
                  tokenizerFileName: whisperFiles.tokenizerFileName!,
                  encoderSource: {
                    kind: "remote" as const,
                    url: `${modelDir}/${whisperFiles.encoderFileName}`,
                  },
                  decoderSource: {
                    kind: "remote" as const,
                    url: `${modelDir}/${whisperFiles.decoderFileName}`,
                  },
                  tokenizerSource: {
                    kind: "remote" as const,
                    url: `${modelDir}/${whisperFiles.tokenizerFileName}`,
                  },
                };
                console.log(
                  `[VoiceRecordButton] Using custom STT model: ${customLocalModel.displayName}`,
                );
              } else {
                // No Whisper files found - model structure not compatible
                throw new Error(
                  `Custom voice model "${customLocalModel.displayName}" is missing required files. ` +
                    "Whisper models need encoder, decoder, and tokenizer files. " +
                    "Please ensure the model folder contains files with 'encoder' and 'decoder' in their names.",
                );
              }
            } else if (
              customModel &&
              customModel.modelType === "remote-api" &&
              customModel.modelCategory === "stt"
            ) {
              // Remote API STT model (OpenAI Whisper API, Groq, Deepgram, etc.)
              const remoteModel = customModel as RemoteModelConfig;
              if (!remoteModel.privacyAcknowledged) {
                throw new Error(
                  "Remote voice model requires privacy acknowledgment. Please enable it in settings.",
                );
              }

              // Check if URL is a WebSocket URL (implies real-time mode)
              const isRealTime =
                remoteModel.baseUrl.startsWith("wss://") ||
                remoteModel.baseUrl.startsWith("ws://");

              console.log(
                `[VoiceRecordButton] Using ${isRealTime ? "real-time" : "batch"} remote STT model: ${remoteModel.displayName}`,
              );

              // Set STT mode - no local model loading needed
              setUseRealTimeSTT(isRealTime);
              setUseRemoteSTT(!isRealTime);
              setUsePlatformSTT(false);
              setRemoteSTTModelId(selectedId);
              setIsModelLoading(false);
              return {
                success: true,
                usePlatform: false,
                useRemote: !isRealTime,
                useRealTime: isRealTime,
                modelId: selectedId,
              };
            }
          }

          if (!config) {
            throw new Error("Selected STT model config not found");
          }
          await whisperSTT.loadModel(config);
        }
      }

      setIsModelLoading(false);
      setUseRemoteSTT(false);
      setUseRealTimeSTT(false);
      return {
        success: true,
        usePlatform: shouldUsePlatform,
        useRemote: false,
        useRealTime: false,
      };
    } catch (err) {
      console.error("[VoiceRecordButton] Failed to load model:", err);
      setIsModelLoading(false);
      return {
        success: false,
        usePlatform: false,
        useRemote: false,
        useRealTime: false,
      };
    }
  }, [modelSettings, hasPlatformSTT, whisperSTT, customModels]);

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

    // Ensure model is loaded first - returns which STT to use
    const result = await ensureModelLoaded();
    if (!result.success) {
      // Model failed to load - might be corrupted, ask user to re-download
      onNoModelAvailable();
      return;
    }

    // Notify parent that recording is starting
    onRecordingStart?.();

    // Start recording using the correct STT based on what ensureModelLoaded determined
    // We call the hook functions directly here because the state update hasn't happened yet
    if (result.useRealTime) {
      // Pass modelId directly since state hasn't updated yet
      await realTimeSTT.startRecording(result.modelId);
    } else if (result.useRemote) {
      await remoteSTT.startRecording();
    } else if (result.usePlatform) {
      await platformSTT.startRecording();
    } else {
      await whisperSTT.startRecording();
    }
  }, [
    onRecordingStart,
    disabled,
    isRecording,
    isTranscribing,
    isModelLoading,
    hasVoiceModel,
    ensureModelLoaded,
    platformSTT,
    whisperSTT,
    remoteSTT,
    realTimeSTT,
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

  // Button background color - keep consistent regardless of recording state
  // The icon color changes to red when recording, not the background
  const bgColor = seasonalTheme.glassFallbackBg;

  // Glass tint color - keep consistent regardless of recording state
  const glassTintColor = seasonalTheme.cardBg;

  // Icon color - uses theme's subtle glow color when active
  const activeColor = seasonalTheme.subtleGlow.shadowColor;
  const iconColor = isActive
    ? activeColor
    : disabled
      ? seasonalTheme.textPrimary + "80"
      : seasonalTheme.textPrimary;

  // Only show transcript bubble for modes that support live/interim results
  // Hide for remote batch mode (useRemoteSTT) which has no interim transcription
  const canShowLiveTranscript = !useRemoteSTT;

  return (
    <View style={styles.container}>
      {/* Live transcription chat bubble - coming from left */}
      {/* Show bubble during recording with either committed text or "Listening..." */}
      {/* Hidden for remote batch mode since there's no interim transcription */}
      {!hideTranscriptBubble && isActive && canShowLiveTranscript && (
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
              color: committedText
                ? seasonalTheme.textPrimary
                : seasonalTheme.textSecondary,
              textAlign: "right",
              fontStyle: committedText ? "normal" : "italic",
            }}
            numberOfLines={1}
            ellipsizeMode="head"
          >
            {committedText || (isRecording ? "Listening..." : "Processing...")}
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

      {/* Main button */}
      <Animated.View
        style={[
          {
            transform: [{ scale: pulseAnim }],
          },
          Platform.select({
            ios: {
              shadowColor: activeColor,
              shadowOpacity: isActive ? 0.5 : 0,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 0 },
            },
            android: {},
          }),
        ]}
      >
        {glassAvailable ? (
          <GlassView
            glassEffectStyle="regular"
            tintColor={glassTintColor}
            style={[
              styles.glassButton,
              {
                width: buttonSize,
                height: buttonSize,
                borderRadius: buttonSize / 2,
                opacity: disabled ? 0.5 : 1,
              },
            ]}
          >
            <Pressable
              onPress={handlePress}
              onLongPress={handleLongPress}
              delayLongPress={1000}
              disabled={disabled || isLoading || isTranscribing || isCorrecting}
              style={styles.buttonPressable}
            >
              {isRecording ? (
                <WaveformBars
                  level={meteringLevel}
                  color={iconColor}
                  barWidth={size === "xlarge" ? 5 : size === "large" ? 4 : 3}
                  maxHeight={
                    size === "xlarge"
                      ? 28
                      : size === "large"
                        ? 24
                        : size === "medium"
                          ? 18
                          : 14
                  }
                  gap={size === "xlarge" ? 4 : size === "large" ? 3 : 2}
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
          </GlassView>
        ) : (
          <Pressable
            onPress={handlePress}
            onLongPress={handleLongPress}
            delayLongPress={1000}
            disabled={disabled || isLoading || isTranscribing || isCorrecting}
            style={[
              styles.button,
              styles.buttonFallback,
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
                barWidth={size === "xlarge" ? 5 : size === "large" ? 4 : 3}
                maxHeight={
                  size === "xlarge"
                    ? 28
                    : size === "large"
                      ? 24
                      : size === "medium"
                        ? 18
                        : 14
                }
                gap={size === "xlarge" ? 4 : size === "large" ? 3 : 2}
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
        )}
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
    // Ensure button doesn't get squeezed in flex layouts
    flexShrink: 0,
  },
  button: {
    alignItems: "center",
    justifyContent: "center",
  },
  glassButton: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  buttonPressable: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: "100%",
  },
  buttonFallback: {
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.1)",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
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
  errorBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    backgroundColor: "#FEE2E2",
    borderRadius: 6,
    padding: 2,
  },
});
