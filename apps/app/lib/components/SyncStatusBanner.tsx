/**
 * Sync Status Banner
 *
 * A dismissible banner that shows when sync has issues (expired session, server unavailable).
 */

import { Ionicons } from "@expo/vector-icons";
import React, { useState, useCallback, useEffect } from "react";
import { StyleSheet, TouchableOpacity, Animated } from "react-native";
import { useSyncAuth } from "../sync/useSyncAuth";
import { useSyncStatus } from "../sync/useSyncStatus";
import { borderRadius, spacingPatterns } from "../theme";
import { Text } from "./Text";

export interface SyncStatusBannerProps {
  /** Callback when user taps to fix the issue */
  onFix?: () => void;
}

export function SyncStatusBanner({ onFix }: SyncStatusBannerProps) {
  const { state: authState } = useSyncAuth();
  const { status: connectionStatus } = useSyncStatus();
  const [dismissed, setDismissed] = useState(false);
  const [slideAnim] = useState(() => new Animated.Value(0));

  // Determine if we should show the banner
  const shouldShow = useCallback((): {
    show: boolean;
    type: "error" | "warning" | null;
    message: string;
  } => {
    if (dismissed) {
      return { show: false, type: null, message: "" };
    }

    // Not configured - don't show
    if (!authState.settings?.serverUrl || !authState.settings?.enabled) {
      return { show: false, type: null, message: "" };
    }

    // Session expired
    if (authState.error?.includes("expired")) {
      return {
        show: true,
        type: "error",
        message: "Session expired. Tap to sign in again.",
      };
    }

    // Server unavailable
    if (
      authState.status === "authenticated" &&
      connectionStatus.connectionStatus === "error"
    ) {
      return {
        show: true,
        type: "warning",
        message: "Sync server unavailable. Changes saved locally.",
      };
    }

    return { show: false, type: null, message: "" };
  }, [dismissed, authState, connectionStatus]);

  const bannerState = shouldShow();

  // Animate in/out
  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: bannerState.show ? 1 : 0,
      useNativeDriver: true,
      tension: 50,
      friction: 10,
    }).start();
  }, [bannerState.show, slideAnim]);

  // Reset dismissed state when error changes
  useEffect(() => {
    if (authState.error) {
      setDismissed(false);
    }
  }, [authState.error]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  const handleFix = useCallback(() => {
    onFix?.();
  }, [onFix]);

  if (!bannerState.show) {
    return null;
  }

  const backgroundColor =
    bannerState.type === "error"
      ? "rgba(244, 67, 54, 0.9)"
      : "rgba(255, 152, 0, 0.9)";
  const iconName =
    bannerState.type === "error" ? "alert-circle" : "cloud-offline";

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor,
          transform: [
            {
              translateY: slideAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [-100, 0],
              }),
            },
          ],
          opacity: slideAnim,
        },
      ]}
    >
      <TouchableOpacity
        style={styles.content}
        onPress={handleFix}
        activeOpacity={0.8}
      >
        <Ionicons name={iconName} size={20} color="white" />
        <Text variant="body" style={styles.message}>
          {bannerState.message}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.dismissButton} onPress={handleDismiss}>
        <Ionicons name="close" size={20} color="white" />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacingPatterns.md,
    paddingVertical: spacingPatterns.sm,
    borderRadius: borderRadius.md,
    marginHorizontal: spacingPatterns.md,
    marginTop: spacingPatterns.xs,
  },
  content: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacingPatterns.sm,
  },
  message: {
    color: "white",
    fontWeight: "500",
    flex: 1,
  },
  dismissButton: {
    padding: spacingPatterns.xs,
    marginLeft: spacingPatterns.xs,
  },
});
