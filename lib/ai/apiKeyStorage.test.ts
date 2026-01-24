import * as SecureStore from "expo-secure-store";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  storeApiKey,
  getApiKey,
  deleteApiKey,
  hasApiKey,
  API_KEY_PREFIX,
} from "./apiKeyStorage";

// Mock expo-secure-store
vi.mock("expo-secure-store", () => ({
  setItemAsync: vi.fn(),
  getItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
  isAvailableAsync: vi.fn().mockResolvedValue(true),
}));

describe("apiKeyStorage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("storeApiKey", () => {
    it("stores API key with correct prefix", async () => {
      await storeApiKey("remote-openai-gpt-4-key", "sk-test-key-12345");

      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        `${API_KEY_PREFIX}remote-openai-gpt-4-key`,
        "sk-test-key-12345",
      );
    });

    it("handles special characters in key reference", async () => {
      await storeApiKey(
        "remote-custom-server-key",
        "key-with-special-chars!@#",
      );

      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        `${API_KEY_PREFIX}remote-custom-server-key`,
        "key-with-special-chars!@#",
      );
    });

    it("throws error if storage fails", async () => {
      vi.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(
        new Error("Storage full"),
      );

      await expect(storeApiKey("test-key", "value")).rejects.toThrow(
        "Storage full",
      );
    });
  });

  describe("getApiKey", () => {
    it("retrieves API key with correct prefix", async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(
        "sk-stored-key",
      );

      const result = await getApiKey("remote-openai-gpt-4-key");

      expect(SecureStore.getItemAsync).toHaveBeenCalledWith(
        `${API_KEY_PREFIX}remote-openai-gpt-4-key`,
      );
      expect(result).toBe("sk-stored-key");
    });

    it("returns null for non-existent key", async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(null);

      const result = await getApiKey("non-existent-key");

      expect(result).toBeNull();
    });

    it("handles retrieval errors gracefully", async () => {
      vi.mocked(SecureStore.getItemAsync).mockRejectedValueOnce(
        new Error("Access denied"),
      );

      await expect(getApiKey("test-key")).rejects.toThrow("Access denied");
    });
  });

  describe("deleteApiKey", () => {
    it("deletes API key with correct prefix", async () => {
      await deleteApiKey("remote-openai-gpt-4-key");

      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
        `${API_KEY_PREFIX}remote-openai-gpt-4-key`,
      );
    });

    it("does not throw for non-existent key", async () => {
      vi.mocked(SecureStore.deleteItemAsync).mockResolvedValueOnce(undefined);

      await expect(deleteApiKey("non-existent-key")).resolves.not.toThrow();
    });
  });

  describe("hasApiKey", () => {
    it("returns true if API key exists", async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValueOnce("sk-key");

      const result = await hasApiKey("remote-openai-gpt-4-key");

      expect(result).toBe(true);
    });

    it("returns false if API key does not exist", async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(null);

      const result = await hasApiKey("remote-openai-gpt-4-key");

      expect(result).toBe(false);
    });

    it("returns false for empty string key", async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValueOnce("");

      const result = await hasApiKey("remote-openai-gpt-4-key");

      expect(result).toBe(false);
    });
  });

  describe("API_KEY_PREFIX", () => {
    it("uses a consistent prefix for all keys", () => {
      expect(API_KEY_PREFIX).toBe("jot_api_key_");
    });
  });
});
