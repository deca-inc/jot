/**
 * Tests for platformFilter helpers.
 */

// Mock react-native Platform and isTauri BEFORE importing the module under test.
// jest.mock is hoisted, so these run before the subsequent imports even though
// they appear below the imports here — but we still place them at the top for
// clarity.
jest.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

jest.mock("../platform/isTauri", () => ({
  isTauri: jest.fn(() => false),
}));

import { Platform } from "react-native";
import { isTauri } from "../platform/isTauri";
import {
  getAvailableModelsForPlatform,
  getCurrentPlatform,
  isModelAvailableOnPlatform,
  type AppPlatform,
} from "./platformFilter";
import type { LlmModelConfig } from "./modelConfig";

// Helper to mutate Platform.OS safely
function setPlatformOS(os: string): void {
  (Platform as { OS: string }).OS = os;
}

const mockedIsTauri = isTauri as jest.MockedFunction<typeof isTauri>;

describe("platformFilter", () => {
  afterEach(() => {
    setPlatformOS("ios");
    mockedIsTauri.mockReturnValue(false);
  });

  describe("getCurrentPlatform", () => {
    it("returns 'web' when Platform.OS === 'web' and not Tauri", () => {
      setPlatformOS("web");
      mockedIsTauri.mockReturnValue(false);
      expect(getCurrentPlatform()).toBe("web" as AppPlatform);
    });

    it("returns 'tauri' when Platform.OS === 'web' and isTauri() is true", () => {
      setPlatformOS("web");
      mockedIsTauri.mockReturnValue(true);
      expect(getCurrentPlatform()).toBe("tauri" as AppPlatform);
    });

    it("returns 'ios' when Platform.OS === 'ios'", () => {
      setPlatformOS("ios");
      expect(getCurrentPlatform()).toBe("ios" as AppPlatform);
    });

    it("returns 'android' when Platform.OS === 'android'", () => {
      setPlatformOS("android");
      expect(getCurrentPlatform()).toBe("android" as AppPlatform);
    });

    it("returns 'macos' when Platform.OS === 'macos'", () => {
      setPlatformOS("macos");
      expect(getCurrentPlatform()).toBe("macos" as AppPlatform);
    });
  });

  describe("isModelAvailableOnPlatform", () => {
    it("returns true if supportedPlatforms includes platform", () => {
      const model = { supportedPlatforms: ["web", "tauri"] as AppPlatform[] };
      expect(isModelAvailableOnPlatform(model, "web")).toBe(true);
      expect(isModelAvailableOnPlatform(model, "tauri")).toBe(true);
    });

    it("returns true when supportedPlatforms is undefined (legacy, assume mobile)", () => {
      const model = {};
      expect(isModelAvailableOnPlatform(model, "ios")).toBe(true);
      expect(isModelAvailableOnPlatform(model, "android")).toBe(true);
    });

    it("returns false when legacy model is queried for a non-mobile platform", () => {
      const model = {};
      expect(isModelAvailableOnPlatform(model, "web")).toBe(false);
      expect(isModelAvailableOnPlatform(model, "tauri")).toBe(false);
      expect(isModelAvailableOnPlatform(model, "macos")).toBe(false);
    });

    it("returns false if supportedPlatforms does not include platform", () => {
      const model = { supportedPlatforms: ["web"] as AppPlatform[] };
      expect(isModelAvailableOnPlatform(model, "ios")).toBe(false);
      expect(isModelAvailableOnPlatform(model, "tauri")).toBe(false);
    });
  });

  describe("getAvailableModelsForPlatform", () => {
    const webModel = {
      modelId: "web-x",
      supportedPlatforms: ["web"] as AppPlatform[],
    } as LlmModelConfig;
    const tauriModel = {
      modelId: "desktop-x",
      supportedPlatforms: ["tauri", "macos"] as AppPlatform[],
    } as LlmModelConfig;
    const mobileModel = {
      modelId: "qwen-3-1.7b",
      supportedPlatforms: ["ios", "android"] as AppPlatform[],
    } as LlmModelConfig;
    const legacyModel = { modelId: "legacy" } as LlmModelConfig;

    it("filters models by platform availability", () => {
      const models = [webModel, tauriModel, mobileModel];
      expect(getAvailableModelsForPlatform(models, "web")).toEqual([webModel]);
      expect(getAvailableModelsForPlatform(models, "tauri")).toEqual([
        tauriModel,
      ]);
      expect(getAvailableModelsForPlatform(models, "ios")).toEqual([
        mobileModel,
      ]);
    });

    it("returns empty array when no models match the platform", () => {
      const models = [webModel];
      expect(getAvailableModelsForPlatform(models, "ios")).toEqual([]);
    });

    it("preserves model order", () => {
      const models = [mobileModel, webModel, tauriModel, legacyModel];
      const result = getAvailableModelsForPlatform(models, "ios");
      expect(result).toEqual([mobileModel, legacyModel]);
    });

    it("includes legacy models only for mobile platforms", () => {
      const models = [legacyModel];
      expect(getAvailableModelsForPlatform(models, "ios")).toEqual([
        legacyModel,
      ]);
      expect(getAvailableModelsForPlatform(models, "android")).toEqual([
        legacyModel,
      ]);
      expect(getAvailableModelsForPlatform(models, "web")).toEqual([]);
      expect(getAvailableModelsForPlatform(models, "tauri")).toEqual([]);
    });
  });
});
