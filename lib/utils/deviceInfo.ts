import * as Device from "expo-device";
import { Platform } from "react-native";

/**
 * Get estimated device RAM in GB
 * Note: React Native doesn't provide exact RAM info, so we estimate based on device model
 */
export async function getDeviceRAM(): Promise<number> {
  try {
    // For iOS, estimate based on model year (rough heuristic)
    if (Platform.OS === "ios") {
      const modelName = Device.modelName || "";

      // High-end devices (iPhone 14 Pro+, iPhone 15+)
      if (
        modelName.includes("iPhone 14 Pro") ||
        modelName.includes("iPhone 15") ||
        modelName.includes("iPhone 16") ||
        modelName.includes("iPad Pro")
      ) {
        return 8; // 6-8GB RAM
      }

      // Mid-range devices (iPhone 13+, iPhone 14)
      if (
        modelName.includes("iPhone 13") ||
        modelName.includes("iPhone 14") ||
        modelName.includes("iPad Air")
      ) {
        return 6; // 4-6GB RAM
      }

      // Older or lower-end devices
      return 4; // 3-4GB RAM
    }

    // For Android, we could use react-native-device-info, but for now estimate
    if (Platform.OS === "android") {
      // Most modern Android devices have at least 6GB
      return 6;
    }

    // Default fallback
    return 4;
  } catch (error) {
    console.error("Error detecting device RAM:", error);
    return 4; // Safe default
  }
}

// Model metadata for RAM calculation
const MODEL_METADATA = [
  {
    modelId: "qwen-3-1.7b",
    fileSizeMB: 2064,
    ramUsageMB: 2064 * 1.5, // ~3.1 GB
    priority: 3, // Highest priority
  },
  {
    modelId: "llama-3.2-1b-instruct",
    fileSizeMB: 1083,
    ramUsageMB: 1083 * 1.5, // ~1.62 GB
    priority: 2, // Medium priority
  },
  {
    modelId: "qwen-3-0.6b",
    fileSizeMB: 900,
    ramUsageMB: 900 * 1.5, // ~1.35 GB
    priority: 1, // Lowest priority
  },
] as const;

/**
 * Get all compatible models for the device (models that fit within 20% RAM)
 * Returns array of modelIds sorted by priority (highest first)
 */
export async function getCompatibleModels(): Promise<string[]> {
  const ramGB = await getDeviceRAM();
  const ramMB = ramGB * 1024; // Convert to MB
  const maxRAMUsageMB = ramMB * 0.2; // 20% of total RAM

  // Find all models that fit within 20% RAM
  const suitableModels = MODEL_METADATA.filter(
    (model) => model.ramUsageMB <= maxRAMUsageMB,
  );

  if (suitableModels.length === 0) {
    // Fallback to smallest model if none fit (shouldn't happen in practice)
    return ["qwen-3-0.6b"];
  }

  // Sort by priority (highest first) and return modelIds
  suitableModels.sort((a, b) => b.priority - a.priority);
  return suitableModels.map((m) => m.modelId);
}

/**
 * Get recommended model based on device capabilities
 * Returns modelId of the best model for this device
 *
 * Automatically selects the highest-end model that consumes less than 20% of RAM.
 * Options: Qwen3_0_6B (low), Llama32_1B_Instruct (medium), Qwen3_1_7B (high)
 */
export async function getRecommendedModel(): Promise<string> {
  const compatible = await getCompatibleModels();
  // The first model in the compatible list is the highest priority (best) one
  return compatible[0];
}
