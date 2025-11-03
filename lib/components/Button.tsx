import React, { useRef, useEffect, useState } from "react";
import {
  TouchableOpacity,
  TouchableOpacityProps,
  ActivityIndicator,
  Animated,
  AccessibilityInfo,
} from "react-native";
import { Text } from "./Text";
import { useTheme } from "../theme/ThemeProvider";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { spacingPatterns, borderRadius, springPresets } from "../theme";

export interface ButtonProps extends TouchableOpacityProps {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  children: React.ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  children,
  style,
  onPressIn,
  onPressOut,
  ...props
}: ButtonProps) {
  const theme = useTheme();
  const seasonalTheme = useSeasonalTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotionEnabled);
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (event) => setReduceMotionEnabled(event)
    );
    return () => subscription.remove();
  }, []);

  const shouldAnimate = !reduceMotionEnabled && !disabled && !loading;

  const sizeStyles = {
    sm: {
      paddingVertical: spacingPatterns.xs,
      paddingHorizontal: spacingPatterns.sm,
    },
    md: {
      paddingVertical: spacingPatterns.sm,
      paddingHorizontal: spacingPatterns.md,
    },
    lg: {
      paddingVertical: spacingPatterns.md,
      paddingHorizontal: spacingPatterns.lg,
    },
  };

  const variantStyles = {
    primary: {
      backgroundColor:
        disabled || loading ? theme.colors.gray300 : theme.colors.primary,
    },
    secondary: {
      backgroundColor: "transparent",
      borderWidth: 1,
      borderColor:
        disabled || loading
          ? seasonalTheme.textSecondary + "50"
          : seasonalTheme.textSecondary + "40",
    },
    ghost: {
      backgroundColor: "transparent",
    },
  };

  const getTextColor = (variant: "primary" | "secondary" | "ghost") => {
    if (variant === "primary") {
      return theme.colors.textInverse;
    }
    // Use seasonal theme colors for secondary and ghost variants
    return disabled || loading
      ? seasonalTheme.textSecondary
      : seasonalTheme.textPrimary;
  };

  const handlePressIn = (e: any) => {
    if (shouldAnimate) {
      Animated.spring(scale, {
        toValue: 0.96,
        ...springPresets.button,
      }).start();
    }
    onPressIn?.(e);
  };

  const handlePressOut = (e: any) => {
    if (shouldAnimate) {
      Animated.spring(scale, {
        toValue: 1,
        ...springPresets.button,
      }).start();
    }
    onPressOut?.(e);
  };

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <TouchableOpacity
        style={[
          {
            borderRadius: borderRadius.md,
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            opacity: disabled && !loading ? 0.5 : 1,
          },
          sizeStyles[size],
          variantStyles[variant],
        ]}
        disabled={disabled || loading}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        {...props}
      >
        {loading ? (
          <ActivityIndicator
            size="small"
            color={
              variant === "primary"
                ? theme.colors.textInverse
                : theme.colors.primary
            }
          />
        ) : (
          <Text
            variant="label"
            style={{
              fontWeight: "600",
              color: getTextColor(variant),
            }}
          >
            {children}
          </Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}
