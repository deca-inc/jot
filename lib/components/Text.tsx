import React from "react";
import {
  Text as RNText,
  TextProps as RNTextProps,
  StyleSheet,
} from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { TypographyVariant, typography } from "../theme/typography";
import { colors } from "../theme/colors";

export interface TextProps extends RNTextProps {
  variant?: TypographyVariant;
  color?: keyof typeof colors;
}

export function Text({
  variant = "body",
  color = "textPrimary",
  style,
  ...props
}: TextProps) {
  const theme = useTheme();
  const typographyStyle = typography[variant];

  // Convert line height ratio to pixel value for React Native
  // React Native lineHeight needs to be in pixels, not a ratio
  const fontSize = typographyStyle.fontSize;
  const lineHeightRatio = typographyStyle.lineHeight;
  const lineHeightPx = fontSize * lineHeightRatio;

  return (
    <RNText
      style={[
        {
          fontSize: typographyStyle.fontSize,
          fontWeight: typographyStyle.fontWeight,
          lineHeight: lineHeightPx,
          letterSpacing: typographyStyle.letterSpacing,
          color: theme.colors[color],
        },
        style,
      ]}
      {...props}
    />
  );
}
