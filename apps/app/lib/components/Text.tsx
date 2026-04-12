import React from "react";
import {
  Platform,
  Text as RNText,
  TextProps as RNTextProps,
} from "react-native";
import { colors } from "../theme/colors";
import { useTheme } from "../theme/ThemeProvider";
import { TypographyVariant, typography } from "../theme/typography";

export interface TextProps extends RNTextProps {
  variant?: TypographyVariant;
  color?: Exclude<keyof typeof colors, "highContrast">;
}

// React Native Web's default font-family for <Text> is "System", which
// resolves to the browser's default serif in WKWebView (Times). Override
// with a real system-font stack on web so text renders like the native app.
// Native platforms leave fontFamily undefined so they pick up SF Pro / Roboto.
const WEB_FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, Roboto, "Helvetica Neue", Arial, sans-serif';
const PLATFORM_FONT_FAMILY = Platform.OS === "web" ? WEB_FONT_STACK : undefined;

export function Text({
  variant = "body",
  color = "textPrimary",
  style,
  ...props
}: TextProps) {
  const theme = useTheme();
  const typographyStyle = typography[variant] || typography.body; // Fallback to body if variant doesn't exist

  // Convert line height ratio to pixel value for React Native
  // React Native lineHeight needs to be in pixels, not a ratio
  const fontSize = typographyStyle.fontSize;
  const lineHeightRatio = typographyStyle.lineHeight;
  const lineHeightPx = fontSize * lineHeightRatio;

  // Get color value - ensure it's a string (exclude highContrast object)
  const colorValue =
    typeof theme.colors[color] === "string"
      ? theme.colors[color]
      : theme.colors.textPrimary;

  return (
    <RNText
      style={[
        {
          fontFamily: PLATFORM_FONT_FAMILY,
          fontSize: typographyStyle.fontSize,
          fontWeight: typographyStyle.fontWeight,
          lineHeight: lineHeightPx,
          letterSpacing: typographyStyle.letterSpacing,
          color: colorValue,
        },
        style,
      ]}
      {...props}
    />
  );
}
