import { Ionicons } from "@expo/vector-icons";
import React, { useState, useEffect } from "react";
import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { ALL_MODELS } from "../ai/modelConfig";
import { ensureModelPresent, getModelSize } from "../ai/modelManager";
import { persistentDownloadManager, type DownloadMetadata } from "../ai/persistentDownloadManager";
import { useModelSettings } from "../db/modelSettings";
import { spacingPatterns, borderRadius } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { useTheme } from "../theme/ThemeProvider";
import { Text } from "./Text";
import { useToast } from "./ToastProvider";

/**
 * Shows a list of pending downloads that can be resumed
 */
export function PendingDownloads() {
  const [pendingDownloads, setPendingDownloads] = useState<DownloadMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [resumingModelId, setResumingModelId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<Map<string, number>>(new Map());
  const seasonalTheme = useSeasonalTheme();
  const theme = useTheme();
  const modelSettings = useModelSettings();
  const { showToast } = useToast();

  useEffect(() => {
    loadPendingDownloads();
  }, []);

  const loadPendingDownloads = async () => {
    try {
      const pending = await persistentDownloadManager.getPendingDownloads();
      // Group by modelId (a model may have multiple files)
      const uniqueByModel = pending.reduce((acc, download) => {
        if (!acc.find(d => d.modelId === download.modelId)) {
          acc.push(download);
        }
        return acc;
      }, [] as DownloadMetadata[]);
      
      setPendingDownloads(uniqueByModel);
    } catch (error) {
      console.error('Failed to load pending downloads:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResume = async (download: DownloadMetadata) => {
    try {
      setResumingModelId(download.modelId);
      setDownloadProgress(prev => new Map(prev).set(download.modelId, 0));

      // Find the model config
      const modelConfig = ALL_MODELS.find(m => m.modelId === download.modelId);
      if (!modelConfig) {
        console.error('Model config not found:', download.modelId);
        showToast('Model configuration not found', 'error');
        return;
      }

      // Resume the download by calling ensureModelPresent
      // This will automatically resume from where it left off
      const result = await ensureModelPresent(modelConfig, (progress) => {
        // Update progress for this model
        setDownloadProgress(prev => {
          const next = new Map(prev);
          next.set(download.modelId, Math.round(progress * 100));
          return next;
        });
      });

      // Get final size and save to model settings (same as ModelManagement)
      const size = await getModelSize(modelConfig);

      await modelSettings.addDownloadedModel({
        modelId: modelConfig.modelId,
        downloadedAt: Date.now(),
        ptePath: result.ptePath,
        tokenizerPath: result.tokenizerPath,
        tokenizerConfigPath: result.tokenizerConfigPath,
        size,
      });

      showToast(`${modelConfig.displayName} downloaded successfully`, 'success');

      // Reload pending downloads to update UI
      await loadPendingDownloads();
    } catch (error: unknown) {
      console.error('Failed to resume download:', error);
      const err = error as { message?: string };
      showToast(err?.message || 'Failed to resume download', 'error');
    } finally {
      setResumingModelId(null);
      setDownloadProgress(prev => {
        const next = new Map(prev);
        next.delete(download.modelId);
        return next;
      });
    }
  };

  const handleCancel = async (download: DownloadMetadata) => {
    try {
      await persistentDownloadManager.cancelDownload(download.modelId, download.fileType);
      await loadPendingDownloads();
    } catch (error) {
      console.error('Failed to cancel download:', error);
    }
  };

  if (isLoading) {
    return null;
  }

  if (pendingDownloads.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons 
          name="download-outline" 
          size={16} 
          color={seasonalTheme.textSecondary} 
        />
        <Text
          variant="caption"
          style={[styles.headerText, { color: seasonalTheme.textSecondary }]}
        >
          {pendingDownloads.length} paused download{pendingDownloads.length > 1 ? 's' : ''} • Tap to resume
        </Text>
      </View>

      {pendingDownloads.map((download) => {
        const isResuming = resumingModelId === download.modelId;
        const ageInDays = Math.floor((Date.now() - download.startedAt) / (1000 * 60 * 60 * 24));
        const currentProgress = downloadProgress.get(download.modelId);
        const displayProgress = currentProgress !== undefined
          ? currentProgress
          : (download.bytesTotal > 0 ? Math.round((download.bytesWritten / download.bytesTotal) * 100) : 0);

        return (
          <View
            key={`${download.modelId}-${download.fileType}`}
            style={[
              styles.downloadItem,
              {
                backgroundColor: seasonalTheme.cardBg,
                borderColor: isResuming ? theme.colors.accent : seasonalTheme.textSecondary + '30',
              },
            ]}
          >
            <View style={styles.downloadInfo}>
              <Text
                variant="body"
                style={[styles.downloadTitle, { color: seasonalTheme.textPrimary }]}
              >
                {download.modelName}
              </Text>
              <Text
                variant="caption"
                style={[styles.downloadSubtitle, { color: seasonalTheme.textSecondary }]}
              >
                {isResuming
                  ? `${displayProgress}% • Downloading`
                  : (displayProgress > 0 ? `${displayProgress}% • ` : '') +
                    (ageInDays > 0 ? `${ageInDays} day${ageInDays > 1 ? 's' : ''} ago` : 'Today')}
              </Text>

              {/* Progress bar */}
              {(displayProgress > 0 || isResuming) && (
                <View
                  style={[
                    styles.progressBarBg,
                    { backgroundColor: seasonalTheme.textSecondary + '30' },
                  ]}
                >
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${displayProgress}%`,
                        backgroundColor: isResuming ? theme.colors.accent : seasonalTheme.textSecondary + '60',
                      },
                    ]}
                  />
                </View>
              )}
            </View>

            <View style={styles.downloadActions}>
              <TouchableOpacity
                onPress={() => handleResume(download)}
                disabled={isResuming}
                style={[
                  styles.actionButton,
                  {
                    backgroundColor: isResuming ? theme.colors.accent + '20' : seasonalTheme.textPrimary + '15',
                  },
                ]}
              >
                {isResuming ? (
                  <ActivityIndicator size="small" color={theme.colors.accent} />
                ) : (
                  <Ionicons
                    name="play"
                    size={18}
                    color={seasonalTheme.textPrimary}
                  />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleCancel(download)}
                disabled={isResuming}
                style={[
                  styles.actionButton,
                  {
                    backgroundColor: '#FF6B6B15',
                    opacity: isResuming ? 0.5 : 1,
                  },
                ]}
              >
                <Ionicons
                  name="close"
                  size={18}
                  color="#FF6B6B"
                />
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacingPatterns.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacingPatterns.xs,
    paddingHorizontal: spacingPatterns.sm,
    marginBottom: spacingPatterns.xxs,
  },
  headerText: {
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  downloadItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacingPatterns.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    gap: spacingPatterns.sm,
  },
  downloadInfo: {
    flex: 1,
  },
  downloadTitle: {
    fontWeight: '500',
    marginBottom: 2,
  },
  downloadSubtitle: {
    fontSize: 11,
    marginBottom: spacingPatterns.xs,
  },
  progressBarBg: {
    height: 2,
    borderRadius: 1,
    overflow: "hidden",
    marginTop: spacingPatterns.xxs,
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 1,
  },
  downloadActions: {
    flexDirection: 'row',
    gap: spacingPatterns.xs,
  },
  actionButton: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

