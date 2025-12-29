import React from "react";
import {
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
