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
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTrackScreenView } from "../analytics";
import { Text } from "../components";
import { useDatabase } from "../db/DatabaseProvider";
import { EntryRepository } from "../db/entries";
import { useCreateEntry, useUpdateEntry, useEntry } from "../db/useEntries";
import { spacingPatterns, borderRadius } from "../theme";
import { useSeasonalTheme } from "../theme/SeasonalThemeProvider";
import {
  CheckinRecurrence,
  createCountdownBlock,
  extractCountdownData,
  RecurrenceType,
  WeekOfMonth,
} from "../utils/countdown";
import {
  requestNotificationPermissions,
  hasNotificationPermissions,
} from "../utils/notifications";
import { refreshCountdownNotifications } from "../utils/notificationScheduler";

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

// Day names for weekly recurrence
const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Recurrence type labels
const RECURRENCE_LABELS: Record<RecurrenceType, string> = {
  none: "None",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

// Week of month labels for monthly recurrence
const WEEK_OF_MONTH_LABELS: Record<WeekOfMonth, string> = {
  1: "1st",
  2: "2nd",
  3: "3rd",
  4: "4th",
  5: "Last",
};

// Interval options
const INTERVAL_OPTIONS = [1, 2, 3, 4, 5, 6];

export function CountdownComposer({
  entryId,
  onSave,
  onCancel,
}: CountdownComposerProps) {
  const seasonalTheme = useSeasonalTheme();
  const insets = useSafeAreaInsets();
  const db = useDatabase();

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
  const [notificationEnabled, setNotificationEnabled] = useState(
    existingData?.notificationEnabled ?? false,
  );
  const [showAdvanced, setShowAdvanced] = useState(
    !!(existingData?.rewardsNote || existingData?.confettiEnabled === true),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [hasLoadedExistingData, setHasLoadedExistingData] = useState(false);

  // Check-in recurrence state
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>(
    existingData?.checkinRecurrence?.type ?? "none",
  );
  const [recurrenceInterval, setRecurrenceInterval] = useState<number>(
    existingData?.checkinRecurrence?.interval ?? 1,
  );
  const [recurrenceDayOfWeek, setRecurrenceDayOfWeek] = useState<number>(
    existingData?.checkinRecurrence?.dayOfWeek ?? new Date().getDay(),
  );
  const [recurrenceWeekOfMonth, setRecurrenceWeekOfMonth] =
    useState<WeekOfMonth>(
      (existingData?.checkinRecurrence?.weekOfMonth as WeekOfMonth) ?? 1,
    );
  const [recurrenceHour, setRecurrenceHour] = useState<number>(
    existingData?.checkinRecurrence?.hour ?? 9,
  );
  const [recurrenceMinute, setRecurrenceMinute] = useState<number>(
    existingData?.checkinRecurrence?.minute ?? 0,
  );
  const [showRecurrenceTimePicker, setShowRecurrenceTimePicker] = useState(
    Platform.OS === "ios",
  );

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
        setNotificationEnabled(data.notificationEnabled ?? false);
        setShowAdvanced(
          !!(data.rewardsNote || data.confettiEnabled === true),
        );
        // Load recurrence data
        if (data.checkinRecurrence) {
          setRecurrenceType(data.checkinRecurrence.type);
          if (data.checkinRecurrence.interval !== undefined) {
            setRecurrenceInterval(data.checkinRecurrence.interval);
          }
          if (data.checkinRecurrence.dayOfWeek !== undefined) {
            setRecurrenceDayOfWeek(data.checkinRecurrence.dayOfWeek);
          }
          if (data.checkinRecurrence.weekOfMonth !== undefined) {
            setRecurrenceWeekOfMonth(
              data.checkinRecurrence.weekOfMonth as WeekOfMonth,
            );
          }
          if (data.checkinRecurrence.hour !== undefined) {
            setRecurrenceHour(data.checkinRecurrence.hour);
          }
          if (data.checkinRecurrence.minute !== undefined) {
            setRecurrenceMinute(data.checkinRecurrence.minute);
          }
        }
        setHasLoadedExistingData(true);
      }
    }
  }, [existingEntry, hasLoadedExistingData]);

  // Auto-enable notifications for new countdowns if user has already granted permission
  useEffect(() => {
    // Only for new countdowns (not editing), and only if not already set
    if (!entryId && !notificationEnabled && !isCountUp) {
      hasNotificationPermissions().then((hasPermission) => {
        if (hasPermission) {
          setNotificationEnabled(true);
        }
      });
    }
    // Only run on mount - intentionally empty deps array
  }, []);

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

  // Handle notification toggle
  const handleNotificationToggle = useCallback(
    async (enabled: boolean) => {
      if (enabled) {
        // Check if target date is in the past
        if (targetDate.getTime() <= Date.now()) {
          Alert.alert(
            "Cannot Schedule Notification",
            "The target date is in the past. Please set a future date to enable notifications.",
            [{ text: "OK" }],
          );
          return;
        }

        // Request permissions
        const hasPermission = await requestNotificationPermissions();
        if (!hasPermission) {
          return;
        }
      }
      setNotificationEnabled(enabled);
    },
    [targetDate],
  );

  // Handle recurrence type change
  const handleRecurrenceTypeChange = useCallback(
    async (type: RecurrenceType) => {
      if (type !== "none" && recurrenceType === "none") {
        // Switching from none to a recurrence - request permissions
        const hasPermission = await requestNotificationPermissions();
        if (!hasPermission) {
          return; // Don't change type if permissions denied
        }
      }
      setRecurrenceType(type);
    },
    [recurrenceType],
  );

  // Handle recurrence time change
  const handleRecurrenceTimeChange = useCallback(
    (event: DateTimePickerEvent, selectedDate?: Date) => {
      if (Platform.OS === "android") {
        setShowRecurrenceTimePicker(false);
      }

      if (selectedDate && event.type === "set") {
        setRecurrenceHour(selectedDate.getHours());
        setRecurrenceMinute(selectedDate.getMinutes());
      }
    },
    [],
  );

  // Build recurrence time as Date for the picker
  const recurrenceTimeAsDate = new Date();
  recurrenceTimeAsDate.setHours(recurrenceHour, recurrenceMinute, 0, 0);

  const handleSave = useCallback(async () => {
    if (!title.trim()) {
      return;
    }

    setIsSaving(true);

    try {
      // Build check-in recurrence config (notifications will be scheduled by the refresh)
      let checkinRecurrence: CheckinRecurrence | undefined;
      if (!isCountUp && recurrenceType !== "none") {
        checkinRecurrence = {
          type: recurrenceType,
          interval: recurrenceInterval,
          hour: recurrenceHour,
          minute: recurrenceMinute,
        };
        if (recurrenceType === "weekly") {
          checkinRecurrence.dayOfWeek = recurrenceDayOfWeek;
        }
        if (recurrenceType === "monthly") {
          checkinRecurrence.dayOfWeek = recurrenceDayOfWeek;
          checkinRecurrence.weekOfMonth = recurrenceWeekOfMonth;
        }
      }

      const block = createCountdownBlock({
        targetDate: targetDate.getTime(),
        title: title.trim(),
        isCountUp,
        rewardsNote: rewardsNote.trim() || undefined,
        confettiEnabled,
        notificationEnabled: isCountUp ? false : notificationEnabled,
        checkinRecurrence,
      });

      let savedEntryId: number;

      if (entryId) {
        // Update existing entry
        await updateEntryRef.current.mutateAsync({
          id: entryId,
          input: {
            title: title.trim(),
            blocks: [block],
          },
        });
        savedEntryId = entryId;
      } else {
        // Create new entry (isPinned defaults to true for countdown in repository)
        const entry = await createEntryRef.current.mutateAsync({
          type: "countdown",
          title: title.trim(),
          blocks: [block],
        });
        savedEntryId = entry.id;
      }

      // Refresh all countdown notifications (centralized scheduling)
      const entryRepository = new EntryRepository(db);
      await refreshCountdownNotifications(entryRepository);

      onSave?.(savedEntryId);
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
    notificationEnabled,
    entryId,
    onSave,
    recurrenceType,
    recurrenceInterval,
    recurrenceDayOfWeek,
    recurrenceWeekOfMonth,
    recurrenceHour,
    recurrenceMinute,
    db,
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
            paddingTop: insets.top / 2,
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
                setNotificationEnabled(false);
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

        {/* Notification Toggle - only for countdowns, not Time Since */}
        {!isCountUp && (
          <View style={styles.formGroup}>
            <View style={styles.toggleRow}>
              <View style={styles.toggleLabel}>
                <Ionicons
                  name="notifications-outline"
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
                  Notify When Complete
                </Text>
              </View>
              <Switch
                value={notificationEnabled}
                onValueChange={handleNotificationToggle}
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
              Send a push notification when the countdown reaches its target
            </Text>
          </View>
        )}

        {/* Check-in Reminders - only for countdowns, not Time Since */}
        {!isCountUp && (
          <View style={styles.formGroup}>
            <Text
              variant="caption"
              style={[styles.label, { color: seasonalTheme.textSecondary }]}
            >
              Check-in Reminders
            </Text>

            {/* Recurrence Type Selector */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={[
                styles.recurrenceTypeContainer,
                {
                  backgroundColor: seasonalTheme.isDark
                    ? "rgba(255, 255, 255, 0.08)"
                    : "rgba(0, 0, 0, 0.06)",
                },
              ]}
              contentContainerStyle={styles.recurrenceTypeContent}
            >
              {(["none", "daily", "weekly", "monthly"] as const).map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.recurrenceTypeButton,
                    recurrenceType === type && {
                      backgroundColor: seasonalTheme.isDark
                        ? "rgba(255, 255, 255, 0.15)"
                        : "rgba(255, 255, 255, 0.95)",
                    },
                  ]}
                  onPress={() => handleRecurrenceTypeChange(type)}
                  activeOpacity={0.7}
                >
                  <Text
                    variant="caption"
                    style={{
                      color:
                        recurrenceType === type
                          ? seasonalTheme.textPrimary
                          : seasonalTheme.textSecondary,
                      fontWeight: recurrenceType === type ? "600" : "400",
                    }}
                  >
                    {RECURRENCE_LABELS[type]}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Interval Selector - for any non-none recurrence */}
            {recurrenceType !== "none" && (
              <View style={styles.recurrenceOptionsRow}>
                <Text
                  variant="caption"
                  style={{ color: seasonalTheme.textSecondary }}
                >
                  Every:
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.intervalSelector}
                >
                  {INTERVAL_OPTIONS.map((interval) => (
                    <TouchableOpacity
                      key={interval}
                      style={[
                        styles.intervalButton,
                        {
                          backgroundColor:
                            recurrenceInterval === interval
                              ? seasonalTheme.chipText
                              : seasonalTheme.isDark
                                ? "rgba(255, 255, 255, 0.08)"
                                : "rgba(0, 0, 0, 0.06)",
                        },
                      ]}
                      onPress={() => setRecurrenceInterval(interval)}
                    >
                      <Text
                        variant="caption"
                        style={{
                          color:
                            recurrenceInterval === interval
                              ? seasonalTheme.isDark
                                ? "#000"
                                : "#fff"
                              : seasonalTheme.textSecondary,
                          fontWeight:
                            recurrenceInterval === interval ? "600" : "400",
                        }}
                      >
                        {interval}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <Text
                  variant="caption"
                  style={{
                    color: seasonalTheme.textSecondary,
                    marginLeft: spacingPatterns.xs,
                  }}
                >
                  {recurrenceType === "daily"
                    ? recurrenceInterval === 1
                      ? "day"
                      : "days"
                    : recurrenceType === "weekly"
                      ? recurrenceInterval === 1
                        ? "week"
                        : "weeks"
                      : recurrenceInterval === 1
                        ? "month"
                        : "months"}
                </Text>
              </View>
            )}

            {/* Day of Week Selector - for weekly */}
            {recurrenceType === "weekly" && (
              <View style={styles.recurrenceOptionsRow}>
                <Text
                  variant="caption"
                  style={{ color: seasonalTheme.textSecondary }}
                >
                  On:
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.daySelector}
                >
                  {DAYS_OF_WEEK.map((day, index) => (
                    <TouchableOpacity
                      key={day}
                      style={[
                        styles.dayButton,
                        {
                          backgroundColor:
                            recurrenceDayOfWeek === index
                              ? seasonalTheme.chipText
                              : seasonalTheme.isDark
                                ? "rgba(255, 255, 255, 0.08)"
                                : "rgba(0, 0, 0, 0.06)",
                        },
                      ]}
                      onPress={() => setRecurrenceDayOfWeek(index)}
                    >
                      <Text
                        variant="caption"
                        style={{
                          color:
                            recurrenceDayOfWeek === index
                              ? seasonalTheme.isDark
                                ? "#000"
                                : "#fff"
                              : seasonalTheme.textSecondary,
                          fontWeight:
                            recurrenceDayOfWeek === index ? "600" : "400",
                        }}
                      >
                        {day}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Week of Month + Day of Week Selector - for monthly */}
            {recurrenceType === "monthly" && (
              <>
                <View style={styles.recurrenceOptionsRow}>
                  <Text
                    variant="caption"
                    style={{ color: seasonalTheme.textSecondary }}
                  >
                    On the:
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.weekOfMonthSelector}
                  >
                    {([1, 2, 3, 4, 5] as WeekOfMonth[]).map((week) => (
                      <TouchableOpacity
                        key={week}
                        style={[
                          styles.weekOfMonthButton,
                          {
                            backgroundColor:
                              recurrenceWeekOfMonth === week
                                ? seasonalTheme.chipText
                                : seasonalTheme.isDark
                                  ? "rgba(255, 255, 255, 0.08)"
                                  : "rgba(0, 0, 0, 0.06)",
                          },
                        ]}
                        onPress={() => setRecurrenceWeekOfMonth(week)}
                      >
                        <Text
                          variant="caption"
                          style={{
                            color:
                              recurrenceWeekOfMonth === week
                                ? seasonalTheme.isDark
                                  ? "#000"
                                  : "#fff"
                                : seasonalTheme.textSecondary,
                            fontWeight:
                              recurrenceWeekOfMonth === week ? "600" : "400",
                          }}
                        >
                          {WEEK_OF_MONTH_LABELS[week]}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
                <View style={styles.recurrenceOptionsRow}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.daySelector}
                  >
                    {DAYS_OF_WEEK.map((day, index) => (
                      <TouchableOpacity
                        key={day}
                        style={[
                          styles.dayButton,
                          {
                            backgroundColor:
                              recurrenceDayOfWeek === index
                                ? seasonalTheme.chipText
                                : seasonalTheme.isDark
                                  ? "rgba(255, 255, 255, 0.08)"
                                  : "rgba(0, 0, 0, 0.06)",
                          },
                        ]}
                        onPress={() => setRecurrenceDayOfWeek(index)}
                      >
                        <Text
                          variant="caption"
                          style={{
                            color:
                              recurrenceDayOfWeek === index
                                ? seasonalTheme.isDark
                                  ? "#000"
                                  : "#fff"
                                : seasonalTheme.textSecondary,
                            fontWeight:
                              recurrenceDayOfWeek === index ? "600" : "400",
                          }}
                        >
                          {day}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </>
            )}

            {/* Time Picker - for any non-none recurrence */}
            {recurrenceType !== "none" && (
              <View style={styles.recurrenceOptionsRow}>
                <Text
                  variant="caption"
                  style={{ color: seasonalTheme.textSecondary }}
                >
                  At:
                </Text>
                {Platform.OS === "ios" ? (
                  <DateTimePicker
                    value={recurrenceTimeAsDate}
                    mode="time"
                    display="compact"
                    onChange={handleRecurrenceTimeChange}
                    accentColor={seasonalTheme.chipText}
                    themeVariant={seasonalTheme.isDark ? "dark" : "light"}
                    style={styles.iosPicker}
                  />
                ) : (
                  <>
                    <TouchableOpacity
                      style={[
                        styles.timePickerButton,
                        {
                          backgroundColor: seasonalTheme.isDark
                            ? "rgba(255, 255, 255, 0.08)"
                            : "rgba(255, 255, 255, 0.9)",
                          borderColor: seasonalTheme.textSecondary + "40",
                        },
                      ]}
                      onPress={() => setShowRecurrenceTimePicker(true)}
                    >
                      <Ionicons
                        name="time-outline"
                        size={16}
                        color={seasonalTheme.textSecondary}
                      />
                      <Text
                        variant="body"
                        style={{
                          color: seasonalTheme.textPrimary,
                          marginLeft: 6,
                        }}
                      >
                        {formatTimeForDisplay(recurrenceTimeAsDate)}
                      </Text>
                    </TouchableOpacity>
                    {showRecurrenceTimePicker && (
                      <DateTimePicker
                        value={recurrenceTimeAsDate}
                        mode="time"
                        display="default"
                        onChange={handleRecurrenceTimeChange}
                        themeVariant={seasonalTheme.isDark ? "dark" : "light"}
                      />
                    )}
                  </>
                )}
              </View>
            )}

            <Text
              variant="caption"
              style={{ color: seasonalTheme.textSecondary, marginTop: 8 }}
            >
              {recurrenceType === "none"
                ? "No reminders will be scheduled"
                : "Receive reminders to check in on your progress"}
            </Text>
          </View>
        )}

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
    paddingBottom: spacingPatterns.xs,
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
    paddingTop: spacingPatterns.sm,
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
  recurrenceTypeContainer: {
    borderRadius: borderRadius.md,
    padding: 4,
  },
  recurrenceTypeContent: {
    flexDirection: "row",
    gap: 4,
  },
  recurrenceTypeButton: {
    paddingVertical: spacingPatterns.xs,
    paddingHorizontal: spacingPatterns.sm,
    borderRadius: borderRadius.md - 2,
  },
  recurrenceOptionsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacingPatterns.sm,
    gap: spacingPatterns.sm,
  },
  daySelector: {
    flexDirection: "row",
    gap: 4,
  },
  dayButton: {
    width: 36,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: borderRadius.sm,
  },
  intervalSelector: {
    flexDirection: "row",
    gap: 4,
  },
  intervalButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: borderRadius.sm,
  },
  weekOfMonthSelector: {
    flexDirection: "row",
    gap: 4,
  },
  weekOfMonthButton: {
    paddingHorizontal: spacingPatterns.sm,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: borderRadius.sm,
  },
  timePickerButton: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacingPatterns.sm,
    paddingVertical: spacingPatterns.xs,
  },
});
