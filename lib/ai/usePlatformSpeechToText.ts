/**
 * usePlatformSpeechToText - Hook for platform-native speech-to-text
 *
 * Uses Apple Speech Recognition on iOS or Android SpeechRecognizer on Android.
 * No model download required - uses built-in system speech recognition.
 * Also records audio in parallel for saving voice notes.
 */

import {
  useAudioRecorder,
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
  getPlatformTranscription,
  isPlatformSTTAvailable,
  requestSpeechPermission,
  startPlatformSpeechRecognition,
  stopPlatformSpeechRecognition,
  cancelPlatformSpeechRecognition,
} from "../../modules/platform-ai/src";

// Audio recording settings (16kHz mono WAV for consistency with Whisper)
const RECORDING_OPTIONS: RecordingOptions = {
  extension: ".wav",
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 256000,
  isMeteringEnabled: false,
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

export interface UsePlatformSpeechToTextOptions {
  /** Callback when transcription completes */
  onTranscriptionComplete?: (result: PlatformTranscriptionResult) => void;
  /** Callback on error */
  onError?: (error: string) => void;
  /** Optional locale (e.g., "en-US") */
  locale?: string;
}

export interface PlatformTranscriptionResult {
  /** The transcribed text */
  text: string;
  /** URI to the recorded audio file */
  audioUri: string | null;
  /** Duration of the recording in seconds */
  duration: number;
}

export interface UsePlatformSpeechToTextResult {
  /** Whether the platform STT is available */
  isAvailable: boolean;
  /** Whether currently recording/transcribing */
  isRecording: boolean;
  /** Whether processing/finalizing the recording */
  isProcessing: boolean;
  /** Current transcription text (partial results) */
  currentText: string;
  /** Start recording and transcribing */
  startRecording: () => Promise<void>;
  /** Stop recording and get final transcription */
  stopRecording: () => Promise<PlatformTranscriptionResult>;
  /** Cancel recording without transcribing */
  cancelRecording: () => Promise<void>;
  /** Any error that occurred */
  error: string | null;
}

// Polling interval for partial results (ms)
const POLLING_INTERVAL = 100;

export function usePlatformSpeechToText(
  options: UsePlatformSpeechToTextOptions = {},
): UsePlatformSpeechToTextResult {
  const { onTranscriptionComplete, onError, locale } = options;

  // State
  const [isAvailable, setIsAvailable] = useState(true); // Assume available initially
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentText, setCurrentText] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Audio recorder - only used on iOS
  // Android SpeechRecognizer needs exclusive microphone access, so no parallel audio recording
  const iosAudioRecorder = useAudioRecorder(RECORDING_OPTIONS);

  // Refs
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const startTimeRef = useRef<number>(0);
  const isRecordingRef = useRef(false);

  // Callback refs to avoid stale closures
  const onTranscriptionCompleteRef = useRef(onTranscriptionComplete);
  onTranscriptionCompleteRef.current = onTranscriptionComplete;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  /**
   * Poll for partial transcription results
   */
  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current) return;

    pollingIntervalRef.current = setInterval(async () => {
      if (!isRecordingRef.current) return;

      try {
        const status = await getPlatformTranscription();
        setCurrentText(status.text);

        // If final, stop polling
        if (status.isFinal) {
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
        }
      } catch {
        // Ignore polling errors
      }
    }, POLLING_INTERVAL);
  }, []);

  /**
   * Stop polling for results
   */
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  /**
   * Start recording and transcribing
   */
  const startRecording = useCallback(async () => {
    if (isRecording) {
      console.warn("[usePlatformSpeechToText] Already recording");
      return;
    }

    try {
      setError(null);
      setCurrentText("");

      // Check if platform STT is available
      const available = await isPlatformSTTAvailable();
      setIsAvailable(available);
      if (!available) {
        throw new Error("Platform speech recognition is not available");
      }

      // Request microphone permission
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        throw new Error("Microphone permission not granted");
      }

      // Request speech recognition permission
      const speechGranted = await requestSpeechPermission();
      if (!speechGranted) {
        throw new Error("Speech recognition permission not granted");
      }

      // Configure audio session
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      // Start audio recording
      // NOTE: On Android, we can't record audio in parallel with SpeechRecognizer
      // because they both need exclusive microphone access. Audio recording only works on iOS.
      if (Platform.OS === "ios") {
        // iOS: Use the hook-managed recorder
        await iosAudioRecorder.prepareToRecordAsync();
        iosAudioRecorder.record();
      }
      // Android: Skip audio recording - SpeechRecognizer needs exclusive mic access

      // Start speech recognition (runs in parallel with audio recording)
      await startPlatformSpeechRecognition(locale);

      startTimeRef.current = Date.now();
      setIsRecording(true);
      isRecordingRef.current = true;

      // Start polling for partial results
      startPolling();

      console.log("[usePlatformSpeechToText] Recording started");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to start recording";
      console.error("[usePlatformSpeechToText] Start error:", message);
      setError(message);
      setIsRecording(false);
      isRecordingRef.current = false;
      onErrorRef.current?.(message);
    }
  }, [isRecording, locale, startPolling]);

  /**
   * Stop recording and get final transcription
   */
  const stopRecording =
    useCallback(async (): Promise<PlatformTranscriptionResult> => {
      const emptyResult: PlatformTranscriptionResult = {
        text: "",
        audioUri: null,
        duration: 0,
      };

      // Stop polling
      stopPolling();
      isRecordingRef.current = false;

      if (!isRecording) {
        return {
          text: currentText,
          audioUri: null,
          duration: 0,
        };
      }

      // Enter processing state
      setIsRecording(false);
      setIsProcessing(true);

      try {
        // Stop audio recording first (iOS only - Android doesn't record audio)
        let tempAudioUri: string | null = null;
        if (Platform.OS === "ios") {
          await iosAudioRecorder.stop();
          tempAudioUri = iosAudioRecorder.uri;
        }
        // Android: No audio recording to stop

        // Stop speech recognition and get final text
        const finalText = await stopPlatformSpeechRecognition();

        setCurrentText(finalText);

        // Reset audio mode
        await setAudioModeAsync({
          allowsRecording: false,
        });

        // Calculate duration
        const duration = (Date.now() - startTimeRef.current) / 1000;

        // Copy audio file to a stable location
        let audioUri: string | null = null;
        if (tempAudioUri) {
          try {
            const outputUri = `${FileSystem.cacheDirectory}recording_${Date.now()}.wav`;
            await FileSystem.copyAsync({ from: tempAudioUri, to: outputUri });
            audioUri = outputUri;
            console.log(
              `[usePlatformSpeechToText] Audio saved to ${outputUri}`,
            );
          } catch (copyErr) {
            console.error(
              "[usePlatformSpeechToText] Failed to copy audio:",
              copyErr,
            );
          }
        }

        const result: PlatformTranscriptionResult = {
          text: finalText,
          audioUri,
          duration,
        };

        // Done processing
        setIsProcessing(false);

        console.log(
          "[usePlatformSpeechToText] Transcription complete:",
          finalText,
        );
        onTranscriptionCompleteRef.current?.(result);

        return result;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to stop recording";
        console.error("[usePlatformSpeechToText] Stop error:", message);
        setError(message);
        setIsRecording(false);
        setIsProcessing(false);
        onErrorRef.current?.(message);

        return emptyResult;
      }
    }, [isRecording, currentText, stopPolling]);

  /**
   * Cancel recording without transcribing
   */
  const cancelRecording = useCallback(async () => {
    // Stop polling
    stopPolling();
    isRecordingRef.current = false;

    if (isRecording) {
      // Stop audio recording (iOS only - Android doesn't record audio)
      if (Platform.OS === "ios") {
        try {
          await iosAudioRecorder.stop();
          // Delete the temp file
          if (iosAudioRecorder.uri) {
            await FileSystem.deleteAsync(iosAudioRecorder.uri, {
              idempotent: true,
            });
          }
        } catch {
          // Ignore errors during cancel
        }
      }

      // Cancel speech recognition
      try {
        await cancelPlatformSpeechRecognition();
      } catch {
        // Ignore errors during cancel
      }
    }

    // Reset state
    setIsRecording(false);
    setCurrentText("");

    // Reset audio mode
    try {
      await setAudioModeAsync({
        allowsRecording: false,
      });
    } catch {
      // Ignore
    }

    console.log("[usePlatformSpeechToText] Recording cancelled");
  }, [isRecording, stopPolling]);

  return {
    isAvailable,
    isRecording,
    isProcessing,
    currentText,
    startRecording,
    stopRecording,
    cancelRecording,
    error,
  };
}
