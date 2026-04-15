import * as Device from "expo-device";
import { Platform } from "react-native";
import { ALL_LLM_MODELS } from "../ai/modelConfig";
import {
  getCurrentPlatform,
  getAvailableModelsForPlatform,
} from "../ai/platformFilter";

/**
 * Device performance tiers for model selection
 * Based on chip generation and RAM, not arbitrary percentages
 */
type DeviceTier = "high" | "mid" | "low";

interface TierConfig {
  tier: DeviceTier;
  compatibleModels: string[];
  recommendedModel: string;
  description: string;
}

// Tier configurations - prioritize quality while avoiding OOM
const TIER_CONFIGS: Record<DeviceTier, TierConfig> = {
  high: {
    tier: "high",
    // High-end: 6GB+ RAM - can handle larger models
    compatibleModels: [
      "qwen-3-4b", // Highest quality
      "llama-3.2-3b-instruct", // High quality
      "qwen-3-1.7b", // Good quality
      "qwen-3-0.6b", // Fast option
      "llama-3.2-1b-instruct",
      "smollm2-1.7b",
      "smollm2-360m",
      "smollm2-135m",
    ],
    recommendedModel: "qwen-3-1.7b",
    description: "High-end device (6GB+ RAM)",
  },
  mid: {
    tier: "mid",
    // Mid-range: 4-6GB RAM - stick to smaller models
    compatibleModels: [
      "llama-3.2-3b-instruct", // Usable on 4GB+
      "qwen-3-1.7b", // Good quality for this tier
      "qwen-3-0.6b", // Fast option
      "llama-3.2-1b-instruct",
      "smollm2-1.7b",
      "smollm2-360m",
      "smollm2-135m",
    ],
    recommendedModel: "qwen-3-0.6b",
    description: "Mid-range device (4-6GB RAM)",
  },
  low: {
    tier: "low",
    // Low-end: <4GB RAM - only smallest models
    compatibleModels: [
      "qwen-3-0.6b", // Best quality for this tier
      "llama-3.2-1b-instruct",
      "smollm2-360m",
      "smollm2-135m",
    ],
    recommendedModel: "smollm2-360m",
    description: "Older device (limited RAM)",
  },
};

/**
 * RAM thresholds (in bytes) for tier detection.
 * These are the primary signal — model-name matching is only a fallback.
 */
const RAM_HIGH_THRESHOLD = 6 * 1024 * 1024 * 1024; // 6 GB
const RAM_MID_THRESHOLD = 4 * 1024 * 1024 * 1024; // 4 GB

/**
 * Detect device performance tier based on RAM (preferred) or chip/model (fallback).
 */
export async function getDeviceTier(): Promise<DeviceTier> {
  try {
    // Primary: use actual RAM when available (iOS, Android, macOS)
    const totalMemory = Device.totalMemory;
    if (totalMemory != null && totalMemory > 0) {
      if (totalMemory >= RAM_HIGH_THRESHOLD) return "high";
      if (totalMemory >= RAM_MID_THRESHOLD) return "mid";
      return "low";
    }

    // Fallback: model-name heuristics (only when RAM isn't reported)
    if (Platform.OS === "ios" || Platform.OS === "macos") {
      const modelName = Device.modelName || "";

      // Macs with Apple Silicon are always high-end
      if (modelName.includes("Mac")) return "high";
      // iPad Pro is always high-end
      if (modelName.includes("iPad Pro")) return "high";

      // Default unknown iOS/macOS to mid (safe — avoids false "crash" warnings)
      return "mid";
    }

    if (Platform.OS === "android") {
      return "mid";
    }

    // Desktop/other — assume high-end
    return "high";
  } catch (error) {
    console.error("[DeviceInfo] Error detecting device tier:", error);
    return "mid"; // Safe default
  }
}

/**
 * Get all compatible models for the device based on tier.
 * On desktop/web, all platform-available models are compatible
 * (tier checks are only meaningful for mobile RAM constraints).
 */
export async function getCompatibleModels(): Promise<string[]> {
  const platform = getCurrentPlatform();
  if (platform === "web" || platform === "tauri" || platform === "macos") {
    return getAvailableModelsForPlatform(ALL_LLM_MODELS, platform).map(
      (m) => m.modelId,
    );
  }
  const tier = await getDeviceTier();
  return TIER_CONFIGS[tier].compatibleModels;
}

/**
 * Get recommended model based on device tier
 * Prioritizes quality while avoiding OOM errors
 */
export async function getRecommendedModel(): Promise<string> {
  const tier = await getDeviceTier();
  return TIER_CONFIGS[tier].recommendedModel;
}

/**
 * Log detailed debug info about device tier and model selection
 */
export async function logModelCompatibilityDebug(): Promise<void> {
  const tier = await getDeviceTier();
  const config = TIER_CONFIGS[tier];
  const modelName = Device.modelName || "Unknown";
  const deviceType = Device.deviceType;
  const totalMemory = Device.totalMemory;
  const ramGB = totalMemory
    ? (totalMemory / (1024 * 1024 * 1024)).toFixed(1)
    : "unknown";

  console.log("[ModelSelection] === Device Analysis ===");
  console.log(`[ModelSelection] Device: ${modelName}`);
  console.log(`[ModelSelection] Device Type: ${deviceType}`);
  console.log(`[ModelSelection] RAM: ${ramGB} GB`);
  console.log(`[ModelSelection] Platform: ${Platform.OS}`);
  console.log(`[ModelSelection] Detected Tier: ${tier.toUpperCase()}`);
  console.log(`[ModelSelection] Tier Description: ${config.description}`);
  console.log("[ModelSelection]");
  console.log("[ModelSelection] === Model Selection ===");
  console.log(
    `[ModelSelection] Compatible Models: ${config.compatibleModels.join(", ")}`,
  );
  console.log(`[ModelSelection] Recommended: ${config.recommendedModel}`);
  console.log("[ModelSelection]");
  console.log("[ModelSelection] === All Tiers Reference ===");
  for (const [tierName, tierConfig] of Object.entries(TIER_CONFIGS)) {
    const marker = tierName === tier ? "→" : " ";
    console.log(
      `[ModelSelection] ${marker} ${tierName.toUpperCase()}: ${tierConfig.recommendedModel} (${tierConfig.compatibleModels.length} models)`,
    );
  }
  console.log("[ModelSelection] =============================");
}
