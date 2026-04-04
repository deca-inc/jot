/**
 * Web shim for expo-audio
 *
 * No-op stubs for audio recording. Voice recording on web
 * will use the Web Audio API in a future implementation.
 */

export interface RecordingOptions {
  isMeteringEnabled?: boolean;
  android?: Record<string, unknown>;
  ios?: Record<string, unknown>;
  web?: Record<string, unknown>;
}

interface AudioRecorder {
  record: () => Promise<void>;
  stop: () => Promise<void>;
  pause: () => Promise<void>;
  getUri: () => string | null;
  uri: string | null;
  isRecording: boolean;
  currentTime: number;
  prepareToRecordAsync: (options?: RecordingOptions) => Promise<void>;
}

const noopRecorder: AudioRecorder = {
  record: async () => {},
  stop: async () => {},
  pause: async () => {},
  getUri: () => null,
  uri: null,
  isRecording: false,
  currentTime: 0,
  prepareToRecordAsync: async () => {},
};

export function useAudioRecorder(
  _options?: RecordingOptions,
  _onStatusUpdate?: unknown,
): AudioRecorder {
  return noopRecorder;
}

export function useAudioRecorderState(
  _recorder: AudioRecorder,
  _intervalMs?: number,
): { isRecording: boolean; durationMillis: number; metering: number } {
  return { isRecording: false, durationMillis: 0, metering: -160 };
}

export async function requestRecordingPermissionsAsync(): Promise<{
  granted: boolean;
  status: string;
}> {
  return { granted: false, status: "undetermined" };
}

export async function setAudioModeAsync(
  _mode?: Record<string, unknown>,
): Promise<void> {}

export const IOSOutputFormat = {
  LINEARPCM: "linearpcm",
  AAC: "aac",
  MPEG4AAC: "aac",
  APPLELOSSLESS: "alac",
} as const;

export const AudioQuality = {
  HIGH: 1,
  MEDIUM: 0.5,
  LOW: 0.25,
  MIN: 0,
  MAX: 1,
} as const;
