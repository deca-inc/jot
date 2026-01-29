/**
 * useRemoteSpeechToText - Hook for remote speech-to-text transcription
 *
 * Records audio using expo-audio and sends to a remote API (OpenAI, Groq, etc.)
 * for transcription. Unlike the local STT hook, this sends audio to external
 * servers which requires privacy acknowledgment.
 *
 * Key differences from useSpeechToText:
 * - No on-device model loading required
 * - Sends complete audio file to remote API after recording stops
 * - Requires network connectivity
 * - Privacy: audio leaves the device
 */

import {
  useAudioRecorder,
  useAudioRecorderState,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  IOSOutputFormat,
  AudioQuality,
  type RecordingOptions,
} from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { useCallback, useRef, useState } from "react";
import { Platform } from "react-native";
import {
  isPCMRecordingAvailable,
  isPCMRecording,
  startPCMRecording,
  stopPCMRecording,
  cancelPCMRecording,
  getPCMMeteringLevel,
} from "../../modules/platform-ai/src";
import { useCustomModels } from "../db/useCustomModels";
import { getApiKey } from "./apiKeyStorage";
import {
  sendRemoteTranscription,
  type RemoteSTTDependencies,
} from "./remoteSTTSender";
import type { RemoteModelConfig } from "./customModels";

// Audio recording settings for Whisper (16kHz mono WAV)
// Same as local STT for consistency
export const WHISPER_REMOTE_RECORDING_OPTIONS: RecordingOptions = {
  extension: ".wav",
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 256000,
  isMeteringEnabled: true,
  android: {
    outputFormat: "default",
    audioEncoder: "default",
  },
  ios: {
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: AudioQuality.HIGH,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: "audio/wav",
    bitsPerSecond: 256000,
  },
};

export interface UseRemoteSpeechToTextOptions {
  /** Remote STT model ID (e.g., "remote-openai-whisper") */
  modelId: string;
  /** ISO 639-1 language code (e.g., "en", "fr") */
  language?: string;
  /** Callback when transcription completes */
  onTranscriptionComplete?: (result: RemoteTranscriptionResult) => void;
  /** Callback on error */
  onError?: (error: string) => void;
}

export interface RemoteTranscriptionResult {
  /** The transcribed text */
  text: string;
  /** URI to the audio file (for saving as attachment) */
  audioUri: string | null;
  /** Duration of the recording in seconds (estimated) */
  duration: number;
}

export interface UseRemoteSpeechToTextResult {
  /** Whether currently recording audio */
  isRecording: boolean;
  /** Whether currently transcribing (uploading and processing) */
  isTranscribing: boolean;
  /** Last transcription result */
  transcription: RemoteTranscriptionResult | null;
  /** Audio metering level (0-1) for visualization */
  meteringLevel: number;
  /** Start recording audio */
  startRecording: () => Promise<void>;
  /** Stop recording and send for transcription */
  stopRecording: () => Promise<RemoteTranscriptionResult>;
  /** Cancel recording without transcribing */
  cancelRecording: () => Promise<void>;
  /** Any error that occurred */
  error: string | null;
}

export function useRemoteSpeechToText(
  options: UseRemoteSpeechToTextOptions,
): UseRemoteSpeechToTextResult {
  const { modelId, language, onTranscriptionComplete, onError } = options;

  // State
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcription, setTranscription] =
    useState<RemoteTranscriptionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [androidMeteringLevel, setAndroidMeteringLevel] = useState(0);

  // Custom models repository for getting model config
  const customModels = useCustomModels();

  // Audio recorder from expo-audio
  const audioRecorder = useAudioRecorder(WHISPER_REMOTE_RECORDING_OPTIONS);

  // Get real-time recorder state for metering on iOS (polls every 50ms)
  const recorderState = useAudioRecorderState(audioRecorder, 50);

  // Refs
  const isRecordingRef = useRef(false);
  const recordingStartTimeRef = useRef<number>(0);
  const androidMeteringIntervalRef = useRef<ReturnType<
    typeof setInterval
  > | null>(null);

  // Callbacks refs to avoid stale closures
  const onTranscriptionCompleteRef = useRef(onTranscriptionComplete);
  onTranscriptionCompleteRef.current = onTranscriptionComplete;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // Convert metering dB to normalized 0-1 level
  const meteringLevel = (() => {
    if (!isRecording) return 0;

    if (Platform.OS === "android") {
      return androidMeteringLevel;
    }

    // iOS: convert dB to linear
    if (recorderState.metering === undefined) return 0;
    const db = recorderState.metering;
    // Clamp between -60 and 0, then normalize to 0-1
    const clamped = Math.max(-60, Math.min(0, db));
    return (clamped + 60) / 60;
  })();

  // Create dependencies for remote STT sender
  const getRemoteSTTDependencies = useCallback((): RemoteSTTDependencies => {
    return {
      getModelConfig: async (id: string) => {
        const config = await customModels.getByModelId(id);
        if (!config || config.modelType !== "remote-api") {
          return null;
        }
        return config as RemoteModelConfig;
      },
      getApiKey: async (keyRef: string) => {
        return getApiKey(keyRef);
      },
    };
  }, [customModels]);

  /**
   * Start recording audio
   */
  const startRecording = useCallback(async () => {
    if (isRecording) {
      console.warn("[useRemoteSpeechToText] Already recording");
      return;
    }

    try {
      setError(null);
      setTranscription(null);

      // Request permissions
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        const msg = "Microphone permission not granted";
        setError(msg);
        onErrorRef.current?.(msg);
        return;
      }

      // Configure audio session for recording
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      recordingStartTimeRef.current = Date.now();

      if (Platform.OS === "android" && isPCMRecordingAvailable()) {
        // Android: Use native PCM recording for proper WAV files
        const cacheDir = (FileSystem.cacheDirectory || "").replace(
          /^file:\/\//,
          "",
        );
        const recordingPath = `${cacheDir}remote_recording_${Date.now()}.wav`;
        await startPCMRecording(recordingPath);

        // Start metering polling for Android
        androidMeteringIntervalRef.current = setInterval(async () => {
          try {
            const level = await getPCMMeteringLevel();
            setAndroidMeteringLevel(level);
          } catch {
            // Ignore metering errors
          }
        }, 50);
      } else {
        // iOS: Use expo-audio
        await audioRecorder.prepareToRecordAsync();
        audioRecorder.record();
      }

      setIsRecording(true);
      isRecordingRef.current = true;

      console.log("[useRemoteSpeechToText] Recording started");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to start recording";
      console.error("[useRemoteSpeechToText] Start error:", message);
      setError(message);
      setIsRecording(false);
      isRecordingRef.current = false;
      onErrorRef.current?.(message);
    }
  }, [isRecording, audioRecorder]);

  /**
   * Stop recording and send to remote API for transcription
   */
  const stopRecording =
    useCallback(async (): Promise<RemoteTranscriptionResult> => {
      const emptyResult: RemoteTranscriptionResult = {
        text: "",
        audioUri: null,
        duration: 0,
      };

      // Stop Android metering polling
      if (androidMeteringIntervalRef.current) {
        clearInterval(androidMeteringIntervalRef.current);
        androidMeteringIntervalRef.current = null;
        setAndroidMeteringLevel(0);
      }

      if (!isRecording) {
        return emptyResult;
      }

      try {
        isRecordingRef.current = false;
        setIsRecording(false);
        setIsTranscribing(true);

        // Stop recording and get audio file
        let audioUri: string | null = null;

        if (Platform.OS === "android" && isPCMRecordingAvailable()) {
          const isActive = await isPCMRecording();
          if (isActive) {
            const result = await stopPCMRecording();
            audioUri = `file://${result.path}`;
          }
        } else {
          await audioRecorder.stop();
          audioUri = audioRecorder.uri;
        }

        if (!audioUri) {
          throw new Error("No audio recorded");
        }

        // Calculate duration
        const duration = (Date.now() - recordingStartTimeRef.current) / 1000;

        console.log(
          `[useRemoteSpeechToText] Sending ${Math.round(duration)}s audio to remote API`,
        );

        // Send to remote API - pass file URI directly for React Native
        // (avoids Blob from ArrayBuffer limitation in RN)
        const dependencies = getRemoteSTTDependencies();
        const transcriptionResult = await sendRemoteTranscription(
          modelId,
          audioUri,
          { language },
          dependencies,
        );

        const result: RemoteTranscriptionResult = {
          text: transcriptionResult.text,
          audioUri,
          duration,
        };

        setTranscription(result);
        setIsTranscribing(false);

        // Reset audio mode
        await setAudioModeAsync({
          allowsRecording: false,
        });

        console.log(
          "[useRemoteSpeechToText] Transcription complete:",
          result.text,
        );
        onTranscriptionCompleteRef.current?.(result);

        return result;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to transcribe";
        console.error("[useRemoteSpeechToText] Transcription error:", message);
        setError(message);
        setIsTranscribing(false);
        onErrorRef.current?.(message);

        // Reset audio mode
        try {
          await setAudioModeAsync({
            allowsRecording: false,
          });
        } catch {
          // Ignore
        }

        return emptyResult;
      }
    }, [
      isRecording,
      audioRecorder,
      modelId,
      language,
      getRemoteSTTDependencies,
    ]);

  /**
   * Cancel recording without transcribing
   */
  const cancelRecording = useCallback(async () => {
    // Stop Android metering polling
    if (androidMeteringIntervalRef.current) {
      clearInterval(androidMeteringIntervalRef.current);
      androidMeteringIntervalRef.current = null;
      setAndroidMeteringLevel(0);
    }

    isRecordingRef.current = false;

    if (isRecording) {
      try {
        if (Platform.OS === "android" && isPCMRecordingAvailable()) {
          await cancelPCMRecording();
        } else {
          await audioRecorder.stop();
          // Clean up temp file
          if (audioRecorder.uri) {
            await FileSystem.deleteAsync(audioRecorder.uri, {
              idempotent: true,
            });
          }
        }
      } catch {
        // Ignore errors during cancel
      }
    }

    setIsRecording(false);
    setIsTranscribing(false);
    setTranscription(null);

    // Reset audio mode
    try {
      await setAudioModeAsync({
        allowsRecording: false,
      });
    } catch {
      // Ignore
    }

    console.log("[useRemoteSpeechToText] Recording cancelled");
  }, [isRecording, audioRecorder]);

  return {
    isRecording,
    isTranscribing,
    transcription,
    meteringLevel,
    startRecording,
    stopRecording,
    cancelRecording,
    error,
  };
}
