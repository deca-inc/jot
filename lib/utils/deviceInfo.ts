import { Platform } from "react-native";
import * as Device from "expo-device";

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

/**
 * Get recommended model based on device capabilities
 * Returns modelId of the best model for this device
 * 
 * Prefers Qwen models - better quality and performance for on-device inference
 */
export async function getRecommendedModel(): Promise<string> {
  const ram = await getDeviceRAM();
  
  // 8GB+ RAM: Can handle larger models, use the balanced middle option
  if (ram >= 8) {
    return "qwen-3-1.7b"; // Best balance of quality and speed
  }
  
  // 6GB RAM: Use balanced middle model
  if (ram >= 6) {
    return "qwen-3-1.7b"; // Still good for most modern devices
  }
  
  // 4-5GB RAM: Use lightweight model
  if (ram >= 4) {
    return "qwen-3-0.6b"; // Lightweight but capable
  }
  
  // Less than 4GB: Use smallest model
  return "qwen-3-0.6b"; // Smallest, fastest model
}

