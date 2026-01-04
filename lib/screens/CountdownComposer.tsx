import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import React, { useCallback, useState, useRef, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  Platform,
  Keyboard,
  LayoutAnimation,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTrackScreenView } from "../analytics";
import { Text } from "../components";
import { useCreateEntry, useUpdateEntry, useEntry } from "../db/useEntries";
import { spacingPatterns, borderRadius } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import { createCountdownBlock, extractCountdownData } from "../utils/countdown";

export interface CountdownComposerProps {
  entryId?: number;
  onSave?: (entryId: number) => void;
  onCancel?: () => void;
}

// Helper to format date for display
function formatDateForDisplay(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
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

export function CountdownComposer({
  entryId,
  onSave,
  onCancel,
}: CountdownComposerProps) {
  const seasonalTheme = useSeasonalTheme();
  const insets = useSafeAreaInsets();

  // Track screen view
  useTrackScreenView("Countdown Composer");

  // Get existing entry if editing
  const { data: existingEntry } = useEntry(entryId);

  // Extract existing countdown data if editing
  const existingData = existingEntry
    ? extractCountdownData(existingEntry.blocks)
    : null;

  // Initialize state from existing data or defaults
  const initialDate = existingData
    ? new Date(existingData.targetDate)
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // Default: 1 week from now

  const [title, setTitle] = useState(existingData?.title || "");
  const [targetDate, setTargetDate] = useState(initialDate);
  const [isCountUp, setIsCountUp] = useState(existingData?.isCountUp ?? false);
  const [rewardsNote, setRewardsNote] = useState(
    existingData?.rewardsNote || "",
  );
  const [confettiEnabled, setConfettiEnabled] = useState(
    existingData?.confettiEnabled ?? false,
  );
  const [showAdvanced, setShowAdvanced] = useState(
    !!(existingData?.rewardsNote || existingData?.confettiEnabled === true),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [hasLoadedExistingData, setHasLoadedExistingData] = useState(false);

  // Sync form state when existing entry data loads
  useEffect(() => {
    if (existingEntry && !hasLoadedExistingData) {
      const data = extractCountdownData(existingEntry.blocks);
      if (data) {
        setTitle(data.title);
        setTargetDate(new Date(data.targetDate));
        setIsCountUp(data.isCountUp ?? false);
        setRewardsNote(data.rewardsNote || "");
        setConfettiEnabled(data.confettiEnabled ?? false);
        setShowAdvanced(!!(data.rewardsNote || data.confettiEnabled === true));
        setHasLoadedExistingData(true);
      }
    }
  }, [existingEntry, hasLoadedExistingData]);

  // Picker visibility state (for Android which shows modal)
  const [showDatePicker, setShowDatePicker] = useState(Platform.OS === "ios");
  const [showTimePicker, setShowTimePicker] = useState(Platform.OS === "ios");
  const [pickerMode, setPickerMode] = useState<"date" | "time">("date");

  // Keyboard state for positioning save button
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);

  // Listen for keyboard events
  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSubscription = Keyboard.addListener(showEvent, (e) => {
      if (Platform.OS === "ios") {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      }
      setKeyboardHeight(e.endCoordinates.height);
    });

    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      if (Platform.OS === "ios") {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      }
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  // Mutations
  const createEntry = useCreateEntry();
  const updateEntry = useUpdateEntry();

  // Refs for stable callbacks
  const createEntryRef = useRef(createEntry);
  createEntryRef.current = createEntry;
  const updateEntryRef = useRef(updateEntry);
  updateEntryRef.current = updateEntry;

  const handleDateChange = useCallback(
    (event: DateTimePickerEvent, selectedDate?: Date) => {
      if (Platform.OS === "android") {
        setShowDatePicker(false);
        setShowTimePicker(false);
      }

      if (selectedDate) {
        if (Platform.OS === "ios") {
          // iOS compact pickers update the full date directly
          setTargetDate(selectedDate);
        } else if (event.type === "set") {
          // Android: merge date/time based on picker mode
          if (pickerMode === "date") {
            const newDate = new Date(targetDate);
            newDate.setFullYear(selectedDate.getFullYear());
            newDate.setMonth(selectedDate.getMonth());
            newDate.setDate(selectedDate.getDate());
            setTargetDate(newDate);
          } else {
            const newDate = new Date(targetDate);
            newDate.setHours(selectedDate.getHours());
            newDate.setMinutes(selectedDate.getMinutes());
            setTargetDate(newDate);
          }
        }
      }
    },
    [targetDate, pickerMode],
  );

  const showDatePickerModal = useCallback(() => {
    setPickerMode("date");
    setShowDatePicker(true);
  }, []);

  const showTimePickerModal = useCallback(() => {
    setPickerMode("time");
    setShowTimePicker(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!title.trim()) {
      return;
    }

    setIsSaving(true);

    try {
      const block = createCountdownBlock({
        targetDate: targetDate.getTime(),
        title: title.trim(),
        isCountUp,
        rewardsNote: rewardsNote.trim() || undefined,
        confettiEnabled,
      });

      if (entryId) {
        // Update existing entry
        await updateEntryRef.current.mutateAsync({
          id: entryId,
          input: {
            title: title.trim(),
            blocks: [block],
          },
        });
        onSave?.(entryId);
      } else {
        // Create new entry (isPinned defaults to true for countdown in repository)
        const entry = await createEntryRef.current.mutateAsync({
          type: "countdown",
          title: title.trim(),
          blocks: [block],
        });
        onSave?.(entry.id);
      }
    } catch (error) {
      console.error("Error saving countdown:", error);
    } finally {
      setIsSaving(false);
    }
  }, [
    title,
    targetDate,
    isCountUp,
    rewardsNote,
    confettiEnabled,
    entryId,
    onSave,
  ]);

  const handleCancel = useCallback(() => {
    onCancel?.();
  }, [onCancel]);

  const isFormValid = title.trim().length > 0;

  // Scroll to bottom when rewards note is focused to ensure it's visible
  const handleRewardsNoteFocus = useCallback(() => {
    // Small delay to allow keyboard to fully show
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, []);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: seasonalTheme.gradient.middle },
      ]}
    >
      {/* Header - minimal top padding */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top,
          },
        ]}
      >
        <TouchableOpacity onPress={handleCancel} style={styles.backButton}>
          <Ionicons
            name="chevron-back"
            size={24}
            color={seasonalTheme.textPrimary}
          />
        </TouchableOpacity>
        <Text variant="h3" style={{ color: seasonalTheme.textPrimary }}>
          {entryId ? "Edit Timer" : "New Timer"}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          // Add extra padding at bottom for the fixed footer + keyboard when visible
          {
            paddingBottom:
              keyboardHeight > 0
                ? 80 +
                  spacingPatterns.md +
                  (Platform.OS === "android"
                    ? keyboardHeight + insets.bottom
                    : keyboardHeight)
                : 80 + insets.bottom,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Title */}
        <View style={styles.formGroup}>
          <Text
            variant="caption"
            style={[styles.label, { color: seasonalTheme.textSecondary }]}
          >
            Title
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                color: seasonalTheme.textPrimary,
                backgroundColor: seasonalTheme.isDark
                  ? "rgba(255, 255, 255, 0.08)"
                  : "rgba(255, 255, 255, 0.9)",
                borderColor: seasonalTheme.textSecondary + "40",
              },
            ]}
            value={title}
            onChangeText={setTitle}
            placeholder={
              isCountUp
                ? "What are you tracking?"
                : "What are you counting down to?"
            }
            placeholderTextColor={seasonalTheme.textSecondary}
            autoFocus
          />
        </View>

        {/* Countdown / Time Since Toggle */}
        <View style={styles.formGroup}>
          <Text
            variant="caption"
            style={[styles.label, { color: seasonalTheme.textSecondary }]}
          >
            Mode
          </Text>
          <View
            style={[
              styles.segmentedControl,
              {
                backgroundColor: seasonalTheme.isDark
                  ? "rgba(255, 255, 255, 0.08)"
                  : "rgba(0, 0, 0, 0.06)",
              },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.segmentButton,
                !isCountUp && {
                  backgroundColor: seasonalTheme.isDark
                    ? "rgba(255, 255, 255, 0.15)"
                    : "rgba(255, 255, 255, 0.95)",
                },
              ]}
              onPress={() => setIsCountUp(false)}
              activeOpacity={0.7}
            >
              <View style={styles.segmentContent}>
                <View style={styles.segmentHeader}>
                  <Ionicons
                    name="hourglass-outline"
                    size={16}
                    color={
                      !isCountUp
                        ? seasonalTheme.textPrimary
                        : seasonalTheme.textSecondary
                    }
                    style={styles.segmentIcon}
                  />
                  <Text
                    variant="body"
                    style={{
                      color: !isCountUp
                        ? seasonalTheme.textPrimary
                        : seasonalTheme.textSecondary,
                      fontWeight: !isCountUp ? "600" : "400",
                    }}
                  >
                    Countdown
                  </Text>
                </View>
                <Text
                  variant="caption"
                  style={[
                    styles.segmentExample,
                    {
                      color: !isCountUp
                        ? seasonalTheme.textSecondary
                        : seasonalTheme.textSecondary + "80",
                    },
                  ]}
                >
                  vacation, deadline, birthday
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.segmentButton,
                isCountUp && {
                  backgroundColor: seasonalTheme.isDark
                    ? "rgba(255, 255, 255, 0.15)"
                    : "rgba(255, 255, 255, 0.95)",
                },
              ]}
              onPress={() => {
                setIsCountUp(true);
                setConfettiEnabled(false);
              }}
              activeOpacity={0.7}
            >
              <View style={styles.segmentContent}>
                <View style={styles.segmentHeader}>
                  <Ionicons
                    name="timer-outline"
                    size={16}
                    color={
                      isCountUp
                        ? seasonalTheme.textPrimary
                        : seasonalTheme.textSecondary
                    }
                    style={styles.segmentIcon}
                  />
                  <Text
                    variant="body"
                    style={{
                      color: isCountUp
                        ? seasonalTheme.textPrimary
                        : seasonalTheme.textSecondary,
                      fontWeight: isCountUp ? "600" : "400",
                    }}
                  >
                    Time Since
                  </Text>
                </View>
                <Text
                  variant="caption"
                  style={[
                    styles.segmentExample,
                    {
                      color: isCountUp
                        ? seasonalTheme.textSecondary
                        : seasonalTheme.textSecondary + "80",
                    },
                  ]}
                >
                  habits, streaks, progress
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Date and Time */}
        <View style={styles.formGroup}>
          <Text
            variant="caption"
            style={[styles.label, { color: seasonalTheme.textSecondary }]}
          >
            {isCountUp ? "Start Date & Time" : "Target Date & Time"}
          </Text>

          {Platform.OS === "ios" ? (
            // iOS: Show compact picker (calendar view when tapped)
            <View style={styles.iosPickerRow}>
              <DateTimePicker
                value={targetDate}
                mode="date"
                display="compact"
                onChange={handleDateChange}
                accentColor={seasonalTheme.chipText}
                themeVariant={seasonalTheme.isDark ? "dark" : "light"}
                style={styles.iosPicker}
              />
              <DateTimePicker
                value={targetDate}
                mode="time"
                display="compact"
                onChange={handleDateChange}
                accentColor={seasonalTheme.chipText}
                themeVariant={seasonalTheme.isDark ? "dark" : "light"}
                style={styles.iosPicker}
              />
            </View>
          ) : (
            // Android: Show buttons that open modal pickers
            <View style={styles.androidPickerContainer}>
              <TouchableOpacity
                style={[
                  styles.pickerButton,
                  {
                    backgroundColor: seasonalTheme.isDark
                      ? "rgba(255, 255, 255, 0.08)"
                      : "rgba(255, 255, 255, 0.9)",
                    borderColor: seasonalTheme.textSecondary + "40",
                  },
                ]}
                onPress={showDatePickerModal}
              >
                <Ionicons
                  name="calendar-outline"
                  size={20}
                  color={seasonalTheme.textSecondary}
                />
                <Text
                  variant="body"
                  style={[
                    styles.pickerButtonText,
                    { color: seasonalTheme.textPrimary },
                  ]}
                >
                  {formatDateForDisplay(targetDate)}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.pickerButton,
                  {
                    backgroundColor: seasonalTheme.isDark
                      ? "rgba(255, 255, 255, 0.08)"
                      : "rgba(255, 255, 255, 0.9)",
                    borderColor: seasonalTheme.textSecondary + "40",
                  },
                ]}
                onPress={showTimePickerModal}
              >
                <Ionicons
                  name="time-outline"
                  size={20}
                  color={seasonalTheme.textSecondary}
                />
                <Text
                  variant="body"
                  style={[
                    styles.pickerButtonText,
                    { color: seasonalTheme.textPrimary },
                  ]}
                >
                  {formatTimeForDisplay(targetDate)}
                </Text>
              </TouchableOpacity>

              {showDatePicker && (
                <DateTimePicker
                  value={targetDate}
                  mode="date"
                  display="default"
                  onChange={handleDateChange}
                  themeVariant={seasonalTheme.isDark ? "dark" : "light"}
                />
              )}

              {showTimePicker && (
                <DateTimePicker
                  value={targetDate}
                  mode="time"
                  display="default"
                  onChange={handleDateChange}
                  themeVariant={seasonalTheme.isDark ? "dark" : "light"}
                />
              )}
            </View>
          )}
        </View>

        {/* Advanced Section Toggle */}
        <TouchableOpacity
          style={styles.advancedToggle}
          onPress={() => setShowAdvanced(!showAdvanced)}
        >
          <Ionicons
            name={showAdvanced ? "chevron-down" : "chevron-forward"}
            size={20}
            color={seasonalTheme.textSecondary}
          />
          <Text
            variant="body"
            style={{ color: seasonalTheme.textSecondary, marginLeft: 8 }}
          >
            Reward Options
          </Text>
        </TouchableOpacity>

        {/* Advanced Section */}
        {showAdvanced && (
          <>
            {/* Rewards Note */}
            <View style={styles.formGroup}>
              <Text
                variant="caption"
                style={[styles.label, { color: seasonalTheme.textSecondary }]}
              >
                Rewards / Encouragement Note
              </Text>
              <TextInput
                style={[
                  styles.input,
                  styles.multilineInput,
                  {
                    color: seasonalTheme.textPrimary,
                    backgroundColor: seasonalTheme.isDark
                      ? "rgba(255, 255, 255, 0.08)"
                      : "rgba(255, 255, 255, 0.9)",
                    borderColor: seasonalTheme.textSecondary + "40",
                  },
                ]}
                value={rewardsNote}
                onChangeText={setRewardsNote}
                placeholder="Write a note to yourself for when the countdown ends..."
                placeholderTextColor={seasonalTheme.textSecondary}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                onFocus={handleRewardsNoteFocus}
              />
            </View>

            {/* Confetti Toggle - only for countdowns, not Time Since */}
            {!isCountUp && (
              <View style={styles.formGroup}>
                <View style={styles.toggleRow}>
                  <View style={styles.toggleLabel}>
                    <Ionicons
                      name="sparkles"
                      size={20}
                      color={seasonalTheme.textSecondary}
                    />
                    <Text
                      variant="body"
                      style={{
                        color: seasonalTheme.textPrimary,
                        marginLeft: spacingPatterns.sm,
                      }}
                    >
                      Confetti Effect
                    </Text>
                  </View>
                  <Switch
                    value={confettiEnabled}
                    onValueChange={setConfettiEnabled}
                    trackColor={{
                      false: seasonalTheme.textSecondary + "30",
                      true: seasonalTheme.chipText,
                    }}
                    thumbColor={seasonalTheme.isDark ? "#ffffff" : "#f4f3f4"}
                  />
                </View>
                <Text
                  variant="caption"
                  style={{ color: seasonalTheme.textSecondary, marginTop: 4 }}
                >
                  Show a celebration effect when the countdown completes
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Fixed Footer with Button - positioned above keyboard */}
      <View
        style={[
          styles.footer,
          {
            backgroundColor: seasonalTheme.gradient.middle,
            paddingBottom:
              keyboardHeight > 0
                ? spacingPatterns.md
                : insets.bottom + spacingPatterns.md,
            // On Android with edge-to-edge, add insets.bottom to account for the
            // navigation bar area that the keyboard doesn't fully cover
            bottom:
              keyboardHeight > 0
                ? Platform.OS === "android"
                  ? keyboardHeight + insets.bottom
                  : keyboardHeight
                : 0,
          },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.saveButton,
            isFormValid && !isSaving
              ? {
                  backgroundColor: seasonalTheme.textPrimary,
                }
              : {
                  backgroundColor: seasonalTheme.isDark
                    ? "rgba(255, 255, 255, 0.15)"
                    : "rgba(0, 0, 0, 0.08)",
                },
          ]}
          onPress={handleSave}
          disabled={!isFormValid || isSaving}
          activeOpacity={0.8}
        >
          <Text
            variant="body"
            style={[
              styles.saveButtonText,
              isFormValid && !isSaving
                ? {
                    color: seasonalTheme.gradient.middle,
                  }
                : {
                    color: seasonalTheme.textSecondary,
                  },
            ]}
          >
            {isSaving ? "Saving..." : "Save"}
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
  headerSpacer: {
    width: 32,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacingPatterns.screen,
    paddingTop: spacingPatterns.lg,
    paddingBottom: spacingPatterns.md,
  },
  formGroup: {
    marginBottom: spacingPatterns.lg,
  },
  label: {
    marginBottom: spacingPatterns.sm,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacingPatterns.md,
    paddingVertical: spacingPatterns.sm,
    fontSize: 16,
  },
  multilineInput: {
    minHeight: 80,
    paddingTop: spacingPatterns.sm,
  },
  iosPickerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    gap: spacingPatterns.sm,
  },
  iosPicker: {
    alignSelf: "flex-start",
  },
  androidPickerContainer: {
    flexDirection: "row",
    gap: spacingPatterns.sm,
  },
  pickerButton: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacingPatterns.md,
    paddingVertical: spacingPatterns.sm,
    gap: spacingPatterns.sm,
  },
  pickerButtonText: {
    fontSize: 16,
  },
  segmentedControl: {
    flexDirection: "row",
    borderRadius: borderRadius.md,
    padding: 4,
  },
  segmentButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacingPatterns.sm,
    paddingHorizontal: spacingPatterns.xs,
    borderRadius: borderRadius.md - 2,
  },
  segmentContent: {
    alignItems: "center",
  },
  segmentHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  segmentIcon: {
    marginRight: 6,
  },
  segmentExample: {
    fontSize: 11,
    marginTop: 2,
  },
  advancedToggle: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacingPatterns.sm,
    marginBottom: spacingPatterns.md,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  toggleLabel: {
    flexDirection: "row",
    alignItems: "center",
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    paddingHorizontal: spacingPatterns.screen,
    paddingTop: spacingPatterns.md,
  },
  saveButton: {
    borderRadius: borderRadius.md,
    paddingVertical: spacingPatterns.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
});
