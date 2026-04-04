/**
 * Web shim for expo-notifications
 *
 * Uses the Web Notifications API where available.
 * Scheduled notifications are stored in memory (lost on refresh — acceptable for web).
 */

export async function getPermissionsAsync() {
  if (typeof Notification === "undefined") {
    return { status: "unavailable", granted: false, canAskAgain: false };
  }
  const granted = Notification.permission === "granted";
  const denied = Notification.permission === "denied";
  return {
    status: granted ? "granted" : denied ? "denied" : "undetermined",
    granted,
    canAskAgain: !denied,
  };
}

export async function requestPermissionsAsync() {
  if (typeof Notification === "undefined") {
    return { status: "unavailable", granted: false, canAskAgain: false };
  }
  const result = await Notification.requestPermission();
  const granted = result === "granted";
  return {
    status: granted ? "granted" : "denied",
    granted,
    canAskAgain: result !== "denied",
  };
}

export async function getExpoPushTokenAsync() {
  return { data: "" };
}

// In-memory store for scheduled notifications
const scheduledNotifications = new Map<
  string,
  { timeoutId: ReturnType<typeof setTimeout>; content: unknown }
>();

let nextId = 1;

export async function scheduleNotificationAsync(request: {
  content: { title?: string; body?: string };
  trigger?: { date?: Date | number } | null;
}) {
  const id = String(nextId++);
  const { content, trigger } = request;

  if (trigger && "date" in trigger && trigger.date) {
    const date =
      typeof trigger.date === "number" ? trigger.date : trigger.date.getTime();
    const delay = date - Date.now();
    if (delay > 0 && typeof Notification !== "undefined") {
      const timeoutId = setTimeout(() => {
        if (Notification.permission === "granted") {
          new Notification(content.title || "Jot", {
            body: content.body || "",
          });
        }
        scheduledNotifications.delete(id);
      }, delay);
      scheduledNotifications.set(id, { timeoutId, content });
    }
  }

  return id;
}

export async function cancelScheduledNotificationAsync(id: string) {
  const entry = scheduledNotifications.get(id);
  if (entry) {
    clearTimeout(entry.timeoutId);
    scheduledNotifications.delete(id);
  }
}

export async function cancelAllScheduledNotificationsAsync() {
  for (const [id, entry] of scheduledNotifications) {
    clearTimeout(entry.timeoutId);
    scheduledNotifications.delete(id);
  }
}

export async function getAllScheduledNotificationsAsync() {
  return Array.from(scheduledNotifications.keys()).map((id) => ({ id }));
}

export async function getPresentedNotificationsAsync() {
  return [];
}

export async function dismissAllNotificationsAsync() {}

export async function setBadgeCountAsync(_count: number) {}

export async function getBadgeCountAsync() {
  return 0;
}

export function setNotificationHandler(_handler: unknown) {}

export function addNotificationReceivedListener(_listener: unknown) {
  return { remove: () => {} };
}

export function addNotificationResponseReceivedListener(_listener: unknown) {
  return { remove: () => {} };
}

export const AndroidImportance = {
  DEFAULT: 3,
  HIGH: 4,
  LOW: 2,
  MAX: 5,
  MIN: 1,
  NONE: 0,
};

export async function setNotificationChannelAsync(
  _id: string,
  _channel: unknown,
) {}

export async function getLastNotificationResponseAsync() {
  return null;
}
