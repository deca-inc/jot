/**
 * Tests for modelManager.ts
 */

// Must mock before any imports
jest.mock("expo-asset");
jest.mock("expo-file-system");
jest.mock("expo-file-system/legacy");
jest.mock("./modelDownloadStatus");
jest.mock("./persistentDownloadManager");

import * as FileSystem from "expo-file-system/legacy";
import {
  deleteCustomModel,
  getCustomModelPaths,
  getModelsDirectory,
  isCustomModelDownloaded,
  scanForWhisperFiles,
} from "./modelManager";

const mockFileSystem = FileSystem as jest.Mocked<typeof FileSystem>;

describe("modelManager", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("deleteCustomModel", () => {
    it("deletes the model directory when it exists", async () => {
      mockFileSystem.getInfoAsync.mockResolvedValue({
        exists: true,
        uri: "",
        size: 1000,
        isDirectory: true,
        modificationTime: Date.now(),
      });
      mockFileSystem.deleteAsync.mockResolvedValue();

      await deleteCustomModel("my-custom-model");

      expect(mockFileSystem.getInfoAsync).toHaveBeenCalledWith(
        expect.stringContaining("my-custom-model"),
      );
      expect(mockFileSystem.deleteAsync).toHaveBeenCalledWith(
        expect.stringContaining("my-custom-model"),
        { idempotent: true },
      );
    });

    it("does not attempt delete when directory does not exist", async () => {
      mockFileSystem.getInfoAsync.mockResolvedValue({
        exists: false,
        uri: "",
        isDirectory: false,
      });

      await deleteCustomModel("nonexistent-model");

      expect(mockFileSystem.getInfoAsync).toHaveBeenCalled();
      expect(mockFileSystem.deleteAsync).not.toHaveBeenCalled();
    });

    it("deletes the entire folder including all files", async () => {
      mockFileSystem.getInfoAsync.mockResolvedValue({
        exists: true,
        uri: "",
        size: 1000,
        isDirectory: true,
        modificationTime: Date.now(),
      });
      mockFileSystem.deleteAsync.mockResolvedValue();

      await deleteCustomModel("whisper-custom");

      const deletedPath = mockFileSystem.deleteAsync.mock.calls[0][0];
      expect(deletedPath).toContain("models");
      expect(deletedPath).toContain("whisper-custom");
    });
  });

  describe("isCustomModelDownloaded", () => {
    it("returns true when PTE file exists with size > 0", async () => {
      mockFileSystem.getInfoAsync.mockResolvedValue({
        exists: true,
        size: 1000000,
        uri: "",
        isDirectory: false,
        modificationTime: Date.now(),
      });

      const result = await isCustomModelDownloaded("my-model", "model.pte");

      expect(result).toBe(true);
    });

    it("returns false when PTE file does not exist", async () => {
      mockFileSystem.getInfoAsync.mockResolvedValue({
        exists: false,
        uri: "",
        isDirectory: false,
      });

      const result = await isCustomModelDownloaded("my-model", "model.pte");

      expect(result).toBe(false);
    });

    it("returns false when PTE file has size 0", async () => {
      mockFileSystem.getInfoAsync.mockResolvedValue({
        exists: true,
        size: 0,
        uri: "",
        isDirectory: false,
        modificationTime: Date.now(),
      });

      const result = await isCustomModelDownloaded("my-model", "model.pte");

      expect(result).toBe(false);
    });
  });

  describe("scanForWhisperFiles", () => {
    it("returns file names when encoder, decoder, and tokenizer are found", async () => {
      mockFileSystem.getInfoAsync.mockResolvedValue({
        exists: true,
        uri: "",
        size: 1000,
        isDirectory: true,
        modificationTime: Date.now(),
      });
      mockFileSystem.readDirectoryAsync.mockResolvedValue([
        "whisper_encoder_xnnpack.pte",
        "whisper_decoder_xnnpack.pte",
        "tokenizer.json",
        "README.md",
      ]);

      const result = await scanForWhisperFiles("whisper-custom");

      expect(result).toEqual({
        encoderFileName: "whisper_encoder_xnnpack.pte",
        decoderFileName: "whisper_decoder_xnnpack.pte",
        tokenizerFileName: "tokenizer.json",
      });
    });

    it("returns null when encoder is missing", async () => {
      mockFileSystem.getInfoAsync.mockResolvedValue({
        exists: true,
        uri: "",
        size: 1000,
        isDirectory: true,
        modificationTime: Date.now(),
      });
      mockFileSystem.readDirectoryAsync.mockResolvedValue([
        "whisper_decoder_xnnpack.pte",
        "tokenizer.json",
      ]);

      const result = await scanForWhisperFiles("whisper-custom");

      expect(result).toBeNull();
    });

    it("returns null when directory does not exist", async () => {
      mockFileSystem.getInfoAsync.mockResolvedValue({
        exists: false,
        uri: "",
        isDirectory: false,
      });

      const result = await scanForWhisperFiles("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("getCustomModelPaths", () => {
    it("returns correct paths for model with all files", () => {
      const result = getCustomModelPaths(
        "my-model",
        "model.pte",
        "tokenizer.json",
        "tokenizer_config.json",
      );

      expect(result.ptePath).toContain("my-model");
      expect(result.ptePath).toContain("model.pte");
      expect(result.tokenizerPath).toContain("tokenizer.json");
      expect(result.tokenizerConfigPath).toContain("tokenizer_config.json");
    });

    it("returns undefined for optional files when not provided", () => {
      const result = getCustomModelPaths("my-model", "model.pte");

      expect(result.ptePath).toContain("model.pte");
      expect(result.tokenizerPath).toBeUndefined();
      expect(result.tokenizerConfigPath).toBeUndefined();
    });
  });

  describe("getModelsDirectory", () => {
    it("returns a valid directory path", () => {
      const dir = getModelsDirectory();

      expect(dir).toContain("models");
    });
  });
});
