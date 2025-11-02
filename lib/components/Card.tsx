import React, { useEffect, useRef, useState } from "react";
import {
  View,
  ViewProps,
  StyleSheet,
  Animated,
  AccessibilityInfo,
} from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import {
  spacingPatterns,
  borderRadius,
  borderWidth,
  springPresets,
} from "../theme";

export interface CardProps extends ViewProps {
  variant?: "default" | "elevated" | "outlined";
  padding?: keyof typeof spacingPatterns;
}

export function Card({
  variant = "default",
  padding = "md",
  style,
  children,
  ...props
}: CardProps) {
  const theme = useTheme();
  // Start at 0.95 opacity for subtle fade-in, prevents layout shift
  const opacity = useRef(new Animated.Value(0.95)).current;
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      setReduceMotionEnabled(enabled);
      if (enabled) {
        opacity.setValue(1);
      }
    });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (event) => {
        setReduceMotionEnabled(event);
        if (event) {
          opacity.setValue(1);
        }
      }
    );
    return () => subscription.remove();
  }, [opacity]);

  useEffect(() => {
    if (!reduceMotionEnabled) {
      // Small delay to ensure layout is stable before animating
      const timer = setTimeout(() => {
        Animated.spring(opacity, {
          toValue: 1,
          ...springPresets.gentle,
        }).start();
      }, 16); // One frame delay
      return () => clearTimeout(timer);
    }
  }, [opacity, reduceMotionEnabled]);

  const variantStyles = {
    default: {
      backgroundColor: theme.colors.background,
      borderWidth: borderWidth.none,
    },
    elevated: {
      backgroundColor: theme.colors.background,
      shadowColor: theme.colors.black,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 2,
      borderWidth: borderWidth.none,
    },
    outlined: {
      backgroundColor: theme.colors.background,
      borderWidth: borderWidth.thin,
      borderColor: theme.colors.border,
    },
  };

  return (
    <Animated.View
      style={[
        {
          borderRadius: borderRadius.lg,
          padding: spacingPatterns[padding],
          opacity,
        },
        variantStyles[variant],
        style,
      ]}
      {...props}
    >
      {children}
    </Animated.View>
  );
}
