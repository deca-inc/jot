import * as Notifications from "expo-notifications";
import { Alert } from "react-native";

// Configure how notifications are handled when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Request notification permissions from the user
 * @returns true if permissions were granted, false otherwise
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();

  if (existingStatus === "granted") {
    return true;
  }

  const { status } = await Notifications.requestPermissionsAsync();

  if (status !== "granted") {
    Alert.alert(
      "Notifications Disabled",
      "To receive countdown notifications, please enable notifications in your device settings.",
      [{ text: "OK" }],
    );
    return false;
  }

  return true;
}

/**
 * Check if notification permissions are currently granted
 */
export async function hasNotificationPermissions(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === "granted";
}

/**
 * Schedule a local notification for when a countdown reaches its target
 * @param entryId The ID of the countdown entry
 * @param targetDate The target date/time in milliseconds
 * @param title The countdown title
 * @returns The notification ID if scheduled, null if target is in the past
 */
export async function scheduleCountdownNotification(
  entryId: number,
  targetDate: number,
  title: string,
): Promise<string | null> {
  const now = Date.now();

  // Don't schedule if target date is in the past
  if (targetDate <= now) {
    return null;
  }

  // Calculate the trigger date
  const triggerDate = new Date(targetDate);

  try {
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: title,
        body: "Your countdown is now complete!",
        data: {
          entryId,
          type: "countdown-complete",
        },
        sound: "default",
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
      },
    });

    return notificationId;
  } catch (error) {
    console.error("Failed to schedule notification:", error);
    return null;
  }
}

/**
 * Cancel a scheduled notification
 * @param notificationId The ID of the notification to cancel
 */
export async function cancelNotification(
  notificationId: string,
): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch (error) {
    console.error("Failed to cancel notification:", error);
  }
}

/**
 * Cancel all scheduled notifications (useful for cleanup)
 */
export async function cancelAllNotifications(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (error) {
    console.error("Failed to cancel all notifications:", error);
  }
}

/**
 * Get all pending scheduled notifications
 */
export async function getScheduledNotifications(): Promise<
  Notifications.NotificationRequest[]
> {
  return Notifications.getAllScheduledNotificationsAsync();
}

export interface NotificationData {
  entryId?: number;
  type?: string;
}

/**
 * Setup notification response handler for when user taps a notification
 * @param onNotificationTap Callback when user taps a notification with an entryId and type
 * @returns Cleanup function to remove the listener
 */
export function setupNotificationResponseHandler(
  onNotificationTap: (
    entryId: number,
    type: "countdown-complete" | "checkin-reminder",
  ) => void,
): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data = response.notification.request.content
        .data as NotificationData;

      if (
        data?.entryId &&
        (data?.type === "countdown-complete" ||
          data?.type === "checkin-reminder")
      ) {
        onNotificationTap(
          data.entryId,
          data.type as "countdown-complete" | "checkin-reminder",
        );
      }
    },
  );

  return () => subscription.remove();
}

/**
 * Get the last notification response (for handling app launch from notification)
 */
export async function getLastNotificationResponse(): Promise<Notifications.NotificationResponse | null> {
  return Notifications.getLastNotificationResponseAsync();
}
