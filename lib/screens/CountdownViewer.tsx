import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useState, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTrackScreenView, useTrackEvent } from "../analytics";
import { Text, Dialog, MenuItem } from "../components";
import { Entry, extractPreviewText } from "../db/entries";
import {
  useEntry,
  useChildEntries,
  useUpdateEntry,
  useDeleteEntry,
  useArchiveEntry,
  useUnarchiveEntry,
} from "../db/useEntries";
import { spacingPatterns, borderRadius } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import {
  extractCountdownData,
  formatCountdown,
  calculateTimeRemaining,
} from "../utils/countdown";
import { cancelNotification } from "../utils/notifications";

export interface CountdownViewerProps {
  entryId: number;
  onClose?: () => void;
  onEdit?: (entryId: number) => void;
  onAddCheckin?: (parentId: number) => void;
  onOpenCheckin?: (entryId: number) => void;
  showCheckinPrompt?: boolean;
  onDismissCheckinPrompt?: () => void;
}

// Helper to format date for display
function formatDateForDisplay(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// Helper to format time for display
function formatTimeForDisplay(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Helper to format check-in date
function formatCheckinDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) {
    return "Today";
  } else if (isYesterday) {
    return "Yesterday";
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * Screen for viewing a countdown with its check-ins.
 */
export function CountdownViewer({
  entryId,
  onClose,
  onEdit,
  onAddCheckin,
  onOpenCheckin,
}: CountdownViewerProps) {
  const seasonalTheme = useSeasonalTheme();
  const insets = useSafeAreaInsets();

  // Track screen view
  useTrackScreenView("Countdown Viewer");

  // Get the countdown entry
  const { data: entry, isLoading, refetch } = useEntry(entryId);

  // Get child entries (check-ins)
  const { data: checkins = [], isLoading: checkinsLoading } =
    useChildEntries(entryId);

  // State for check-in prompt visibility (synced with prop)

  // State for refreshing
  const [refreshing, setRefreshing] = useState(false);

  // State for overflow menu and dialogs
  const [showMenu, setShowMenu] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);

  // Mutations
  const updateEntryMutation = useUpdateEntry();
  const deleteEntryMutation = useDeleteEntry();
  const archiveEntryMutation = useArchiveEntry();
  const unarchiveEntryMutation = useUnarchiveEntry();
  const trackEvent = useTrackEvent();

  // Timer state for live updates
  const [, setTick] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined,
  );

  // Extract countdown data
  const countdownData = entry ? extractCountdownData(entry.blocks) : null;

  // Set up timer for live countdown updates
  useEffect(() => {
    if (countdownData) {
      timerRef.current = setInterval(() => {
        setTick((prev) => prev + 1);
      }, 1000);

      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      };
    }
  }, [countdownData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  const handleEdit = useCallback(() => {
    onEdit?.(entryId);
  }, [onEdit, entryId]);

  const handleAddCheckin = useCallback(() => {
    onAddCheckin?.(entryId);
  }, [onAddCheckin, entryId]);

  const handleOpenCheckin = useCallback(
    (checkinId: number) => {
      onOpenCheckin?.(checkinId);
    },
    [onOpenCheckin],
  );

  // Handler: Delete countdown
  const handleDelete = useCallback(async () => {
    Alert.alert(
      "Delete Countdown",
      "Are you sure you want to delete this countdown and all its check-ins? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              // Cancel notification if exists
              if (countdownData?.notificationId) {
                await cancelNotification(countdownData.notificationId);
              }
              await deleteEntryMutation.mutateAsync(entryId);
              trackEvent("Delete Entry", { entryType: "countdown" });
              onClose?.();
            } catch (error) {
              console.error("[CountdownViewer] Error deleting:", error);
              Alert.alert("Error", "Failed to delete countdown");
            }
          },
        },
      ],
    );
  }, [
    countdownData?.notificationId,
    deleteEntryMutation,
    entryId,
    trackEvent,
    onClose,
  ]);

  // Handler: Archive/Unarchive countdown
  const handleArchive = useCallback(async () => {
    try {
      if (entry?.archivedAt) {
        await unarchiveEntryMutation.mutateAsync(entryId);
        trackEvent("Unarchive Entry", { entryType: "countdown" });
      } else {
        // Cancel notification before archiving
        if (countdownData?.notificationId) {
          await cancelNotification(countdownData.notificationId);
        }
        await archiveEntryMutation.mutateAsync(entryId);
        trackEvent("Archive Entry", { entryType: "countdown" });
      }
    } catch (error) {
      console.error("[CountdownViewer] Error archiving:", error);
      Alert.alert("Error", "Failed to archive countdown");
    }
  }, [
    entry?.archivedAt,
    countdownData?.notificationId,
    archiveEntryMutation,
    unarchiveEntryMutation,
    entryId,
    trackEvent,
  ]);

  // Handler: Reset countup timer
  const handleResetCountup = useCallback(async () => {
    if (!entry || !countdownData?.isCountUp) return;

    try {
      // Create updated blocks with new targetDate (now)
      const updatedBlocks = entry.blocks.map((block) => {
        if (block.type === "countdown") {
          return {
            ...block,
            targetDate: Date.now(),
          };
        }
        return block;
      });

      await updateEntryMutation.mutateAsync({
        id: entryId,
        input: { blocks: updatedBlocks },
      });
      trackEvent("Reset Countup", { entryType: "countdown" });
      setShowResetDialog(false);
    } catch (error) {
      console.error("[CountdownViewer] Error resetting countup:", error);
      Alert.alert("Error", "Failed to reset timer");
    }
  }, [
    entry,
    countdownData?.isCountUp,
    updateEntryMutation,
    entryId,
    trackEvent,
  ]);

  // Loading state
  if (isLoading || !entry || !countdownData) {
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: seasonalTheme.gradient.middle },
        ]}
      >
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <TouchableOpacity onPress={handleClose} style={styles.backButton}>
            <Ionicons
              name="chevron-back"
              size={24}
              color={seasonalTheme.textPrimary}
            />
          </TouchableOpacity>
          <Text variant="h3" style={{ color: seasonalTheme.textPrimary }}>
            Loading...
          </Text>
          <View style={styles.headerSpacer} />
        </View>
      </View>
    );
  }

  const timeRemaining = calculateTimeRemaining(countdownData.targetDate);
  const formattedTime = formatCountdown(
    countdownData.targetDate,
    countdownData.isCountUp,
  );
  const targetDate = new Date(countdownData.targetDate);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: seasonalTheme.gradient.middle },
      ]}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={handleClose} style={styles.backButton}>
          <Ionicons
            name="chevron-back"
            size={24}
            color={seasonalTheme.textPrimary}
          />
        </TouchableOpacity>
        <Text
          variant="body"
          style={{ color: seasonalTheme.textSecondary, flex: 1 }}
        >
          {countdownData.isCountUp ? "Time Since" : "Countdown"}
        </Text>
        <TouchableOpacity
          onPress={() => setShowMenu(true)}
          style={styles.menuButton}
        >
          <Ionicons
            name="ellipsis-horizontal"
            size={24}
            color={seasonalTheme.textPrimary}
          />
        </TouchableOpacity>
      </View>

      {/* Fixed Top Section - Title, Timer, Date */}
      <View style={styles.topSection}>
        {/* Title */}
        <Text
          variant="h1"
          style={[
            styles.title,
            { color: seasonalTheme.textPrimary, textAlign: "center" },
          ]}
        >
          {countdownData.title}
        </Text>

        {/* Large Timer Display */}
        <View style={styles.timerContainer}>
          <Text
            style={[styles.timerText, { color: seasonalTheme.textPrimary }]}
          >
            {formattedTime}
          </Text>
          {timeRemaining.isPast && !countdownData.isCountUp && (
            <View
              style={[
                styles.completeBadge,
                { backgroundColor: seasonalTheme.chipBg },
              ]}
            >
              <Ionicons
                name="checkmark-circle"
                size={16}
                color={seasonalTheme.chipText}
              />
              <Text
                variant="caption"
                style={{ color: seasonalTheme.chipText, marginLeft: 4 }}
              >
                Complete
              </Text>
            </View>
          )}
        </View>

        {/* Target Date */}
        <View style={styles.targetDateContainer}>
          <Ionicons
            name="calendar-outline"
            size={18}
            color={seasonalTheme.textSecondary}
          />
          <Text
            variant="body"
            style={[
              styles.targetDateText,
              { color: seasonalTheme.textSecondary },
            ]}
          >
            {countdownData.isCountUp ? "Started" : "Target"}:{" "}
            {formatDateForDisplay(targetDate)} at{" "}
            {formatTimeForDisplay(targetDate)}
          </Text>
        </View>
      </View>

      {/* Scrollable Check-ins Section */}
      <View style={styles.checkinsContainer}>
        {/* Check-ins Header */}
        <View
          style={[
            styles.checkinsSectionHeader,
            { paddingHorizontal: spacingPatterns.screen },
          ]}
        >
          <Text variant="h3" style={{ color: seasonalTheme.textPrimary }}>
            Check-ins
          </Text>
          {checkins.length > 0 && (
            <Text
              variant="caption"
              style={{ color: seasonalTheme.textSecondary }}
            >
              ({checkins.length})
            </Text>
          )}
        </View>

        {/* Scrollable Check-ins List */}
        <ScrollView
          style={styles.checkinsScrollView}
          contentContainerStyle={[
            styles.checkinsContent,
            { paddingBottom: insets.bottom + 80 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={seasonalTheme.textSecondary}
            />
          }
        >
          {checkinsLoading ? (
            <Text
              variant="body"
              style={{
                color: seasonalTheme.textSecondary,
                marginTop: spacingPatterns.md,
              }}
            >
              Loading check-ins...
            </Text>
          ) : checkins.length === 0 ? (
            <View
              style={[
                styles.emptyState,
                {
                  backgroundColor: seasonalTheme.isDark
                    ? "rgba(255, 255, 255, 0.05)"
                    : "rgba(0, 0, 0, 0.03)",
                },
              ]}
            >
              <Ionicons
                name="document-text-outline"
                size={32}
                color={seasonalTheme.textSecondary + "60"}
              />
              <Text
                variant="body"
                style={[
                  styles.emptyStateText,
                  { color: seasonalTheme.textSecondary },
                ]}
              >
                No check-ins yet
              </Text>
              <Text
                variant="caption"
                style={{
                  color: seasonalTheme.textSecondary + "80",
                  textAlign: "center",
                }}
              >
                Add a check-in to track your progress
              </Text>
            </View>
          ) : (
            <View style={styles.checkinsList}>
              {checkins.map((checkin: Entry) => (
                <TouchableOpacity
                  key={checkin.id}
                  style={[
                    styles.checkinItem,
                    {
                      backgroundColor: seasonalTheme.isDark
                        ? "rgba(255, 255, 255, 0.08)"
                        : "rgba(255, 255, 255, 0.9)",
                    },
                  ]}
                  onPress={() => handleOpenCheckin(checkin.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.checkinDate}>
                    <Text
                      variant="caption"
                      style={{
                        color: seasonalTheme.chipText,
                        fontWeight: "600",
                      }}
                    >
                      {formatCheckinDate(checkin.createdAt)}
                    </Text>
                  </View>
                  <Text
                    variant="body"
                    style={{ color: seasonalTheme.textPrimary }}
                    numberOfLines={2}
                  >
                    {checkin.title ||
                      extractPreviewText(checkin.blocks) ||
                      "Untitled check-in"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      </View>

      {/* Fixed Add Check-in Button */}
      <View
        style={[
          styles.footer,
          {
            backgroundColor: seasonalTheme.gradient.middle,
            paddingBottom: insets.bottom + spacingPatterns.md,
          },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.addCheckinButton,
            { backgroundColor: seasonalTheme.chipText },
          ]}
          onPress={handleAddCheckin}
          activeOpacity={0.8}
        >
          <Ionicons
            name="add"
            size={20}
            color={seasonalTheme.isDark ? "#000" : "#fff"}
          />
          <Text
            variant="body"
            style={[
              styles.addCheckinText,
              { color: seasonalTheme.isDark ? "#000" : "#fff" },
            ]}
          >
            Add Check-in
          </Text>
        </TouchableOpacity>
      </View>

      {/* Overflow Menu Dialog */}
      <Dialog visible={showMenu} onRequestClose={() => setShowMenu(false)}>
        <MenuItem
          icon="pencil-outline"
          label="Edit Timer"
          onPress={() => {
            setShowMenu(false);
            handleEdit();
          }}
        />
        {countdownData.isCountUp && (
          <MenuItem
            icon="refresh-outline"
            label="Reset Timer"
            onPress={() => {
              setShowMenu(false);
              setShowResetDialog(true);
            }}
          />
        )}
        <MenuItem
          icon={entry.archivedAt ? "arrow-undo-outline" : "archive-outline"}
          label={entry.archivedAt ? "Unarchive" : "Archive"}
          onPress={() => {
            setShowMenu(false);
            handleArchive();
          }}
        />
        <MenuItem
          icon="trash-outline"
          label="Delete"
          variant="destructive"
          onPress={() => {
            setShowMenu(false);
            handleDelete();
          }}
        />
      </Dialog>

      {/* Reset Timer Dialog */}
      <Dialog
        visible={showResetDialog}
        onRequestClose={() => setShowResetDialog(false)}
        containerStyle={styles.resetDialog}
      >
        <Text
          variant="h3"
          style={{
            color: seasonalTheme.textPrimary,
            marginBottom: spacingPatterns.sm,
            textAlign: "center",
          }}
        >
          Reset Timer?
        </Text>
        {countdownData.rewardsNote && (
          <Text
            variant="body"
            style={{
              color: seasonalTheme.textSecondary,
              marginBottom: spacingPatterns.md,
              textAlign: "center",
              lineHeight: 22,
            }}
          >
            {countdownData.rewardsNote}
          </Text>
        )}
        <Text
          variant="caption"
          style={{
            color: seasonalTheme.textSecondary,
            marginBottom: spacingPatterns.md,
            textAlign: "center",
          }}
        >
          This will start the timer from now.
        </Text>
        <View style={styles.resetButtons}>
          <TouchableOpacity
            style={[
              styles.resetButton,
              {
                backgroundColor: seasonalTheme.textSecondary + "20",
              },
            ]}
            onPress={() => setShowResetDialog(false)}
          >
            <Text style={{ color: seasonalTheme.textPrimary }}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.resetButton,
              {
                backgroundColor: seasonalTheme.textPrimary,
              },
            ]}
            onPress={handleResetCountup}
          >
            <Text
              style={{
                color: seasonalTheme.gradient.middle,
                fontWeight: "600",
              }}
            >
              Reset
            </Text>
          </TouchableOpacity>
        </View>
      </Dialog>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacingPatterns.screen,
    paddingBottom: spacingPatterns.sm,
  },
  backButton: {
    padding: spacingPatterns.xs,
    marginLeft: -spacingPatterns.xs,
  },
  editButton: {
    padding: spacingPatterns.xs,
    marginRight: -spacingPatterns.xs,
  },
  menuButton: {
    padding: spacingPatterns.xs,
    marginRight: -spacingPatterns.xs,
  },
  headerSpacer: {
    width: 32,
  },
  topSection: {
    paddingHorizontal: spacingPatterns.screen,
    paddingTop: spacingPatterns.sm,
  },
  title: {
    marginBottom: spacingPatterns.sm,
  },
  timerContainer: {
    alignItems: "center",
    marginBottom: spacingPatterns.md,
  },
  timerText: {
    fontSize: 56,
    fontWeight: "700",
    letterSpacing: -2,
    lineHeight: 64,
  },
  completeBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacingPatterns.md,
    paddingVertical: spacingPatterns.xs,
    borderRadius: borderRadius.full,
    marginTop: spacingPatterns.sm,
  },
  targetDateContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacingPatterns.md,
  },
  targetDateText: {
    marginLeft: spacingPatterns.xs,
  },
  checkinsContainer: {
    flex: 1,
  },
  checkinsSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacingPatterns.xs,
    marginBottom: spacingPatterns.sm,
  },
  promptCard: {
    padding: spacingPatterns.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    marginBottom: spacingPatterns.md,
  },
  promptContent: {
    flex: 1,
    marginLeft: spacingPatterns.sm,
    marginTop: spacingPatterns.xs,
  },
  promptButtons: {
    flexDirection: "row",
    marginTop: spacingPatterns.md,
    gap: spacingPatterns.sm,
  },
  promptButton: {
    paddingHorizontal: spacingPatterns.md,
    paddingVertical: spacingPatterns.xs,
    borderRadius: borderRadius.md,
  },
  laterButton: {
    paddingHorizontal: spacingPatterns.md,
    paddingVertical: spacingPatterns.xs,
  },
  checkinsScrollView: {
    flex: 1,
  },
  checkinsContent: {
    paddingHorizontal: spacingPatterns.screen,
  },
  rewardsCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: spacingPatterns.md,
    borderRadius: borderRadius.md,
    marginBottom: spacingPatterns.md,
  },
  rewardsText: {
    flex: 1,
    marginLeft: spacingPatterns.sm,
  },
  emptyState: {
    alignItems: "center",
    padding: spacingPatterns.xl,
    borderRadius: borderRadius.md,
  },
  emptyStateText: {
    marginTop: spacingPatterns.sm,
    marginBottom: spacingPatterns.xs,
  },
  checkinsList: {
    gap: spacingPatterns.sm,
  },
  checkinItem: {
    padding: spacingPatterns.md,
    borderRadius: borderRadius.md,
  },
  checkinDate: {
    marginBottom: spacingPatterns.xs,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacingPatterns.screen,
    paddingTop: spacingPatterns.md,
  },
  addCheckinButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: borderRadius.md,
    paddingVertical: spacingPatterns.sm,
    gap: spacingPatterns.xs,
  },
  addCheckinText: {
    fontWeight: "600",
  },
  resetDialog: {
    width: "80%",
    maxWidth: 400,
    padding: spacingPatterns.lg,
  },
  resetButtons: {
    flexDirection: "row",
    gap: spacingPatterns.sm,
  },
  resetButton: {
    flex: 1,
    paddingVertical: spacingPatterns.sm,
    paddingHorizontal: spacingPatterns.md,
    borderRadius: borderRadius.md,
    alignItems: "center",
  },
});
