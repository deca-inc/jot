import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Animated, Platform, TouchableOpacity, PanResponder } from "react-native";
import { Text } from "./Text";
import { Ionicons } from "@expo/vector-icons";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { spacingPatterns, borderRadius } from "../theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type ToastType = "success" | "error" | "info";

interface ToastProps {
  message: string;
  type?: ToastType;
  visible: boolean;
  onHide: () => void;
  duration?: number;
}

export function Toast({
  message,
  type = "success",
  visible,
  onHide,
  duration = 3000,
}: ToastProps) {
  const seasonalTheme = useSeasonalTheme();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-100)).current;
  const translateX = useRef(new Animated.Value(0)).current;

  // Pan responder for horizontal swipe to dismiss
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to horizontal swipes (left or right)
        return Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onMoveShouldSetPanResponderCapture: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onPanResponderGrant: () => {
        translateX.setOffset(translateX._value);
      },
      onPanResponderMove: Animated.event(
        [null, { dx: translateX }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: (_, gestureState) => {
        translateX.flattenOffset();
        // If swiped more than 100 pixels or fast swipe velocity in either direction, dismiss
        const shouldDismiss = 
          Math.abs(gestureState.dx) > 100 || 
          Math.abs(gestureState.vx) > 0.5;
        
        if (shouldDismiss) {
          handleSwipeDismiss(gestureState.dx > 0 ? 1 : -1);
        } else {
          // Spring back to original position
          Animated.spring(translateX, {
            toValue: 0,
            tension: 65,
            friction: 8,
            useNativeDriver: false,
          }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    if (visible) {
      // Reset positions
      translateY.setValue(-100);
      translateX.setValue(0);
      
      // Slide down from top with spring animation
      Animated.spring(translateY, {
        toValue: 0,
        tension: 65,
        friction: 8,
        useNativeDriver: false,
      }).start();

      // Auto-hide after duration
      const timer = setTimeout(() => {
        handleHide();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [visible]);

  const handleSwipeDismiss = (direction: number) => {
    // Slide off screen in the direction of the swipe
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: direction * 400, // Slide off screen
        duration: 200,
        useNativeDriver: false,
      }),
      Animated.timing(translateY, {
        toValue: -20, // Slight upward movement
        duration: 200,
        useNativeDriver: false,
      }),
    ]).start(() => {
      onHide();
    });
  };

  const handleHide = () => {
    // Slide up when tapping close button
    Animated.timing(translateY, {
      toValue: -100,
      duration: 250,
      useNativeDriver: false,
    }).start(() => {
      onHide();
    });
  };

  if (!visible) return null;

  const getIcon = () => {
    switch (type) {
      case "success":
        return "checkmark-circle";
      case "error":
        return "alert-circle";
      case "info":
        return "information-circle";
    }
  };

  const getColor = () => {
    switch (type) {
      case "success":
        return "#10B981";
      case "error":
        return "#EF4444";
      case "info":
        return "#3B82F6";
    }
  };

  // Force opaque background color
  const getBackgroundColor = () => {
    // If the theme background is transparent or semi-transparent, use a solid color
    const bg = seasonalTheme.cardBg;
    // Remove any alpha channel if present and ensure it's opaque
    if (bg.includes('rgba')) {
      // Convert rgba to rgb with full opacity
      return bg.replace(/rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)/, 'rgb($1,$2,$3)');
    }
    return bg;
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          top: insets.top,
          transform: [{ translateY }],
        },
      ]}
    >
      <Animated.View
        style={[
          styles.toastContainer,
          { transform: [{ translateX }] }
        ]}
        {...panResponder.panHandlers}
      >
        <View
          style={[
            styles.toast,
            {
              backgroundColor: getBackgroundColor(),
              shadowColor: "#000",
            },
            Platform.OS === 'android' && styles.androidElevation,
          ]}
        >
          <Ionicons name={getIcon()} size={20} color={getColor()} />
          <Text
            variant="body"
            style={[styles.message, { color: seasonalTheme.textPrimary }]}
          >
            {message}
          </Text>
          <TouchableOpacity onPress={handleHide} style={styles.closeButton}>
            <Ionicons name="close" size={18} color={seasonalTheme.textSecondary} />
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 1000,
    paddingHorizontal: spacingPatterns.md,
    paddingTop: spacingPatterns.md,
  },
  toastContainer: {
    width: "100%",
    maxWidth: 400,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacingPatterns.sm,
    paddingHorizontal: spacingPatterns.md,
    paddingVertical: spacingPatterns.sm,
    marginHorizontal: spacingPatterns.md,
    borderRadius: borderRadius.lg,
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  androidElevation: {
    elevation: 8,
  },
  message: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
  },
  closeButton: {
    padding: 4,
    marginLeft: spacingPatterns.xs,
  },
});

