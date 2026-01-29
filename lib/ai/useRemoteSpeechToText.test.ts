/**
 * Tests for useRemoteSpeechToText hook utilities
 *
 * Note: Full hook testing requires @testing-library/react-hooks.
 * These tests focus on the utility functions and configuration.
 * The hook's integration with expo-audio and the remote API is tested
 * indirectly through remoteSTTSender.test.ts and remoteApiClient.transcription.test.ts
 */

// Mock expo-audio BEFORE importing the module
jest.mock("expo-audio", () => ({
  useAudioRecorder: jest.fn(() => ({
    uri: null,
    prepareToRecordAsync: jest.fn(),
    record: jest.fn(),
    stop: jest.fn(),
  })),
  useAudioRecorderState: jest.fn(() => ({ metering: -30 })),
  requestRecordingPermissionsAsync: jest.fn(() =>
    Promise.resolve({ granted: true }),
  ),
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  IOSOutputFormat: { LINEARPCM: "lpcm" },
  AudioQuality: { HIGH: "high" },
}));

// Mock other dependencies
jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/",
  readAsStringAsync: jest.fn().mockResolvedValue("base64audiodata"),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  getInfoAsync: jest.fn().mockResolvedValue({ exists: true, size: 1000 }),
  EncodingType: { Base64: "base64" },
}));

jest.mock("../../modules/platform-ai/src", () => ({
  isPCMRecordingAvailable: jest.fn(() => false),
  isPCMRecording: jest.fn(() => Promise.resolve(false)),
  startPCMRecording: jest.fn(() => Promise.resolve()),
  stopPCMRecording: jest.fn(() => Promise.resolve({ path: "/cache/test.wav" })),
  cancelPCMRecording: jest.fn(() => Promise.resolve()),
  getPCMMeteringLevel: jest.fn(() => Promise.resolve(0.5)),
}));

jest.mock("../db/useCustomModels", () => ({
  useCustomModels: jest.fn(() => ({
    getByModelId: jest.fn(),
  })),
}));

jest.mock("./apiKeyStorage", () => ({
  getApiKey: jest.fn(() => Promise.resolve("test-key")),
}));

jest.mock("./remoteSTTSender", () => ({
  sendRemoteTranscription: jest.fn(() =>
    Promise.resolve({ text: "Hello world" }),
  ),
}));

import { WHISPER_REMOTE_RECORDING_OPTIONS } from "./useRemoteSpeechToText";

describe("useRemoteSpeechToText", () => {
  describe("recording options", () => {
    it("uses 16kHz sample rate for Whisper compatibility", () => {
      expect(WHISPER_REMOTE_RECORDING_OPTIONS.sampleRate).toBe(16000);
    });

    it("uses mono channel", () => {
      expect(WHISPER_REMOTE_RECORDING_OPTIONS.numberOfChannels).toBe(1);
    });

    it("outputs WAV format", () => {
      expect(WHISPER_REMOTE_RECORDING_OPTIONS.extension).toBe(".wav");
    });

    it("enables metering for audio level visualization", () => {
      expect(WHISPER_REMOTE_RECORDING_OPTIONS.isMeteringEnabled).toBe(true);
    });

    it("uses high quality audio on iOS", () => {
      expect(WHISPER_REMOTE_RECORDING_OPTIONS.ios?.audioQuality).toBeDefined();
    });

    it("uses 16-bit PCM on iOS for Whisper compatibility", () => {
      expect(WHISPER_REMOTE_RECORDING_OPTIONS.ios?.linearPCMBitDepth).toBe(16);
    });
  });
});
