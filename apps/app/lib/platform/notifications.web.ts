/**
 * Web shim for expo-notifications
 *
 * No-op on web. TODO: Add Web Push Notifications or Tauri notifications later.
 */

export async function getPermissionsAsync() {
  return { status: "undetermined", granted: false, canAskAgain: false };
}

export async function requestPermissionsAsync() {
  return { status: "undetermined", granted: false, canAskAgain: false };
}

export async function getExpoPushTokenAsync() {
  return { data: "" };
}

export async function scheduleNotificationAsync(_content: unknown) {
  return "";
}

export async function cancelScheduledNotificationAsync(_id: string) {}

export async function cancelAllScheduledNotificationsAsync() {}

export async function getAllScheduledNotificationsAsync() {
  return [];
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
