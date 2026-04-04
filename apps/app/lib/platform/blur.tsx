/**
 * Platform abstraction for BlurView (native implementation)
 *
 * Re-exports BlurView from expo-blur on native platforms.
 * On web, the .web.tsx version is loaded instead.
 */

export { BlurView } from "expo-blur";
export type { BlurViewProps } from "expo-blur";
