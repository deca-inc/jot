/**
 * useRealTimeSpeechToText - Hook for real-time speech-to-text transcription
 *
 * Records audio using expo-audio and streams to a real-time STT API (Deepgram, OpenAI)
 * via WebSocket for live transcription. Provides interim results as the user speaks.
 *
 * Key differences from useRemoteSpeechToText:
 * - Streams audio in real-time via WebSocket (not batch after recording)
 * - Provides interim transcription results during recording
 * - Requires a provider that supports WebSocket streaming (Deepgram, OpenAI Realtime)
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
import { useCallback, useEffect, useRef, useState } from "react";
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
import { detectRealTimeProvider, getRealTimeConfig } from "./realTimeProviders";
import { RealTimeSTTClient, type TranscriptEvent } from "./realTimeSTTClient";
import type { RemoteModelConfig } from "./customModels";

// Audio recording settings for real-time streaming (16kHz mono PCM)
export const REALTIME_RECORDING_OPTIONS: RecordingOptions = {
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

export interface UseRealTimeSpeechToTextOptions {
  /** Remote STT model ID (e.g., "remote-deepgram-nova") */
  modelId: string;
  /** ISO 639-1 language code (e.g., "en", "fr") */
  language?: string;
  /** Callback when interim transcript updates */
  onInterimTranscript?: (text: string) => void;
  /** Callback when final transcription completes */
  onTranscriptionComplete?: (result: RealTimeTranscriptionResult) => void;
  /** Callback on error */
  onError?: (error: string) => void;
}

export interface RealTimeTranscriptionResult {
  /** The transcribed text */
  text: string;
  /** URI to the audio file (for saving as attachment) */
  audioUri: string | null;
  /** Duration of the recording in seconds (estimated) */
  duration: number;
}

export interface UseRealTimeSpeechToTextResult {
  /** Whether currently recording and streaming audio */
  isRecording: boolean;
  /** Whether currently connecting to WebSocket */
  isConnecting: boolean;
  /** Whether processing/waiting for final transcription after recording stopped */
  isProcessing: boolean;
  /** Interim (in-progress) transcription text */
  interimText: string;
  /** Final (committed) transcription text */
  finalText: string;
  /** Audio metering level (0-1) for visualization */
  meteringLevel: number;
  /** Start recording and streaming. Pass modelId to override the hook's modelId. */
  startRecording: (overrideModelId?: string) => Promise<void>;
  /** Stop recording and finalize transcription */
  stopRecording: () => Promise<RealTimeTranscriptionResult>;
  /** Cancel recording without saving */
  cancelRecording: () => Promise<void>;
  /** Any error that occurred */
  error: string | null;
}

export function useRealTimeSpeechToText(
  options: UseRealTimeSpeechToTextOptions,
): UseRealTimeSpeechToTextResult {
  const {
    modelId,
    language,
    onInterimTranscript,
    onTranscriptionComplete,
    onError,
  } = options;

  // State
  const [isRecording, setIsRecording] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [finalText, setFinalText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [androidMeteringLevel, setAndroidMeteringLevel] = useState(0);

  // Custom models repository for getting model config
  const customModels = useCustomModels();

  // Audio recorder from expo-audio
  const audioRecorder = useAudioRecorder(REALTIME_RECORDING_OPTIONS);

  // Get real-time recorder state for metering on iOS (polls every 50ms)
  const recorderState = useAudioRecorderState(audioRecorder, 50);

  // Refs
  const clientRef = useRef<RealTimeSTTClient | null>(null);
  const isRecordingRef = useRef(false);
  const recordingStartTimeRef = useRef<number>(0);
  const androidMeteringIntervalRef = useRef<ReturnType<
    typeof setInterval
  > | null>(null);
  const streamingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  // For tracking the final transcription when sending audio at end
  const transcriptionResolveRef = useRef<((text: string) => void) | null>(null);
  const accumulatedTextRef = useRef<string>("");
  // For chunk streaming - track how much of the file we've sent
  const lastSentBytesRef = useRef<number>(0);
  const audioFilePathRef = useRef<string>("");

  // Callbacks refs to avoid stale closures
  const onInterimTranscriptRef = useRef(onInterimTranscript);
  onInterimTranscriptRef.current = onInterimTranscript;
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clientRef.current?.disconnect();
      if (androidMeteringIntervalRef.current) {
        clearInterval(androidMeteringIntervalRef.current);
      }
      if (streamingIntervalRef.current) {
        clearInterval(streamingIntervalRef.current);
      }
    };
  }, []);

  /**
   * Start recording and streaming audio to the WebSocket
   * @param overrideModelId - Optional modelId to use instead of the hook's modelId (useful when state hasn't updated yet)
   */
  const startRecording = useCallback(
    async (overrideModelId?: string) => {
      if (isRecording) {
        console.warn("[useRealTimeSpeechToText] Already recording");
        return;
      }

      const effectiveModelId = overrideModelId || modelId;

      try {
        setError(null);
        setInterimText("");
        setFinalText("");
        setIsConnecting(true);

        // Request microphone permission FIRST before any other setup
        const { granted } = await requestRecordingPermissionsAsync();
        if (!granted) {
          throw new Error("Microphone permission not granted");
        }

        // Get model config
        const config = await customModels.getByModelId(effectiveModelId);
        if (!config || config.modelType !== "remote-api") {
          throw new Error("Model not found or not a remote model");
        }
        const remoteConfig = config as RemoteModelConfig;

        if (!remoteConfig.privacyAcknowledged) {
          throw new Error("Privacy not acknowledged for this model");
        }

        // Check if provider supports real-time
        const provider = detectRealTimeProvider(remoteConfig.baseUrl);
        if (!provider) {
          throw new Error("This provider does not support real-time streaming");
        }

        // Get API key
        const apiKey = await getApiKey(remoteConfig.apiKeyRef);
        if (!apiKey) {
          throw new Error("API key not found");
        }

        // Get WebSocket config - pass user's baseUrl so it's used directly if it's a WebSocket URL
        const wsConfig = getRealTimeConfig(provider, apiKey, {
          baseUrl: remoteConfig.baseUrl,
          language,
          modelName: remoteConfig.modelName,
        });

        // Create and connect WebSocket client
        const client = new RealTimeSTTClient(wsConfig);

        // Set up event handlers
        client.on("transcript", (event: TranscriptEvent) => {
          if (event.isFinal) {
            const newText = event.text.trim();
            if (newText) {
              setFinalText((prev) => prev + (prev ? " " : "") + newText);
              // Accumulate for the resolve callback
              accumulatedTextRef.current = (
                accumulatedTextRef.current +
                " " +
                newText
              ).trim();
              // If we're waiting for transcription after sending audio, resolve
              if (transcriptionResolveRef.current) {
                transcriptionResolveRef.current(accumulatedTextRef.current);
                transcriptionResolveRef.current = null;
              }
            }
            setInterimText("");
          } else {
            setInterimText(event.text);
            onInterimTranscriptRef.current?.(event.text);
          }
        });

        client.on("error", (msg) => {
          console.error("[useRealTimeSpeechToText] WebSocket error:", msg);
          setError(msg);
          onErrorRef.current?.(msg);
        });

        await client.connect();
        clientRef.current = client;
        accumulatedTextRef.current = ""; // Reset accumulated text

        // Configure audio session for recording
        await setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
        });

        recordingStartTimeRef.current = Date.now();

        // Reset chunk streaming state
        lastSentBytesRef.current = 0;
        audioFilePathRef.current = "";

        if (Platform.OS === "android" && isPCMRecordingAvailable()) {
          // Android: Use native PCM recording
          const cacheDir = (FileSystem.cacheDirectory || "").replace(
            /^file:\/\//,
            "",
          );
          const recordingPath = `${cacheDir}realtime_recording_${Date.now()}.wav`;
          audioFilePathRef.current = recordingPath;
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

        // Start streaming audio chunks to WebSocket (for Deepgram real-time)
        // Poll the audio file every 250ms and send new data
        if (provider === "deepgram") {
          streamingIntervalRef.current = setInterval(async () => {
            if (!isRecordingRef.current || !clientRef.current?.isConnected()) {
              return;
            }

            try {
              // Get the audio file path
              const filePath =
                Platform.OS === "android"
                  ? audioFilePathRef.current
                  : audioRecorder.uri?.replace("file://", "") || "";

              if (!filePath) return;

              // Read the file info to get current size
              const fileInfo = await FileSystem.getInfoAsync(
                `file://${filePath}`,
              );
              if (!fileInfo.exists || !("size" in fileInfo)) return;

              const currentSize = fileInfo.size;
              const lastSent = lastSentBytesRef.current;

              // Skip if no new data (need at least 1KB of new data)
              if (currentSize <= lastSent + 1024) return;

              // Read the entire file as base64
              const base64Audio = await FileSystem.readAsStringAsync(
                `file://${filePath}`,
                {
                  encoding: FileSystem.EncodingType.Base64,
                },
              );

              // Convert to binary
              const binaryString = atob(base64Audio);
              const fullData = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                fullData[i] = binaryString.charCodeAt(i);
              }

              // Determine start offset (skip WAV header on first chunk)
              let startOffset = lastSent;
              if (lastSent === 0) {
                // First chunk - check for WAV header
                const isWav =
                  fullData.length > 44 &&
                  fullData[0] === 0x52 &&
                  fullData[1] === 0x49 &&
                  fullData[2] === 0x46 &&
                  fullData[3] === 0x46;
                if (isWav) {
                  startOffset = 44; // Skip WAV header
                }
              }

              // Extract new data
              if (startOffset < fullData.length) {
                const newData = fullData.slice(startOffset);
                if (newData.length > 0) {
                  console.log(
                    `[useRealTimeSpeechToText] Streaming ${newData.length} bytes`,
                  );
                  clientRef.current.sendAudio(newData, false); // Don't commit yet
                  lastSentBytesRef.current = fullData.length;
                }
              }
            } catch (err) {
              // Ignore errors during streaming - file might be locked
              console.warn("[useRealTimeSpeechToText] Streaming error:", err);
            }
          }, 250); // Stream every 250ms
        }

        setIsConnecting(false);
        setIsRecording(true);
        isRecordingRef.current = true;

        console.log("[useRealTimeSpeechToText] Recording started");
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to start recording";
        console.error("[useRealTimeSpeechToText] Start error:", message);
        setError(message);
        setIsConnecting(false);
        setIsRecording(false);
        isRecordingRef.current = false;
        onErrorRef.current?.(message);

        // Cleanup
        clientRef.current?.disconnect();
        clientRef.current = null;
      }
    },
    [isRecording, modelId, language, customModels, audioRecorder],
  );

  /**
   * Stop recording and finalize transcription
   */
  const stopRecording =
    useCallback(async (): Promise<RealTimeTranscriptionResult> => {
      const emptyResult: RealTimeTranscriptionResult = {
        text: "",
        audioUri: null,
        duration: 0,
      };

      // Stop intervals
      if (androidMeteringIntervalRef.current) {
        clearInterval(androidMeteringIntervalRef.current);
        androidMeteringIntervalRef.current = null;
        setAndroidMeteringLevel(0);
      }
      if (streamingIntervalRef.current) {
        clearInterval(streamingIntervalRef.current);
        streamingIntervalRef.current = null;
      }

      if (!isRecording) {
        return emptyResult;
      }

      try {
        isRecordingRef.current = false;
        setIsRecording(false);
        setIsProcessing(true); // Show processing indicator while waiting for final transcription

        // Stop recording and capture audio URI
        let audioUri: string | null = null;

        if (Platform.OS === "android" && isPCMRecordingAvailable()) {
          const isActive = await isPCMRecording();
          if (isActive) {
            const pcmResult = await stopPCMRecording();
            audioUri = `file://${pcmResult.path}`;
          }
        } else {
          await audioRecorder.stop();
          audioUri = audioRecorder.uri;
        }

        // Calculate duration
        const duration = (Date.now() - recordingStartTimeRef.current) / 1000;

        // For Deepgram: We've been streaming chunks during recording, so we have interim results.
        // Just wait a moment for any final results to come in.
        // For other providers: Send the complete audio now.
        let transcribedText = accumulatedTextRef.current;

        if (clientRef.current?.isConnected() && audioUri) {
          try {
            const audioPath = audioUri.replace("file://", "");
            const base64Audio = await FileSystem.readAsStringAsync(audioPath, {
              encoding: FileSystem.EncodingType.Base64,
            });

            // Convert base64 to Uint8Array
            const binaryString = atob(base64Audio);
            let audioData = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              audioData[i] = binaryString.charCodeAt(i);
            }

            // Check if we've already streamed most of this data
            const alreadySent = lastSentBytesRef.current;

            if (alreadySent > 0 && alreadySent >= audioData.length - 1024) {
              // Already streamed during recording, just wait for final results
              console.log(
                "[useRealTimeSpeechToText] Already streamed, waiting for final results...",
              );

              // Give Deepgram a moment to finalize (they use endpointing)
              await new Promise((resolve) => setTimeout(resolve, 500));
              transcribedText = accumulatedTextRef.current;
            } else {
              // Haven't streamed yet (or have significant new data) - send now
              console.log(
                "[useRealTimeSpeechToText] Sending audio for transcription...",
              );

              // Strip WAV header if present
              const isWav =
                audioData.length > 44 &&
                audioData[0] === 0x52 &&
                audioData[1] === 0x49 &&
                audioData[2] === 0x46 &&
                audioData[3] === 0x46;

              const startOffset =
                alreadySent > 0 ? alreadySent : isWav ? 44 : 0;
              if (startOffset < audioData.length) {
                audioData = audioData.slice(startOffset);
              }

              if (audioData.length > 0) {
                console.log(
                  `[useRealTimeSpeechToText] Sending ${audioData.length} bytes to WebSocket...`,
                );

                // Create a promise that resolves when we get the final transcription
                const transcriptionPromise = new Promise<string>((resolve) => {
                  transcriptionResolveRef.current = resolve;

                  // Timeout after 10 seconds
                  setTimeout(() => {
                    if (transcriptionResolveRef.current) {
                      console.log(
                        "[useRealTimeSpeechToText] Transcription timeout, using accumulated text",
                      );
                      transcriptionResolveRef.current = null;
                      resolve(accumulatedTextRef.current);
                    }
                  }, 10000);
                });

                // Send remaining audio data
                clientRef.current.sendAudio(audioData, true);

                // Wait for transcription
                transcribedText = await transcriptionPromise;
              }
            }

            console.log(
              "[useRealTimeSpeechToText] Final transcription:",
              transcribedText,
            );
          } catch (readError) {
            console.error(
              "[useRealTimeSpeechToText] Error reading/sending audio:",
              readError,
            );
            // Fall back to any text we already have
          }
        }

        // Disconnect WebSocket
        clientRef.current?.disconnect();
        clientRef.current = null;

        // Combine with any interim text if no transcription received
        const combinedText =
          transcribedText ||
          (finalText + (interimText ? " " + interimText : "")).trim();

        const result: RealTimeTranscriptionResult = {
          text: combinedText,
          audioUri,
          duration,
        };

        // Reset audio mode
        await setAudioModeAsync({
          allowsRecording: false,
        });

        console.log(
          "[useRealTimeSpeechToText] Recording stopped:",
          result.text,
        );
        setIsProcessing(false);
        onTranscriptionCompleteRef.current?.(result);

        return result;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to stop recording";
        console.error("[useRealTimeSpeechToText] Stop error:", message);
        setError(message);
        setIsProcessing(false);
        onErrorRef.current?.(message);

        // Disconnect WebSocket on error
        clientRef.current?.disconnect();
        clientRef.current = null;

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
    }, [isRecording, audioRecorder, finalText, interimText]);

  /**
   * Cancel recording without transcribing
   */
  const cancelRecording = useCallback(async () => {
    // Stop intervals
    if (androidMeteringIntervalRef.current) {
      clearInterval(androidMeteringIntervalRef.current);
      androidMeteringIntervalRef.current = null;
      setAndroidMeteringLevel(0);
    }
    if (streamingIntervalRef.current) {
      clearInterval(streamingIntervalRef.current);
      streamingIntervalRef.current = null;
    }

    isRecordingRef.current = false;

    // Disconnect WebSocket
    clientRef.current?.disconnect();
    clientRef.current = null;

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
    setIsConnecting(false);
    setIsProcessing(false);
    setInterimText("");
    setFinalText("");

    // Reset audio mode
    try {
      await setAudioModeAsync({
        allowsRecording: false,
      });
    } catch {
      // Ignore
    }

    console.log("[useRealTimeSpeechToText] Recording cancelled");
  }, [isRecording, audioRecorder]);

  return {
    isRecording,
    isConnecting,
    isProcessing,
    interimText,
    finalText,
    meteringLevel,
    startRecording,
    stopRecording,
    cancelRecording,
    error,
  };
}
