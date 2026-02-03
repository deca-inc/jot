/**
 * Theme system for the Journal app
 * Combines all design tokens: colors, typography, spacing, etc.
 */

import { springPresets, animatedHelpers } from "./animations";
import { borderRadius, borderWidth } from "./borders";
import { colors } from "./colors";
import { spacing, spacingPatterns } from "./spacing";
import {
  typography,
  fontSizes,
  fontWeights,
  lineHeights,
  letterSpacing,
} from "./typography";

export const theme = {
  colors,
  typography,
  fontSizes,
  fontWeights,
  lineHeights,
  letterSpacing,
  spacing,
  spacingPatterns,
  borderRadius,
  borderWidth,
  springPresets,
  animatedHelpers,
} as const;

export type Theme = typeof theme;

// Re-export individual modules for convenience
export * from "./colors";
export * from "./typography";
export * from "./spacing";
export * from "./borders";
export * from "./animations";
