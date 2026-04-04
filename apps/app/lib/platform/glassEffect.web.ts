/**
 * Web shim for expo-glass-effect
 *
 * GlassView renders as a plain View on web.
 * isLiquidGlassAvailable always returns false (Apple-only feature).
 */

import { View } from "react-native";

export function isLiquidGlassAvailable(): boolean {
  return false;
}

export const GlassView = View;
