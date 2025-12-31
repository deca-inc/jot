import * as Device from "expo-device";
import { Platform } from "react-native";

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
    // High-end: M1+, A15+, 8GB+ RAM - can handle larger models
    compatibleModels: [
      "qwen-3-1.7b",    // Best quality
      "qwen-3-0.6b",    // Fast option
      "llama-3.2-1b-instruct",
      "smollm2-1.7b",
      "smollm2-360m",
      "smollm2-135m",
    ],
    recommendedModel: "qwen-3-1.7b",
    description: "High-end device (M1+, A15+, 8GB+ RAM)",
  },
  mid: {
    tier: "mid",
    // Mid-range: A12-A14, 4-6GB RAM - stick to smaller models
    compatibleModels: [
      "qwen-3-0.6b",    // Best quality for this tier
      "llama-3.2-1b-instruct",
      "smollm2-360m",
      "smollm2-135m",
    ],
    recommendedModel: "qwen-3-0.6b",
    description: "Mid-range device (A12-A14, 4-6GB RAM)",
  },
  low: {
    tier: "low",
    // Low-end: Older devices, limited RAM - only smallest models
    compatibleModels: [
      "smollm2-360m",   // Best quality for this tier
      "smollm2-135m",   // Fallback
    ],
    recommendedModel: "smollm2-360m",
    description: "Older device (limited RAM)",
  },
};

/**
 * Detect device performance tier based on chip/model
 */
export async function getDeviceTier(): Promise<DeviceTier> {
  try {
    if (Platform.OS === "ios" || Platform.OS === "macos") {
      const modelName = Device.modelName || "";

      // High-end iOS devices
      if (
        // iPhone 15/16 series
        modelName.includes("iPhone 15") ||
        modelName.includes("iPhone 16") ||
        // iPhone 14 Pro models (A16)
        modelName.includes("iPhone 14 Pro") ||
        // iPad Pro (M1/M2)
        modelName.includes("iPad Pro") ||
        // iPad Air 5th gen+ (M1)
        (modelName.includes("iPad Air") && /iPad Air \(5|6/.test(modelName)) ||
        // Macs with Apple Silicon
        modelName.includes("Mac")
      ) {
        return "high";
      }

      // Mid-range iOS devices
      if (
        // iPhone 12-14 (non-Pro 14)
        modelName.includes("iPhone 12") ||
        modelName.includes("iPhone 13") ||
        modelName.includes("iPhone 14") ||
        // iPhone 11 series (A13)
        modelName.includes("iPhone 11") ||
        // iPad Air 3rd/4th gen
        modelName.includes("iPad Air") ||
        // iPad mini 5th/6th gen
        modelName.includes("iPad mini")
      ) {
        return "mid";
      }

      // Everything else is low-end
      return "low";
    }

    if (Platform.OS === "android") {
      // For Android, we'd need more sophisticated detection
      // For now, assume mid-range as a safe default
      // TODO: Could check android.os.Build for RAM or chip info
      return "mid";
    }

    // Desktop/other - assume high-end
    return "high";
  } catch (error) {
    console.error("[DeviceInfo] Error detecting device tier:", error);
    return "mid"; // Safe default
  }
}

/**
 * Get all compatible models for the device based on tier
 */
export async function getCompatibleModels(): Promise<string[]> {
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

  console.log("[ModelSelection] === Device Analysis ===");
  console.log(`[ModelSelection] Device: ${modelName}`);
  console.log(`[ModelSelection] Device Type: ${deviceType}`);
  console.log(`[ModelSelection] Platform: ${Platform.OS}`);
  console.log(`[ModelSelection] Detected Tier: ${tier.toUpperCase()}`);
  console.log(`[ModelSelection] Tier Description: ${config.description}`);
  console.log("[ModelSelection]");
  console.log("[ModelSelection] === Model Selection ===");
  console.log(`[ModelSelection] Compatible Models: ${config.compatibleModels.join(", ")}`);
  console.log(`[ModelSelection] Recommended: ${config.recommendedModel}`);
  console.log("[ModelSelection]");
  console.log("[ModelSelection] === All Tiers Reference ===");
  for (const [tierName, tierConfig] of Object.entries(TIER_CONFIGS)) {
    const marker = tierName === tier ? "→" : " ";
    console.log(`[ModelSelection] ${marker} ${tierName.toUpperCase()}: ${tierConfig.recommendedModel} (${tierConfig.compatibleModels.length} models)`);
  }
  console.log("[ModelSelection] =============================");
}
