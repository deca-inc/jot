import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useState, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTrackScreenView } from "../analytics";
import { Text } from "../components";
import { Entry, extractPreviewText } from "../db/entries";
import { useEntry, useChildEntries } from "../db/useEntries";
import { spacingPatterns, borderRadius } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import {
  extractCountdownData,
  formatCountdown,
  calculateTimeRemaining,
} from "../utils/countdown";

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
  showCheckinPrompt = false,
  onDismissCheckinPrompt,
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
  const [showPrompt, setShowPrompt] = useState(showCheckinPrompt);

  // Sync local prompt state with prop
  useEffect(() => {
    setShowPrompt(showCheckinPrompt);
  }, [showCheckinPrompt]);

  // State for refreshing
  const [refreshing, setRefreshing] = useState(false);

  // Timer state for live updates
  const [, setTick] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

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
    setShowPrompt(false);
    onDismissCheckinPrompt?.();
    onAddCheckin?.(entryId);
  }, [onAddCheckin, entryId, onDismissCheckinPrompt]);

  const handleDismissPrompt = useCallback(() => {
    setShowPrompt(false);
    onDismissCheckinPrompt?.();
  }, [onDismissCheckinPrompt]);

  const handleOpenCheckin = useCallback(
    (checkinId: number) => {
      onOpenCheckin?.(checkinId);
    },
    [onOpenCheckin],
  );

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
        <TouchableOpacity onPress={handleEdit} style={styles.editButton}>
          <Text
            variant="body"
            style={{ color: seasonalTheme.chipText, fontWeight: "600" }}
          >
            Edit
          </Text>
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
            style={[
              styles.timerText,
              { color: seasonalTheme.textPrimary },
            ]}
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
            style={[styles.targetDateText, { color: seasonalTheme.textSecondary }]}
          >
            {countdownData.isCountUp ? "Started" : "Target"}:{" "}
            {formatDateForDisplay(targetDate)} at {formatTimeForDisplay(targetDate)}
          </Text>
        </View>
      </View>

      {/* Scrollable Check-ins Section */}
      <View style={styles.checkinsContainer}>
        {/* Check-ins Header */}
        <View style={[styles.checkinsSectionHeader, { paddingHorizontal: spacingPatterns.screen }]}>
          <Text
            variant="h3"
            style={{ color: seasonalTheme.textPrimary }}
          >
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

        {/* Check-in Prompt (shown when arriving from notification) */}
        {showPrompt && (
          <View
            style={[
              styles.promptCard,
              {
                backgroundColor: seasonalTheme.chipBg,
                borderColor: seasonalTheme.chipText + "40",
                marginHorizontal: spacingPatterns.screen,
              },
            ]}
          >
            <Ionicons
              name="create-outline"
              size={24}
              color={seasonalTheme.chipText}
            />
            <View style={styles.promptContent}>
              <Text
                variant="body"
                style={{ color: seasonalTheme.chipText, fontWeight: "600" }}
              >
                Time for your check-in!
              </Text>
              <Text
                variant="caption"
                style={{ color: seasonalTheme.chipText, marginTop: 2 }}
              >
                How are things going?
              </Text>
            </View>
            <View style={styles.promptButtons}>
              <TouchableOpacity
                style={[
                  styles.promptButton,
                  { backgroundColor: seasonalTheme.chipText },
                ]}
                onPress={handleAddCheckin}
              >
                <Text
                  variant="caption"
                  style={{
                    color: seasonalTheme.isDark ? "#000" : "#fff",
                    fontWeight: "600",
                  }}
                >
                  Add Check-in
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.laterButton}
                onPress={handleDismissPrompt}
              >
                <Text
                  variant="caption"
                  style={{ color: seasonalTheme.chipText }}
                >
                  Later
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

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
          {/* Rewards Note (if any) */}
          {countdownData.rewardsNote && (
            <View
              style={[
                styles.rewardsCard,
                {
                  backgroundColor: seasonalTheme.isDark
                    ? "rgba(255, 255, 255, 0.08)"
                    : "rgba(255, 255, 255, 0.9)",
                },
              ]}
            >
              <Ionicons
                name="gift-outline"
                size={20}
                color={seasonalTheme.chipText}
              />
              <Text
                variant="body"
                style={[
                  styles.rewardsText,
                  { color: seasonalTheme.textPrimary },
                ]}
              >
                {countdownData.rewardsNote}
              </Text>
            </View>
          )}

          {checkinsLoading ? (
            <Text
              variant="body"
              style={{ color: seasonalTheme.textSecondary, marginTop: spacingPatterns.md }}
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
                style={{ color: seasonalTheme.textSecondary + "80", textAlign: "center" }}
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
                      style={{ color: seasonalTheme.chipText, fontWeight: "600" }}
                    >
                      {formatCheckinDate(checkin.createdAt)}
                    </Text>
                  </View>
                  <Text
                    variant="body"
                    style={{ color: seasonalTheme.textPrimary }}
                    numberOfLines={2}
                  >
                    {checkin.title || extractPreviewText(checkin.blocks) || "Untitled check-in"}
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
});
