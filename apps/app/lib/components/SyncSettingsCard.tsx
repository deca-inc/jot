/**
 * Sync Settings Card
 *
 * Card component for displaying and managing sync status in settings.
 */

import { Ionicons } from "@expo/vector-icons";
import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Switch,
} from "react-native";
import { useSyncAuth } from "../sync/useSyncAuth";
import { useSyncEngine } from "../sync/useSyncEngine";
import { useSyncStatus } from "../sync/useSyncStatus";
import { spacingPatterns } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { useTheme } from "../theme/ThemeProvider";
import { Card } from "./Card";
import { SyncSetupModal } from "./SyncSetupModal";
import { Text } from "./Text";

export function SyncSettingsCard() {
  const theme = useTheme();
  const seasonalTheme = useSeasonalTheme();
  const { state: authState, logout } = useSyncAuth();
  const { status: connectionStatus, isConnected } = useSyncStatus();
  const {
    status: syncStatus,
    pendingCount,
    queueStats,
    forceSync,
    retryFailed,
    refreshQueueStats,
  } = useSyncEngine();
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [wifiOnlyEnabled, setWifiOnlyEnabled] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  // Refresh queue stats when authenticated
  useEffect(() => {
    if (authState.status === "authenticated") {
      refreshQueueStats();
    }
  }, [authState.status, refreshQueueStats]);

  const handleLogout = useCallback(() => {
    Alert.alert(
      "Disconnect from Sync Server?",
      "You will no longer sync your entries with this server. Your local data will not be deleted.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            await logout();
          },
        },
      ],
    );
  }, [logout]);

  const handleForceSync = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await forceSync();
    } catch {
      Alert.alert(
        "Sync Failed",
        "Could not sync entries. Please try again later.",
      );
    } finally {
      setIsSyncing(false);
    }
  }, [forceSync, isSyncing]);

  const handleRetryFailed = useCallback(async () => {
    if (isRetrying) return;
    setIsRetrying(true);
    try {
      await retryFailed();
    } catch {
      Alert.alert(
        "Retry Failed",
        "Could not retry failed syncs. Please try again later.",
      );
    } finally {
      setIsRetrying(false);
    }
  }, [retryFailed, isRetrying]);

  // Get status display info
  const getStatusInfo = (): {
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
    text: string;
    subText?: string;
  } => {
    if (authState.isLoading) {
      return {
        icon: "sync",
        color: seasonalTheme.textSecondary,
        text: "Connecting...",
      };
    }

    switch (authState.status) {
      case "authenticated":
        // Check sync status
        if (syncStatus === "syncing" || isSyncing) {
          return {
            icon: "sync",
            color: theme.colors.accent,
            text: "Syncing...",
            subText:
              pendingCount > 0 ? `${pendingCount} entries pending` : undefined,
          };
        }
        if (syncStatus === "synced" && isConnected) {
          return {
            icon: "checkmark-circle",
            color: "#4CAF50",
            text: "Synced",
            subText:
              pendingCount > 0
                ? `${pendingCount} entries pending`
                : "All entries synced",
          };
        }
        if (syncStatus === "offline") {
          return {
            icon: "cloud-offline",
            color: "#FF9800",
            text: "Offline",
            subText:
              pendingCount > 0
                ? `${pendingCount} entries will sync when online`
                : undefined,
          };
        }
        if (syncStatus === "error") {
          return {
            icon: "warning",
            color: "#F44336",
            text: "Sync Error",
            subText:
              pendingCount > 0 ? `${pendingCount} entries pending` : undefined,
          };
        }
        if (isConnected) {
          return {
            icon: "checkmark-circle",
            color: "#4CAF50",
            text: "Connected",
            subText:
              pendingCount > 0 ? `${pendingCount} entries pending` : undefined,
          };
        }
        if (connectionStatus.connectionStatus === "connecting") {
          return {
            icon: "sync",
            color: seasonalTheme.textSecondary,
            text: "Connecting...",
          };
        }
        if (connectionStatus.connectionStatus === "error") {
          return {
            icon: "warning",
            color: "#FF9800",
            text: "Server unavailable",
          };
        }
        return {
          icon: "cloud-outline",
          color: seasonalTheme.textSecondary,
          text: "Checking...",
        };

      case "error":
        if (authState.error?.includes("expired")) {
          return {
            icon: "alert-circle",
            color: "#F44336",
            text: "Session expired",
          };
        }
        return {
          icon: "alert-circle",
          color: "#F44336",
          text: "Connection error",
        };

      default:
        return {
          icon: "cloud-offline-outline",
          color: seasonalTheme.textSecondary,
          text: "Not configured",
        };
    }
  };

  const statusInfo = getStatusInfo();
  const isConfigured =
    authState.status === "authenticated" || authState.settings?.serverUrl;

  return (
    <>
      <Card
        variant="borderless"
        style={[
          styles.card,
          {
            backgroundColor: seasonalTheme.cardBg,
            shadowColor: seasonalTheme.subtleGlow.shadowColor,
            shadowOpacity: seasonalTheme.subtleGlow.shadowOpacity,
          },
        ]}
      >
        <View style={styles.titleRow}>
          <Text
            variant="h3"
            style={[styles.sectionTitle, { color: seasonalTheme.textPrimary }]}
          >
            Sync
          </Text>
          <View
            style={[
              styles.betaBadge,
              { backgroundColor: `${theme.colors.accent}20` },
            ]}
          >
            <Text
              variant="caption"
              style={{ color: theme.colors.accent, fontWeight: "600" }}
            >
              Beta
            </Text>
          </View>
        </View>
        <Text
          variant="body"
          style={[
            styles.sectionDescription,
            { color: seasonalTheme.textSecondary },
          ]}
        >
          Sync your journal across devices
        </Text>

        {/* Status Display */}
        <View style={styles.statusContainer}>
          <View style={styles.statusRow}>
            {authState.isLoading || isSyncing ? (
              <ActivityIndicator
                size="small"
                color={seasonalTheme.textSecondary}
              />
            ) : (
              <Ionicons
                name={statusInfo.icon}
                size={20}
                color={statusInfo.color}
              />
            )}
            <View style={styles.statusTextContainer}>
              <Text
                variant="body"
                style={[
                  styles.statusText,
                  { color: seasonalTheme.textPrimary },
                ]}
              >
                {statusInfo.text}
              </Text>
              {statusInfo.subText && (
                <Text
                  variant="caption"
                  style={{ color: seasonalTheme.textSecondary }}
                >
                  {statusInfo.subText}
                </Text>
              )}
              {authState.settings?.email &&
                authState.status === "authenticated" && (
                  <Text
                    variant="caption"
                    style={{ color: seasonalTheme.textSecondary }}
                  >
                    {authState.settings.email}
                  </Text>
                )}
              {authState.settings?.serverUrl &&
                authState.status === "authenticated" && (
                  <Text
                    variant="caption"
                    style={{ color: seasonalTheme.textSecondary, fontSize: 11 }}
                  >
                    {authState.settings.serverUrl}
                  </Text>
                )}
            </View>
          </View>

          {/* Error message */}
          {authState.error && (
            <View style={styles.errorContainer}>
              <Text
                variant="caption"
                style={[styles.errorText, { color: "#F44336" }]}
              >
                {authState.error}
              </Text>
            </View>
          )}
        </View>

        {/* Sync Options - only show when authenticated */}
        {authState.status === "authenticated" && (
          <View style={styles.optionsContainer}>
            {/* WiFi-only toggle for large files */}
            <View style={styles.optionRow}>
              <View style={styles.optionTextContainer}>
                <Text
                  variant="body"
                  style={{ color: seasonalTheme.textPrimary }}
                >
                  WiFi only for large files
                </Text>
                <Text
                  variant="caption"
                  style={{ color: seasonalTheme.textSecondary }}
                >
                  Files over 5MB wait for WiFi
                </Text>
              </View>
              <Switch
                value={wifiOnlyEnabled}
                onValueChange={setWifiOnlyEnabled}
                trackColor={{
                  false: "#767577",
                  true: `${theme.colors.accent}60`,
                }}
                thumbColor={wifiOnlyEnabled ? theme.colors.accent : "#f4f3f4"}
              />
            </View>

            {/* Manual sync button - always show when authenticated */}
            <TouchableOpacity
              style={[
                styles.syncNowButton,
                { backgroundColor: `${theme.colors.accent}15` },
              ]}
              onPress={handleForceSync}
              disabled={isSyncing || syncStatus === "syncing"}
            >
              {isSyncing || syncStatus === "syncing" ? (
                <ActivityIndicator size="small" color={theme.colors.accent} />
              ) : (
                <Ionicons name="sync" size={18} color={theme.colors.accent} />
              )}
              <Text
                variant="body"
                style={{ color: theme.colors.accent, fontWeight: "500" }}
              >
                {pendingCount > 0 ? `Sync Now (${pendingCount})` : "Sync Now"}
              </Text>
            </TouchableOpacity>

            {/* Retry failed button - show when there are failed items */}
            {queueStats && queueStats.failed > 0 && (
              <TouchableOpacity
                style={[
                  styles.syncNowButton,
                  { backgroundColor: "rgba(244, 67, 54, 0.1)" },
                ]}
                onPress={handleRetryFailed}
                disabled={isRetrying}
              >
                {isRetrying ? (
                  <ActivityIndicator size="small" color="#F44336" />
                ) : (
                  <Ionicons name="refresh" size={18} color="#F44336" />
                )}
                <Text
                  variant="body"
                  style={{ color: "#F44336", fontWeight: "500" }}
                >
                  Retry Failed ({queueStats.failed})
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Action Button */}
        {isConfigured && authState.status === "authenticated" ? (
          <View style={styles.buttonRow}>
            {authState.error?.includes("expired") && (
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  { backgroundColor: `${theme.colors.accent}15` },
                ]}
                onPress={() => setShowSetupModal(true)}
              >
                <Ionicons
                  name="refresh-outline"
                  size={18}
                  color={theme.colors.accent}
                />
                <Text
                  variant="body"
                  style={{ color: theme.colors.accent, fontWeight: "500" }}
                >
                  Sign In Again
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[
                styles.actionButton,
                { backgroundColor: "rgba(244, 67, 54, 0.1)" },
              ]}
              onPress={handleLogout}
            >
              <Ionicons name="log-out-outline" size={18} color="#F44336" />
              <Text
                variant="body"
                style={{ color: "#F44336", fontWeight: "500" }}
              >
                Disconnect
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[
              styles.configureButton,
              { backgroundColor: `${theme.colors.accent}15` },
            ]}
            onPress={() => setShowSetupModal(true)}
          >
            <View style={styles.configureButtonContent}>
              <Ionicons
                name="cloud-upload-outline"
                size={20}
                color={theme.colors.accent}
              />
              <View style={styles.configureButtonText}>
                <Text
                  variant="body"
                  style={{
                    color: seasonalTheme.textPrimary,
                    fontWeight: "500",
                  }}
                >
                  Configure Sync Server
                </Text>
                <Text
                  variant="caption"
                  style={{ color: seasonalTheme.textSecondary }}
                >
                  Connect to a sync server to backup and sync
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={seasonalTheme.textSecondary}
              />
            </View>
          </TouchableOpacity>
        )}
      </Card>

      {/* Setup Modal */}
      <SyncSetupModal
        visible={showSetupModal}
        onClose={() => setShowSetupModal(false)}
        onSetupComplete={() => setShowSetupModal(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacingPatterns.md,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacingPatterns.sm,
  },
  sectionTitle: {
    marginBottom: spacingPatterns.xs,
  },
  betaBadge: {
    paddingHorizontal: spacingPatterns.xs,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: spacingPatterns.xs,
  },
  sectionDescription: {
    marginTop: spacingPatterns.xs,
    marginBottom: spacingPatterns.md,
  },
  statusContainer: {
    marginBottom: spacingPatterns.md,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacingPatterns.sm,
  },
  statusTextContainer: {
    flex: 1,
    gap: 2,
  },
  statusText: {
    fontWeight: "500",
  },
  errorContainer: {
    marginTop: spacingPatterns.xs,
    padding: spacingPatterns.xs,
    backgroundColor: "rgba(244, 67, 54, 0.1)",
    borderRadius: 4,
  },
  errorText: {
    fontSize: 12,
  },
  optionsContainer: {
    marginBottom: spacingPatterns.md,
    gap: spacingPatterns.sm,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  optionTextContainer: {
    flex: 1,
    gap: 2,
  },
  syncNowButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacingPatterns.xs,
    padding: spacingPatterns.sm,
    borderRadius: 8,
  },
  buttonRow: {
    flexDirection: "row",
    gap: spacingPatterns.sm,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacingPatterns.xs,
    padding: spacingPatterns.sm,
    borderRadius: 8,
  },
  configureButton: {
    padding: spacingPatterns.sm,
    borderRadius: 8,
  },
  configureButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacingPatterns.sm,
  },
  configureButtonText: {
    flex: 1,
    gap: 2,
  },
});
