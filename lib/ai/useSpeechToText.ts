/**
 * useSpeechToText - Hook for on-device speech-to-text transcription
 *
 * Uses expo-audio for audio recording on iOS and native PCM recording on Android.
 * Uses react-native-executorch SpeechToTextModule for on-device Whisper model transcription.
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
  SpeechToTextModule,
  type SpeechToTextModelConfig as RNESpeechToTextModelConfig,
} from "react-native-executorch";
import {
  isPCMRecordingAvailable,
  isPCMRecording,
  startPCMRecording,
  stopPCMRecording,
  cancelPCMRecording,
  getPCMMeteringLevel,
} from "../../modules/platform-ai/src";
import { type SpeechToTextModelConfig } from "./modelConfig";

/**
 * Convert Uint8Array to base64 string without stack overflow
 * Handles large arrays by building the string in chunks
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  // Build binary string in chunks to avoid string concatenation issues
  const chunkSize = 0x8000; // 32KB chunks
  const chunks: string[] = [];

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    // Use Array.from to avoid spread operator stack overflow
    chunks.push(String.fromCharCode.apply(null, Array.from(chunk)));
  }

  return btoa(chunks.join(""));
}

// Audio recording settings for Whisper (16kHz mono WAV)
const WHISPER_RECORDING_OPTIONS: RecordingOptions = {
  extension: ".wav",
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 256000,
  isMeteringEnabled: true, // Enable audio level metering for visualization
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

export interface UseSpeechToTextOptions {
  /** Callback when transcription completes with audio file */
  onTranscriptionComplete?: (result: TranscriptionResult) => void;
  /** Callback on error */
  onError?: (error: string) => void;
}

export interface TranscriptionResult {
  /** The transcribed text */
  text: string;
  /** URI to the audio file (for saving as attachment) */
  audioUri: string | null;
  /** Duration of the recording in seconds */
  duration: number;
}

export interface UseSpeechToTextResult {
  /** Whether the STT model is loaded */
  isModelLoaded: boolean;
  /** Whether currently recording audio */
  isRecording: boolean;
  /** Whether currently transcribing */
  isTranscribing: boolean;
  /** Current committed (finalized) transcription text */
  committedText: string;
  /** Current pending (non-committed) transcription text */
  pendingText: string;
  /** Combined current transcription (committed + pending) */
  currentText: string;
  /** Audio metering level (0-1) for visualization, only valid while recording */
  meteringLevel: number;
  /** Load the STT model */
  loadModel: (config: SpeechToTextModelConfig) => Promise<void>;
  /** Unload the STT model */
  unloadModel: () => void;
  /** Start recording and transcribing */
  startRecording: () => Promise<void>;
  /** Stop recording and get final transcription with audio file */
  stopRecording: () => Promise<TranscriptionResult>;
  /** Cancel recording without transcribing */
  cancelRecording: () => Promise<void>;
  /** Any error that occurred */
  error: string | null;
}

/**
 * Read a WAV file and convert to Float32Array for Whisper model
 * Expects 16-bit PCM, 16kHz, mono WAV file
 */
async function readWavFile(uri: string): Promise<Float32Array> {
  // Read file as base64
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Convert base64 to binary
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Parse WAV header to find data chunk
  // WAV format: RIFF header (12 bytes) + fmt chunk + data chunk
  const dataView = new DataView(bytes.buffer);

  // Verify RIFF header
  const riff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (riff !== "RIFF") {
    throw new Error("Invalid WAV file: missing RIFF header");
  }

  // Find 'data' chunk (skip header and fmt chunk)
  let offset = 12; // Start after RIFF header
  while (offset < bytes.length - 8) {
    const chunkId = String.fromCharCode(
      bytes[offset],
      bytes[offset + 1],
      bytes[offset + 2],
      bytes[offset + 3],
    );
    const chunkSize = dataView.getUint32(offset + 4, true); // little-endian

    if (chunkId === "data") {
      // Found data chunk - extract PCM samples
      const dataStart = offset + 8;
      const numSamples = chunkSize / 2; // 16-bit = 2 bytes per sample
      const samples = new Float32Array(numSamples);

      // Convert 16-bit signed integers to float32 (-1 to 1)
      for (let i = 0; i < numSamples; i++) {
        const sample = dataView.getInt16(dataStart + i * 2, true); // little-endian
        samples[i] = sample / 32768.0; // Normalize to -1 to 1
      }

      return samples;
    }

    offset += 8 + chunkSize;
  }

  throw new Error("Invalid WAV file: data chunk not found");
}

/**
 * Convert our SpeechToTextModelConfig to react-native-executorch format
 */
function toRNEConfig(
  config: SpeechToTextModelConfig,
): RNESpeechToTextModelConfig {
  // Convert our ModelSource to string paths/URLs
  const getSourcePath = (
    source: SpeechToTextModelConfig["encoderSource"],
  ): string => {
    if (source.kind === "remote") {
      return source.url;
    } else if (source.kind === "bundled") {
      // For bundled assets, we'd need the resolved path
      // This would be populated after download
      throw new Error("Bundled assets not yet supported for STT");
    } else {
      throw new Error(`Model source unavailable: ${source.reason}`);
    }
  };

  return {
    isMultilingual: config.isMultilingual,
    encoderSource: getSourcePath(config.encoderSource),
    decoderSource: getSourcePath(config.decoderSource),
    tokenizerSource: getSourcePath(config.tokenizerSource),
  };
}

/**
 * Clean transcription text - remove blank audio markers and trim
 */
function cleanTranscription(text: string): string {
  return text
    .replace(/\[BLANK_AUDIO\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Concatenate multiple WAV files into a single WAV file
 * All input files must have the same format (16kHz, mono, 16-bit PCM)
 */
async function concatenateWavFiles(
  uris: string[],
  outputUri: string,
): Promise<number> {
  if (uris.length === 0) {
    return 0;
  }

  // If only one file, just copy it
  if (uris.length === 1) {
    const content = await FileSystem.readAsStringAsync(uris[0], {
      encoding: FileSystem.EncodingType.Base64,
    });
    await FileSystem.writeAsStringAsync(outputUri, content, {
      encoding: FileSystem.EncodingType.Base64,
    });
    // Estimate duration from file size (16kHz, 16-bit = 32000 bytes/sec)
    const info = await FileSystem.getInfoAsync(outputUri);
    const fileSize = info.exists && "size" in info ? (info.size ?? 0) : 0;
    return fileSize / 32000;
  }

  // Read all files and extract PCM data
  const allSamples: number[] = [];

  for (const uri of uris) {
    try {
      const samples = await readWavFile(uri);
      for (let i = 0; i < samples.length; i++) {
        allSamples.push(samples[i]);
      }
    } catch (err) {
      console.error(`[useSpeechToText] Failed to read chunk ${uri}:`, err);
    }
  }

  if (allSamples.length === 0) {
    return 0;
  }

  // Create WAV file header + data
  const numSamples = allSamples.length;
  const dataSize = numSamples * 2; // 16-bit = 2 bytes per sample
  const fileSize = 44 + dataSize; // WAV header is 44 bytes

  // Create buffer for entire file
  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // Write WAV header
  // "RIFF" chunk descriptor
  bytes[0] = 0x52;
  bytes[1] = 0x49;
  bytes[2] = 0x46;
  bytes[3] = 0x46; // "RIFF"
  view.setUint32(4, fileSize - 8, true); // File size - 8
  bytes[8] = 0x57;
  bytes[9] = 0x41;
  bytes[10] = 0x56;
  bytes[11] = 0x45; // "WAVE"

  // "fmt " sub-chunk
  bytes[12] = 0x66;
  bytes[13] = 0x6d;
  bytes[14] = 0x74;
  bytes[15] = 0x20; // "fmt "
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, 1, true); // NumChannels (1 = mono)
  view.setUint32(24, 16000, true); // SampleRate (16000 Hz)
  view.setUint32(28, 32000, true); // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
  view.setUint16(32, 2, true); // BlockAlign (NumChannels * BitsPerSample/8)
  view.setUint16(34, 16, true); // BitsPerSample (16)

  // "data" sub-chunk
  bytes[36] = 0x64;
  bytes[37] = 0x61;
  bytes[38] = 0x74;
  bytes[39] = 0x61; // "data"
  view.setUint32(40, dataSize, true); // Subchunk2Size

  // Write PCM data
  for (let i = 0; i < numSamples; i++) {
    // Convert float32 (-1 to 1) back to int16
    const sample = Math.max(-1, Math.min(1, allSamples[i]));
    const intSample = Math.round(sample * 32767);
    view.setInt16(44 + i * 2, intSample, true);
  }

  // Convert Uint8Array to base64 without stack overflow
  // Use chunked string building then btoa
  const base64 = uint8ArrayToBase64(bytes);

  await FileSystem.writeAsStringAsync(outputUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Return duration in seconds
  return numSamples / 16000;
}

export function useSpeechToText(
  options: UseSpeechToTextOptions = {},
): UseSpeechToTextResult {
  const { onTranscriptionComplete, onError } = options;

  // State
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [committedText, setCommittedText] = useState("");
  const [pendingText, setPendingText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [androidMeteringLevel, setAndroidMeteringLevel] = useState(0);

  // Audio recorder from expo-audio (used on iOS)
  const audioRecorder = useAudioRecorder(WHISPER_RECORDING_OPTIONS);

  // Get real-time recorder state for metering on iOS (polls every 50ms)
  const recorderState = useAudioRecorderState(audioRecorder, 50);

  // Ref for Android metering interval
  const androidMeteringIntervalRef = useRef<ReturnType<
    typeof setInterval
  > | null>(null);

  // Convert metering dB to normalized 0-1 level
  // On iOS: use expo-audio metering (in dB, -160 to 0)
  // On Android: use native PCM metering (already 0-1)
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

  // Refs
  const sttModuleRef = useRef<SpeechToTextModule | null>(null);
  const isMultilingualRef = useRef(false);
  const chunkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isProcessingChunkRef = useRef(false);
  const accumulatedTextRef = useRef("");
  const isRecordingRef = useRef(false); // Sync ref for callbacks
  const chunkUrisRef = useRef<string[]>([]); // Track chunk files for concatenation
  const chunkCounterRef = useRef(0); // Counter for unique chunk filenames on Android

  // Callbacks refs to avoid stale closures
  const onTranscriptionCompleteRef = useRef(onTranscriptionComplete);
  onTranscriptionCompleteRef.current = onTranscriptionComplete;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  /**
   * Load the STT model
   */
  const loadModel = useCallback(async (config: SpeechToTextModelConfig) => {
    try {
      setError(null);

      // Create new module instance
      const sttModule = new SpeechToTextModule();
      const rneConfig = toRNEConfig(config);

      console.log("[useSpeechToText] Loading model...", config.modelId);
      await sttModule.load(rneConfig);

      sttModuleRef.current = sttModule;
      isMultilingualRef.current = config.isMultilingual;
      setIsModelLoaded(true);
      console.log("[useSpeechToText] Model loaded successfully");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load STT model";
      console.error("[useSpeechToText] Load error:", message);
      setError(message);
      onErrorRef.current?.(message);
    }
  }, []);

  /**
   * Unload the STT model
   */
  const unloadModel = useCallback(() => {
    sttModuleRef.current = null;
    setIsModelLoaded(false);
    setCommittedText("");
    setPendingText("");
  }, []);

  /**
   * Transcribe a WAV file and return the text
   */
  const transcribeFile = useCallback(async (uri: string): Promise<string> => {
    const sttModule = sttModuleRef.current;
    if (!sttModule) {
      return "";
    }

    try {
      const waveform = await readWavFile(uri);
      const options = isMultilingualRef.current
        ? { language: "en" as const }
        : undefined;
      return await sttModule.transcribe(waveform, options);
    } catch (err) {
      console.error("[useSpeechToText] Transcribe error:", err);
      return "";
    }
  }, []);

  /**
   * Process a recording chunk - stop, transcribe, restart
   * Keeps chunk files for final concatenation
   */
  const processChunk = useCallback(async () => {
    if (isProcessingChunkRef.current || !isRecordingRef.current) {
      return;
    }
    isProcessingChunkRef.current = true;

    try {
      if (Platform.OS === "android" && isPCMRecordingAvailable()) {
        // Android: Use native PCM recording
        const result = await stopPCMRecording();
        // Convert path back to URI format for FileSystem operations
        const chunkUri = `file://${result.path}`;

        // Keep the chunk file for later concatenation
        chunkUrisRef.current.push(chunkUri);

        // Transcribe this chunk
        const rawText = await transcribeFile(chunkUri);
        const chunkText = cleanTranscription(rawText);

        // Append to accumulated text (preview only, don't write to canvas yet)
        if (chunkText) {
          accumulatedTextRef.current = accumulatedTextRef.current
            ? accumulatedTextRef.current + " " + chunkText
            : chunkText;
          setCommittedText(accumulatedTextRef.current);
        }

        // Restart recording if still active
        if (isRecordingRef.current) {
          chunkCounterRef.current++;
          // Strip file:// prefix for native code
          const cacheDir = (FileSystem.cacheDirectory || "").replace(
            /^file:\/\//,
            "",
          );
          const newChunkPath = `${cacheDir}chunk_${Date.now()}_${chunkCounterRef.current}.wav`;
          await startPCMRecording(newChunkPath);
          setPendingText("Listening...");
        }
      } else {
        // iOS: Use expo-audio
        await audioRecorder.stop();
        const uri = audioRecorder.uri;

        if (uri) {
          // IMPORTANT: Copy the chunk to a unique location immediately
          // expo-audio may reuse the same temp file when recording restarts,
          // which would overwrite this chunk's data
          const chunkUri = `${FileSystem.cacheDirectory}chunk_${Date.now()}_${chunkUrisRef.current.length}.wav`;
          await FileSystem.copyAsync({ from: uri, to: chunkUri });

          // Keep the copied chunk file for later concatenation
          chunkUrisRef.current.push(chunkUri);

          // Transcribe this chunk
          const rawText = await transcribeFile(chunkUri);
          const chunkText = cleanTranscription(rawText);

          // Append to accumulated text (preview only, don't write to canvas yet)
          if (chunkText) {
            accumulatedTextRef.current = accumulatedTextRef.current
              ? accumulatedTextRef.current + " " + chunkText
              : chunkText;
            setCommittedText(accumulatedTextRef.current);
          }
        }

        // Restart recording if still active
        if (isRecordingRef.current) {
          await audioRecorder.prepareToRecordAsync();
          audioRecorder.record();
          setPendingText("Listening...");
        }
      }
    } catch (err) {
      console.error("[useSpeechToText] Chunk processing error:", err);
    } finally {
      isProcessingChunkRef.current = false;
    }
  }, [audioRecorder, transcribeFile]);

  /**
   * Start recording audio with chunked transcription
   */
  const startRecording = useCallback(async () => {
    if (!sttModuleRef.current) {
      const msg = "STT model not loaded";
      setError(msg);
      onErrorRef.current?.(msg);
      return;
    }

    if (isRecording) {
      console.warn("[useSpeechToText] Already recording");
      return;
    }

    try {
      setError(null);
      setCommittedText("");
      setPendingText("Listening...");
      accumulatedTextRef.current = "";
      chunkUrisRef.current = []; // Reset chunk tracking
      chunkCounterRef.current = 0; // Reset chunk counter

      // Request permissions
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        throw new Error("Microphone permission not granted");
      }

      // Configure audio session for recording
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      if (Platform.OS === "android" && isPCMRecordingAvailable()) {
        // Android: Use native PCM recording for proper WAV files
        // FileSystem.cacheDirectory returns a URI (file://...), but native code needs a path
        const cacheDir = (FileSystem.cacheDirectory || "").replace(
          /^file:\/\//,
          "",
        );
        const chunkPath = `${cacheDir}chunk_${Date.now()}_0.wav`;
        await startPCMRecording(chunkPath);

        // Start metering polling for Android (every 50ms)
        androidMeteringIntervalRef.current = setInterval(async () => {
          try {
            const level = await getPCMMeteringLevel();
            setAndroidMeteringLevel(level);
          } catch {
            // Ignore metering errors
          }
        }, 50);
      } else {
        // iOS: Use expo-audio (produces proper WAV)
        await audioRecorder.prepareToRecordAsync();
        audioRecorder.record();
      }

      setIsRecording(true);
      isRecordingRef.current = true;

      // Start chunked transcription - process every 3 seconds
      chunkIntervalRef.current = setInterval(() => {
        processChunk();
      }, 3000);

      console.log(
        "[useSpeechToText] Recording started with chunked transcription",
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to start recording";
      console.error("[useSpeechToText] Start error:", message);
      setError(message);
      setIsRecording(false);
      isRecordingRef.current = false;
      setPendingText("");
      onErrorRef.current?.(message);
    }
  }, [isRecording, audioRecorder, processChunk]);

  /**
   * Stop recording and get final transcription with audio file
   */
  const stopRecording = useCallback(async (): Promise<TranscriptionResult> => {
    const emptyResult: TranscriptionResult = {
      text: "",
      audioUri: null,
      duration: 0,
    };

    // Stop the chunk interval first (prevents new chunks from starting)
    if (chunkIntervalRef.current) {
      clearInterval(chunkIntervalRef.current);
      chunkIntervalRef.current = null;
    }

    // Stop Android metering polling
    if (androidMeteringIntervalRef.current) {
      clearInterval(androidMeteringIntervalRef.current);
      androidMeteringIntervalRef.current = null;
      setAndroidMeteringLevel(0);
    }

    if (!isRecording) {
      isRecordingRef.current = false;
      const result: TranscriptionResult = {
        text: accumulatedTextRef.current || committedText,
        audioUri: null,
        duration: 0,
      };
      return result;
    }

    const sttModule = sttModuleRef.current;
    if (!sttModule) {
      isRecordingRef.current = false;
      setIsRecording(false);
      setPendingText("");
      return { text: accumulatedTextRef.current, audioUri: null, duration: 0 };
    }

    try {
      // Wait for any in-progress chunk processing to complete
      // IMPORTANT: Don't set isRecordingRef.current = false until AFTER this,
      // otherwise the chunk processing won't restart recording
      while (isProcessingChunkRef.current) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      // NOW mark as not recording (after chunk processing is done)
      isRecordingRef.current = false;
      setIsRecording(false);
      setPendingText("Finishing...");
      setIsTranscribing(true);

      // Stop recording and get the final chunk
      if (Platform.OS === "android" && isPCMRecordingAvailable()) {
        // Android: Stop native PCM recording
        // Check if recording is actually active (might have been stopped by chunk processing)
        const isActive = await isPCMRecording();
        if (isActive) {
          try {
            const result = await stopPCMRecording();
            // Convert path back to URI format for FileSystem operations
            const finalChunkUri = `file://${result.path}`;

            // Add final chunk to the list
            chunkUrisRef.current.push(finalChunkUri);

            // Transcribe final chunk
            console.log(
              "[useSpeechToText] Transcribing final chunk:",
              finalChunkUri,
            );
            const rawText = await transcribeFile(finalChunkUri);
            const finalChunkText = cleanTranscription(rawText);

            if (finalChunkText) {
              accumulatedTextRef.current = accumulatedTextRef.current
                ? accumulatedTextRef.current + " " + finalChunkText
                : finalChunkText;
            }
          } catch (err) {
            console.error(
              "[useSpeechToText] Error processing final chunk (Android):",
              err,
            );
          }
        } else {
          console.log(
            "[useSpeechToText] No active recording for final chunk (already processed by chunk interval)",
          );
        }
      } else {
        // iOS: Stop expo-audio recording
        await audioRecorder.stop();
        const uri = audioRecorder.uri;

        // Add final chunk to the list if it exists
        if (uri) {
          try {
            const fileInfo = await FileSystem.getInfoAsync(uri);
            if (fileInfo.exists) {
              // Copy final chunk to a unique location (same reason as in processChunk)
              const finalChunkUri = `${FileSystem.cacheDirectory}chunk_${Date.now()}_final.wav`;
              await FileSystem.copyAsync({ from: uri, to: finalChunkUri });
              chunkUrisRef.current.push(finalChunkUri);

              // Transcribe final chunk
              console.log(
                "[useSpeechToText] Transcribing final chunk:",
                finalChunkUri,
              );
              const rawText = await transcribeFile(finalChunkUri);
              const finalChunkText = cleanTranscription(rawText);

              if (finalChunkText) {
                accumulatedTextRef.current = accumulatedTextRef.current
                  ? accumulatedTextRef.current + " " + finalChunkText
                  : finalChunkText;
              }
            }
          } catch (err) {
            console.error(
              "[useSpeechToText] Error processing final chunk (iOS):",
              err,
            );
          }
        }
      }

      // Concatenate all chunks into a single audio file
      let audioUri: string | null = null;
      let duration = 0;

      if (chunkUrisRef.current.length > 0) {
        const outputUri = `${FileSystem.cacheDirectory}recording_${Date.now()}.wav`;
        try {
          duration = await concatenateWavFiles(chunkUrisRef.current, outputUri);
          audioUri = outputUri;
          console.log(
            `[useSpeechToText] Concatenated ${chunkUrisRef.current.length} chunks, duration: ${duration}s`,
          );
        } catch (err) {
          console.error("[useSpeechToText] Failed to concatenate chunks:", err);
        }

        // Clean up chunk files
        for (const chunkUri of chunkUrisRef.current) {
          try {
            await FileSystem.deleteAsync(chunkUri, { idempotent: true });
          } catch {
            // Ignore cleanup errors
          }
        }
        chunkUrisRef.current = [];
      }

      const finalText = accumulatedTextRef.current;
      setCommittedText(finalText);
      setPendingText("");
      setIsTranscribing(false);

      // Reset audio mode
      await setAudioModeAsync({
        allowsRecording: false,
      });

      const result: TranscriptionResult = {
        text: finalText,
        audioUri,
        duration,
      };

      console.log("[useSpeechToText] Transcription complete");
      onTranscriptionCompleteRef.current?.(result);

      return result;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to transcribe";
      console.error("[useSpeechToText] Transcription error:", message);
      setError(message);
      setIsRecording(false);
      setIsTranscribing(false);
      setPendingText("");
      onErrorRef.current?.(message);

      // Clean up chunks on error
      for (const chunkUri of chunkUrisRef.current) {
        try {
          await FileSystem.deleteAsync(chunkUri, { idempotent: true });
        } catch {
          // Ignore
        }
      }
      chunkUrisRef.current = [];

      return emptyResult;
    }
  }, [isRecording, committedText, audioRecorder, transcribeFile]);

  /**
   * Cancel recording without transcribing
   */
  const cancelRecording = useCallback(async () => {
    // Stop the chunk interval
    if (chunkIntervalRef.current) {
      clearInterval(chunkIntervalRef.current);
      chunkIntervalRef.current = null;
    }

    // Stop Android metering polling
    if (androidMeteringIntervalRef.current) {
      clearInterval(androidMeteringIntervalRef.current);
      androidMeteringIntervalRef.current = null;
      setAndroidMeteringLevel(0);
    }

    // Mark as not recording
    isRecordingRef.current = false;

    if (isRecording) {
      // Wait for any in-progress chunk processing to complete
      while (isProcessingChunkRef.current) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      try {
        if (Platform.OS === "android" && isPCMRecordingAvailable()) {
          // Android: Cancel native PCM recording
          await cancelPCMRecording();
        } else {
          // iOS: Cancel expo-audio recording
          await audioRecorder.stop();
          // Clean up temp file if exists
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

    // Clean up all chunk files
    for (const chunkUri of chunkUrisRef.current) {
      try {
        await FileSystem.deleteAsync(chunkUri, { idempotent: true });
      } catch {
        // Ignore cleanup errors
      }
    }
    chunkUrisRef.current = [];

    // Reset all state
    accumulatedTextRef.current = "";
    setIsRecording(false);
    setIsTranscribing(false);
    setCommittedText("");
    setPendingText("");

    // Reset audio mode
    try {
      await setAudioModeAsync({
        allowsRecording: false,
      });
    } catch {
      // Ignore
    }

    console.log("[useSpeechToText] Recording cancelled");
  }, [isRecording, audioRecorder]);

  return {
    isModelLoaded,
    isRecording,
    isTranscribing,
    committedText,
    pendingText,
    currentText: committedText + pendingText,
    meteringLevel,
    loadModel,
    unloadModel,
    startRecording,
    stopRecording,
    cancelRecording,
    error,
  };
}
