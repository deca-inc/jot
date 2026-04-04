/**
 * Web shim for expo-blur BlurView
 *
 * Uses CSS backdrop-filter for blur effects on web.
 * Falls back to a semi-transparent background if backdrop-filter is not supported.
 */

import React from "react";
import { View, type ViewProps, StyleSheet, type ViewStyle } from "react-native";

export interface BlurViewProps extends ViewProps {
  /** Blur intensity from 0-100 */
  intensity?: number;
  /** Tint color of the blur */
  tint?: "light" | "dark" | "default" | "systemMaterial" | "prominent";
  /** Whether to use experimental blur method */
  experimentalBlurMethod?: string;
}

/**
 * Web implementation of BlurView using CSS backdrop-filter.
 *
 * Maps the expo-blur API to CSS properties for a similar visual effect.
 */
export function BlurView({
  intensity = 50,
  tint = "default",
  style,
  children,
  ...props
}: BlurViewProps): React.ReactElement {
  const blurAmount = Math.round((intensity / 100) * 20);

  const tintStyles: Record<string, ViewStyle> = {
    light: { backgroundColor: `rgba(255, 255, 255, ${intensity / 200})` },
    dark: { backgroundColor: `rgba(0, 0, 0, ${intensity / 200})` },
    default: { backgroundColor: `rgba(128, 128, 128, ${intensity / 300})` },
    systemMaterial: {
      backgroundColor: `rgba(128, 128, 128, ${intensity / 250})`,
    },
    prominent: { backgroundColor: `rgba(200, 200, 200, ${intensity / 200})` },
  };

  // CSS backdrop-filter properties need to be applied via the style prop
  // as raw CSS. React Native for Web supports passing web-specific CSS
  // properties through the style prop when cast appropriately.
  const webBlurStyle = {
    backdropFilter: `blur(${blurAmount}px)`,
    WebkitBackdropFilter: `blur(${blurAmount}px)`,
  } as unknown as ViewStyle;

  return (
    <View
      {...props}
      style={[
        styles.container,
        tintStyles[tint] ?? tintStyles.default,
        webBlurStyle,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
  },
});
