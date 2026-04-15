/**
 * Platform detection + model filtering helpers.
 *
 * Each base model (e.g. Llama 3.2 3B) ships as different files per platform
 * (.pte for mobile executorch, MLC artifact IDs for web, .gguf for desktop).
 * These helpers let the registry advertise per-platform availability and let
 * the UI filter the list down to what actually runs on the current device.
 */

import { Platform } from "react-native";
import { isTauri } from "../platform/isTauri";
import type { LlmModelConfig, SpeechToTextModelConfig } from "./modelConfig";

export type AppPlatform = "ios" | "android" | "macos" | "web" | "tauri";

/**
 * Resolve the current runtime platform.
 *
 * Tauri runs inside a web view, so Platform.OS === "web" inside Tauri too —
 * we disambiguate via the `__TAURI_INTERNALS__` probe.
 */
export function getCurrentPlatform(): AppPlatform {
  if (Platform.OS === "web") {
    return isTauri() ? "tauri" : "web";
  }
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "android") return "android";
  if (Platform.OS === "macos") return "macos";
  // Fallback — unknown environments are treated as web.
  return "web";
}

/**
 * Check whether a model can run on the given platform.
 *
 * Models without a `supportedPlatforms` field are treated as legacy mobile
 * models (ios/android) so existing behaviour is preserved.
 */
export function isModelAvailableOnPlatform(
  model: { supportedPlatforms?: AppPlatform[] },
  platform: AppPlatform,
): boolean {
  if (!model.supportedPlatforms) {
    return platform === "ios" || platform === "android";
  }
  return model.supportedPlatforms.includes(platform);
}

/**
 * Filter a list of model configs to only those available on the given platform.
 * Preserves the original array order.
 */
export function getAvailableModelsForPlatform(
  models: LlmModelConfig[],
  platform: AppPlatform,
): LlmModelConfig[] {
  return models.filter((m) => isModelAvailableOnPlatform(m, platform));
}

/**
 * Filter a list of STT model configs to only those available on the given platform.
 * Preserves the original array order.
 */
export function getAvailableSTTModelsForPlatform(
  models: SpeechToTextModelConfig[],
  platform: AppPlatform,
): SpeechToTextModelConfig[] {
  return models.filter((m) => isModelAvailableOnPlatform(m, platform));
}
