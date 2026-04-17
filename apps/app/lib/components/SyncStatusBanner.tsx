/**
 * Sync Status Banner
 *
 * A dismissible banner that shows when sync has issues (expired session, server unavailable).
 */

import { Ionicons } from "@expo/vector-icons";
import React, { useState, useCallback, useEffect } from "react";
import {
  StyleSheet,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
} from "react-native";
import { getSyncManager } from "../sync/SyncInitializer";
import { useSyncAuth } from "../sync/useSyncAuth";
import { useSyncStatus } from "../sync/useSyncStatus";
import { borderRadius, spacingPatterns } from "../theme";
import { Text } from "./Text";

export interface SyncStatusBannerProps {
  /** Callback when user taps to fix the issue (e.g. open login modal) */
  onFix?: () => void;
}

export function SyncStatusBanner({ onFix }: SyncStatusBannerProps) {
  const { state: authState, reconnect } = useSyncAuth();
  const { status: connectionStatus } = useSyncStatus();
  const [dismissed, setDismissed] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [slideAnim] = useState(() => new Animated.Value(0));

  // Determine if we should show the banner
  const shouldShow = useCallback((): {
    show: boolean;
    type: "error" | "warning" | null;
    message: string;
    action: "reconnect" | "fix" | "none";
  } => {
    if (dismissed) {
      return { show: false, type: null, message: "", action: "none" };
    }

    // Not configured - don't show
    if (!authState.settings?.serverUrl || !authState.settings?.enabled) {
      return { show: false, type: null, message: "", action: "none" };
    }

    // Auth error (expired session, auth failure) — offer reconnect
    if (authState.status === "error" && authState.error) {
      return {
        show: true,
        type: "warning",
        message: "Sync disconnected. Tap to reconnect.",
        action: "reconnect",
      };
    }

    // Server unavailable (authenticated but can't reach server)
    if (
      authState.status === "authenticated" &&
      connectionStatus.connectionStatus === "error"
    ) {
      return {
        show: true,
        type: "warning",
        message: "Sync server unavailable. Changes saved locally.",
        action: "reconnect",
      };
    }

    return { show: false, type: null, message: "", action: "none" };
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

  const handleReconnect = useCallback(async () => {
    setIsReconnecting(true);
    try {
      const success = await reconnect();
      if (success) {
        // Also reconnect the sync infrastructure (resets auth failure
        // tracking and rebuilds WebSocket connections with fresh tokens)
        const syncManager = getSyncManager();
        if (syncManager) {
          await syncManager.reconnect();
        }
        setDismissed(true);
      }
    } finally {
      setIsReconnecting(false);
    }
  }, [reconnect]);

  const handlePress = useCallback(() => {
    if (bannerState.action === "reconnect") {
      handleReconnect();
    } else {
      onFix?.();
    }
  }, [bannerState.action, handleReconnect, onFix]);

  if (!bannerState.show) {
    return null;
  }

  const backgroundColor = "rgba(255, 152, 0, 0.9)";
  const iconName = "cloud-offline";

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
        onPress={handlePress}
        activeOpacity={0.8}
        disabled={isReconnecting}
      >
        {isReconnecting ? (
          <ActivityIndicator size="small" color="white" />
        ) : (
          <Ionicons name={iconName} size={20} color="white" />
        )}
        <Text variant="body" style={styles.message}>
          {isReconnecting ? "Reconnecting..." : bannerState.message}
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
