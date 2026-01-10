import * as BackgroundFetch from "expo-background-fetch";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { Entry, EntryRepository } from "../db/entries";
import { extractCountdownData } from "./countdown";
import {
  checkNotificationsForDST,
  CountdownScheduleData,
  gatherAllNotifications,
  getTimezoneInfo,
  hasTimezoneChanged,
  ScheduledNotification,
  TimezoneInfo,
} from "./schedulerLogic";

const BACKGROUND_TASK_NAME = "COUNTDOWN_NOTIFICATION_REFRESH";
const MAX_SCHEDULED_NOTIFICATIONS = 32;
const SCHEDULE_DAYS_AHEAD = 7;

// Cached timezone info from last refresh
let cachedTimezoneInfo: TimezoneInfo | null = null;

/**
 * Convert Entry to CountdownScheduleData for the scheduler
 */
function entryToScheduleData(entry: Entry): CountdownScheduleData | null {
  const data = extractCountdownData(entry.blocks);
  if (!data) return null;

  return {
    entryId: entry.id,
    title: data.title,
    targetDate: data.targetDate,
    isCountUp: data.isCountUp,
    notificationEnabled: data.notificationEnabled,
    checkinRecurrence: data.checkinRecurrence,
  };
}

/**
 * Cancel all countdown-related notifications
 */
async function cancelAllCountdownNotifications(): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();

    for (const notification of scheduled) {
      const data = notification.content.data as {
        type?: string;
      };

      if (
        data?.type === "countdown-complete" ||
        data?.type === "checkin-reminder"
      ) {
        await Notifications.cancelScheduledNotificationAsync(
          notification.identifier,
        );
      }
    }
  } catch (error) {
    console.error("Error canceling countdown notifications:", error);
  }
}

/**
 * Schedule a batch of notifications
 */
async function scheduleNotifications(
  notifications: ScheduledNotification[],
): Promise<void> {
  for (const notification of notifications) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: notification.title,
          body: notification.body,
          data: {
            entryId: notification.entryId,
            type: notification.type,
          },
          sound: "default",
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(notification.triggerTime),
        },
      });
    } catch (error) {
      console.error("Error scheduling notification:", error);
    }
  }
}

/**
 * Main function to refresh all countdown notifications
 * Cancels existing and schedules the next 7 days worth (up to 32 total)
 */
export async function refreshCountdownNotifications(
  entryRepository: EntryRepository,
): Promise<{
  scheduled: number;
  cancelled: boolean;
  timezoneChanged: boolean;
  dstWarnings: number;
}> {
  try {
    // Check for timezone changes
    const currentTimezone = getTimezoneInfo();
    const timezoneChanged =
      cachedTimezoneInfo !== null &&
      hasTimezoneChanged(cachedTimezoneInfo, currentTimezone);

    if (timezoneChanged) {
      console.log(
        `[NotificationScheduler] Timezone changed from ${cachedTimezoneInfo?.name} to ${currentTimezone.name}`,
      );
    }

    // Update cached timezone
    cachedTimezoneInfo = currentTimezone;

    // Get all non-archived countdown entries
    const allEntries = await entryRepository.getAll();
    const countdownEntries = allEntries.filter(
      (e) => e.type === "countdown" && e.archivedAt === null,
    );

    // Convert to schedule data
    const countdowns: CountdownScheduleData[] = [];
    for (const entry of countdownEntries) {
      const data = entryToScheduleData(entry);
      if (data) {
        countdowns.push(data);
      }
    }

    // Calculate time window
    const now = Date.now();
    const endTime = now + SCHEDULE_DAYS_AHEAD * 24 * 60 * 60 * 1000;

    // Cancel all existing countdown notifications
    await cancelAllCountdownNotifications();

    // Gather and schedule new notifications
    const notifications = gatherAllNotifications(
      countdowns,
      now,
      endTime,
      MAX_SCHEDULED_NOTIFICATIONS,
    );

    // Check for DST transitions in the scheduled window
    const dstWarnings = checkNotificationsForDST(notifications, now);
    if (dstWarnings.length > 0) {
      console.log(
        `[NotificationScheduler] ${dstWarnings.length} notification(s) cross a DST transition`,
      );
    }

    await scheduleNotifications(notifications);

    console.log(
      `[NotificationScheduler] Scheduled ${notifications.length} notifications (timezone: ${currentTimezone.name})`,
    );

    return {
      scheduled: notifications.length,
      cancelled: true,
      timezoneChanged,
      dstWarnings: dstWarnings.length,
    };
  } catch (error) {
    console.error("Error refreshing countdown notifications:", error);
    return {
      scheduled: 0,
      cancelled: false,
      timezoneChanged: false,
      dstWarnings: 0,
    };
  }
}

/**
 * Get the cached timezone info (useful for debugging)
 */
export function getCachedTimezoneInfo(): TimezoneInfo | null {
  return cachedTimezoneInfo;
}

/**
 * Clear the cached timezone (useful for testing)
 */
export function clearCachedTimezoneInfo(): void {
  cachedTimezoneInfo = null;
}

/**
 * Define the background task
 */
TaskManager.defineTask(BACKGROUND_TASK_NAME, async () => {
  console.log("[NotificationScheduler] Background task running");

  try {
    // We need to get the database instance
    // This is tricky because we're outside the React context
    // The task will need to be provided with the repository somehow
    // For now, we'll just log - the actual refresh will happen on app open
    console.log(
      "[NotificationScheduler] Background task completed (refresh on app open)",
    );
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (error) {
    console.error("[NotificationScheduler] Background task error:", error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

/**
 * Register the background task
 */
export async function registerBackgroundTask(): Promise<void> {
  try {
    const isRegistered =
      await TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK_NAME);

    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(BACKGROUND_TASK_NAME, {
        minimumInterval: 12 * 60 * 60, // 12 hours
        stopOnTerminate: false,
        startOnBoot: true,
      });
      console.log("[NotificationScheduler] Background task registered");
    }
  } catch (error) {
    console.error(
      "[NotificationScheduler] Error registering background task:",
      error,
    );
  }
}

/**
 * Unregister the background task
 */
export async function unregisterBackgroundTask(): Promise<void> {
  try {
    const isRegistered =
      await TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK_NAME);

    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_TASK_NAME);
      console.log("[NotificationScheduler] Background task unregistered");
    }
  } catch (error) {
    console.error(
      "[NotificationScheduler] Error unregistering background task:",
      error,
    );
  }
}

/**
 * Check background fetch status
 */
export async function getBackgroundFetchStatus(): Promise<BackgroundFetch.BackgroundFetchStatus | null> {
  return BackgroundFetch.getStatusAsync();
}
