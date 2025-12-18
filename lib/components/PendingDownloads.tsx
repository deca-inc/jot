import React, { useState, useEffect } from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./Text";
import { Button } from "./Button";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { spacingPatterns, borderRadius } from "../theme";
import { persistentDownloadManager, type DownloadMetadata } from "../ai/persistentDownloadManager";
import { ensureModelPresent } from "../ai/modelManager";
import { ALL_MODELS } from "../ai/modelConfig";

/**
 * Shows a list of pending downloads that can be resumed
 */
export function PendingDownloads() {
  const [pendingDownloads, setPendingDownloads] = useState<DownloadMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [resumingModelId, setResumingModelId] = useState<string | null>(null);
  const seasonalTheme = useSeasonalTheme();

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
      
      // Find the model config
      const modelConfig = ALL_MODELS.find(m => m.modelId === download.modelId);
      if (!modelConfig) {
        console.error('Model config not found:', download.modelId);
        return;
      }

      // Resume the download by calling ensureModelPresent
      // This will automatically resume from where it left off
      await ensureModelPresent(modelConfig);
      
      // Reload pending downloads to update UI
      await loadPendingDownloads();
    } catch (error) {
      console.error('Failed to resume download:', error);
    } finally {
      setResumingModelId(null);
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
        
        return (
          <View
            key={`${download.modelId}-${download.fileType}`}
            style={[
              styles.downloadItem,
              {
                backgroundColor: seasonalTheme.cardBg,
                borderColor: seasonalTheme.textSecondary + '30',
              }
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
                {download.bytesTotal > 0 ? `${Math.round((download.bytesWritten / download.bytesTotal) * 100)}% • ` : ''}
                {ageInDays > 0 ? `${ageInDays} day${ageInDays > 1 ? 's' : ''} ago` : 'Today'}
              </Text>
              
              {/* Progress bar */}
              {download.bytesTotal > 0 && (
                <View
                  style={[
                    styles.progressBarBg,
                    { backgroundColor: seasonalTheme.textSecondary + '30' }
                  ]}
                >
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${(download.bytesWritten / download.bytesTotal) * 100}%`,
                        backgroundColor: seasonalTheme.textSecondary + '60',
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
                    backgroundColor: seasonalTheme.textPrimary + '15',
                  }
                ]}
              >
                <Ionicons
                  name={isResuming ? "hourglass-outline" : "play"}
                  size={18}
                  color={seasonalTheme.textPrimary}
                />
              </TouchableOpacity>
              
              <TouchableOpacity
                onPress={() => handleCancel(download)}
                disabled={isResuming}
                style={[
                  styles.actionButton,
                  { 
                    backgroundColor: '#FF6B6B15',
                  }
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

