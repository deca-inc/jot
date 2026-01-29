/**
 * Tests for useRealTimeSpeechToText hook utilities
 *
 * Note: Full hook testing requires @testing-library/react-hooks.
 * These tests focus on the utility functions and configuration.
 * The hook's integration with expo-audio and WebSocket is tested
 * through unit tests on the RealTimeSTTClient.
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

// Mock the RealTimeSTTClient
const mockConnect = jest.fn(() => Promise.resolve());
const mockDisconnect = jest.fn();
const mockSendAudio = jest.fn();
const mockIsConnected = jest.fn(() => true);
const mockOn = jest.fn();
const mockOff = jest.fn();

jest.mock("./realTimeSTTClient", () => ({
  RealTimeSTTClient: jest.fn(() => ({
    connect: mockConnect,
    disconnect: mockDisconnect,
    sendAudio: mockSendAudio,
    isConnected: mockIsConnected,
    on: mockOn,
    off: mockOff,
  })),
}));

jest.mock("./realTimeProviders", () => ({
  detectRealTimeProvider: jest.fn(() => "deepgram"),
  supportsRealTime: jest.fn(() => true),
  getRealTimeConfig: jest.fn(() => ({
    wsUrl: "wss://api.deepgram.com/v1/listen",
    headers: { Authorization: "Token test-key" },
    provider: "deepgram",
  })),
}));

import { REALTIME_RECORDING_OPTIONS } from "./useRealTimeSpeechToText";

describe("useRealTimeSpeechToText", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("recording options", () => {
    it("uses 16kHz sample rate for STT compatibility", () => {
      expect(REALTIME_RECORDING_OPTIONS.sampleRate).toBe(16000);
    });

    it("uses mono channel", () => {
      expect(REALTIME_RECORDING_OPTIONS.numberOfChannels).toBe(1);
    });

    it("outputs WAV format", () => {
      expect(REALTIME_RECORDING_OPTIONS.extension).toBe(".wav");
    });

    it("enables metering for audio level visualization", () => {
      expect(REALTIME_RECORDING_OPTIONS.isMeteringEnabled).toBe(true);
    });

    it("uses high quality audio on iOS", () => {
      expect(REALTIME_RECORDING_OPTIONS.ios?.audioQuality).toBeDefined();
    });

    it("uses 16-bit PCM on iOS for STT compatibility", () => {
      expect(REALTIME_RECORDING_OPTIONS.ios?.linearPCMBitDepth).toBe(16);
    });
  });

  describe("utility functions", () => {
    it("exports required types", () => {
      // This test ensures the module exports are available
      const module = require("./useRealTimeSpeechToText");
      expect(module.REALTIME_RECORDING_OPTIONS).toBeDefined();
      expect(module.useRealTimeSpeechToText).toBeDefined();
    });
  });
});
