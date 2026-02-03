import { Ionicons } from "@expo/vector-icons";
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import Animated, { FadeIn, FadeOut, Layout } from "react-native-reanimated";
import { ALL_MODELS } from "../ai/modelConfig";
import { ensureModelPresent, getModelSize } from "../ai/modelManager";
import {
  persistentDownloadManager,
  type DownloadMetadata,
} from "../ai/persistentDownloadManager";
import { useModelDownloadStatus } from "../ai/useModelDownloadStatus";
import { useModelSettings } from "../db/modelSettings";
import { spacingPatterns, borderRadius } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { useTheme } from "../theme/ThemeProvider";
import { Text } from "./Text";
import { useToast } from "./ToastProvider";

/**
 * A banner shown on the home screen when there are paused/pending model downloads.
 * Allows users to resume downloads with one tap.
 */
export function PendingDownloadBanner() {
  const [pendingDownload, setPendingDownload] =
    useState<DownloadMetadata | null>(null);
  const [isResuming, setIsResuming] = useState(false);
  const [progress, setProgress] = useState(0);
  const seasonalTheme = useSeasonalTheme();
  const theme = useTheme();
  const modelSettings = useModelSettings();
  const { showToast } = useToast();

  // Check if there's an active download in progress
  const activeDownload = useModelDownloadStatus();

  const loadPendingDownload = useCallback(async () => {
    try {
      const pending = await persistentDownloadManager.getPendingDownloads();
      // Get the first pending download (most likely the one that was interrupted)
      if (pending.length > 0) {
        // Filter for model downloads (not tokenizer/config which are smaller)
        const modelDownload =
          pending.find((d) => d.fileType === "model") || pending[0];
        setPendingDownload(modelDownload);
      } else {
        setPendingDownload(null);
      }
    } catch (error) {
      console.error("Failed to load pending downloads:", error);
      setPendingDownload(null);
    }
  }, []);

  useEffect(() => {
    loadPendingDownload();

    // Reload periodically to catch any new pending downloads
    const interval = setInterval(loadPendingDownload, 5000);
    return () => clearInterval(interval);
  }, [loadPendingDownload]);

  // Hide if there's an active download or nothing pending
  if (activeDownload?.isDownloading || !pendingDownload) {
    return null;
  }

  const handleResume = async () => {
    if (!pendingDownload) return;

    try {
      setIsResuming(true);
      setProgress(0);

      const modelConfig = ALL_MODELS.find(
        (m) => m.modelId === pendingDownload.modelId,
      );
      if (!modelConfig) {
        showToast("Model configuration not found", "error");
        return;
      }

      const result = await ensureModelPresent(modelConfig, (p) => {
        setProgress(Math.round(p * 100));
      });

      const size = await getModelSize(modelConfig);

      await modelSettings.addDownloadedModel({
        modelId: modelConfig.modelId,
        downloadedAt: Date.now(),
        ptePath: result.ptePath,
        tokenizerPath: result.tokenizerPath,
        tokenizerConfigPath: result.tokenizerConfigPath,
        size,
      });

      showToast(
        `${modelConfig.displayName} downloaded successfully`,
        "success",
      );
      await loadPendingDownload();
    } catch (error: unknown) {
      console.error("Failed to resume download:", error);
      const err = error as { message?: string };
      showToast(err?.message || "Failed to resume download", "error");
    } finally {
      setIsResuming(false);
      setProgress(0);
    }
  };

  const handleDismiss = async () => {
    if (!pendingDownload) return;

    try {
      await persistentDownloadManager.cancelDownload(
        pendingDownload.modelId,
        pendingDownload.fileType,
      );
      await loadPendingDownload();
    } catch (error) {
      console.error("Failed to dismiss download:", error);
    }
  };

  const displayProgress = isResuming
    ? progress
    : pendingDownload.bytesTotal > 0
      ? Math.round(
          (pendingDownload.bytesWritten / pendingDownload.bytesTotal) * 100,
        )
      : 0;

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
      layout={Layout.springify().damping(15).stiffness(100)}
      style={[styles.container, { backgroundColor: seasonalTheme.cardBg }]}
    >
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          {isResuming ? (
            <ActivityIndicator size="small" color={theme.colors.accent} />
          ) : (
            <Ionicons
              name="pause-circle-outline"
              size={24}
              color={theme.colors.accent}
            />
          )}
        </View>

        <View style={styles.textContainer}>
          <Text
            variant="body"
            style={[styles.title, { color: seasonalTheme.textPrimary }]}
          >
            {isResuming ? "Downloading" : "Download Paused"}
          </Text>
          <Text
            variant="caption"
            style={[styles.subtitle, { color: seasonalTheme.textSecondary }]}
          >
            {pendingDownload.modelName} • {displayProgress}%
          </Text>
        </View>

        <View style={styles.actions}>
          {!isResuming && (
            <TouchableOpacity
              onPress={handleDismiss}
              style={[styles.actionButton, { backgroundColor: "#FF6B6B15" }]}
            >
              <Ionicons name="close" size={16} color="#FF6B6B" />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={handleResume}
            disabled={isResuming}
            style={[
              styles.resumeButton,
              { backgroundColor: theme.colors.accent },
            ]}
          >
            {isResuming ? (
              <Text variant="caption" style={styles.resumeButtonText}>
                {displayProgress}%
              </Text>
            ) : (
              <>
                <Ionicons name="play" size={14} color="white" />
                <Text variant="caption" style={styles.resumeButtonText}>
                  Resume
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Progress bar */}
      <View
        style={[
          styles.progressBarBg,
          {
            backgroundColor: seasonalTheme.isDark
              ? "rgba(255, 255, 255, 0.1)"
              : "rgba(0, 0, 0, 0.1)",
          },
        ]}
      >
        <View
          style={[
            styles.progressBarFill,
            {
              width: `${displayProgress}%`,
              backgroundColor: theme.colors.accent,
            },
          ]}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: spacingPatterns.screen,
    marginTop: spacingPatterns.md,
    marginBottom: spacingPatterns.md,
    padding: spacingPatterns.md,
    borderRadius: borderRadius.lg,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacingPatterns.sm,
    marginBottom: spacingPatterns.xs,
  },
  iconContainer: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontWeight: "500",
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 11,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacingPatterns.xs,
  },
  actionButton: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  resumeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacingPatterns.sm,
    paddingVertical: spacingPatterns.xs,
    borderRadius: borderRadius.sm,
    minWidth: 70,
    justifyContent: "center",
  },
  resumeButtonText: {
    color: "white",
    fontWeight: "600",
    fontSize: 12,
  },
  progressBarBg: {
    height: 3,
    borderRadius: borderRadius.sm,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: borderRadius.sm,
  },
});
