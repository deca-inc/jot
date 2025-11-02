/**
 * Spacing system for the Journal app
 * Consistent spacing scale for margins, padding, gaps, etc.
 */

export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  9: 36,
  10: 40,
  12: 48,
  14: 56,
  16: 64,
  20: 80,
  24: 96,
  32: 128,
} as const;

/**
 * Common spacing patterns
 */
export const spacingPatterns = {
  // Component internal padding
  xs: spacing[2], // 8px
  sm: spacing[3], // 12px
  md: spacing[4], // 16px
  lg: spacing[6], // 24px
  xl: spacing[8], // 32px

  // Gaps between elements
  gapXs: spacing[2], // 8px
  gapSm: spacing[3], // 12px
  gapMd: spacing[4], // 16px
  gapLg: spacing[6], // 24px
  gapXl: spacing[8], // 32px

  // Section spacing
  section: spacing[8], // 32px
  sectionLarge: spacing[12], // 48px

  // Screen padding
  screen: spacing[4], // 16px
  screenLarge: spacing[6], // 24px
} as const;

export type SpacingValue = typeof spacing[keyof typeof spacing];

