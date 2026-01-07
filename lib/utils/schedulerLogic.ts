import { CheckinRecurrence } from "./countdown";

/**
 * Timezone information for change detection
 */
export interface TimezoneInfo {
  offset: number; // UTC offset in minutes
  name: string; // Timezone name (e.g., "America/New_York" or "PST")
}

/**
 * DST transition info
 */
export interface DSTTransition {
  hasDST: boolean;
  offsetChange: number; // Change in minutes (positive = spring forward, negative = fall back)
  transitionTime?: number; // Approximate timestamp of transition
}

/**
 * Get current timezone info
 */
export function getTimezoneInfo(timestamp: number = Date.now()): TimezoneInfo {
  const date = new Date(timestamp);
  const offset = date.getTimezoneOffset(); // Minutes from UTC (negative for ahead of UTC)

  // Try to get timezone name
  let name = "Unknown";
  try {
    name = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    // Fallback to offset-based name
    const hours = Math.abs(Math.floor(offset / 60));
    const mins = Math.abs(offset % 60);
    const sign = offset <= 0 ? "+" : "-";
    name = `UTC${sign}${hours}${mins > 0 ? `:${mins.toString().padStart(2, "0")}` : ""}`;
  }

  return { offset, name };
}

/**
 * Check if timezone has changed between two timezone infos
 */
export function hasTimezoneChanged(
  previous: TimezoneInfo,
  current: TimezoneInfo,
): boolean {
  // Check if the timezone name changed (user traveled)
  // OR if offset changed outside of DST (shouldn't happen normally)
  return previous.name !== current.name;
}

/**
 * Detect if a DST transition occurs between two timestamps
 * Returns info about the transition including the offset change
 */
export function detectDSTTransition(
  startTime: number,
  endTime: number,
): DSTTransition {
  const startOffset = new Date(startTime).getTimezoneOffset();
  const endOffset = new Date(endTime).getTimezoneOffset();

  if (startOffset === endOffset) {
    return { hasDST: false, offsetChange: 0 };
  }

  // Offset changed - DST transition occurred
  // offsetChange is in minutes (negative = spring forward/lost hour, positive = fall back/gained hour)
  const offsetChange = endOffset - startOffset;

  // Find approximate transition time by binary search
  let low = startTime;
  let high = endTime;

  while (high - low > 60000) {
    // Within 1 minute precision
    const mid = Math.floor((low + high) / 2);
    const midOffset = new Date(mid).getTimezoneOffset();

    if (midOffset === startOffset) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return {
    hasDST: true,
    offsetChange,
    transitionTime: high,
  };
}

/**
 * Adjust a notification time to account for DST transition
 * This ensures a "9am" notification stays at "9am" wall clock time
 * even if a DST transition occurs
 */
export function adjustForDST(
  triggerTime: number,
  targetHour: number,
  targetMinute: number,
): number {
  const date = new Date(triggerTime);
  const actualHour = date.getHours();
  const actualMinute = date.getMinutes();

  // Check if the time drifted due to DST
  if (actualHour !== targetHour || actualMinute !== targetMinute) {
    // Reset to the intended wall clock time
    date.setHours(targetHour, targetMinute, 0, 0);
    return date.getTime();
  }

  return triggerTime;
}

/**
 * Check all notifications for DST transitions and return warnings
 */
export function checkNotificationsForDST(
  notifications: ScheduledNotification[],
  now: number,
): Array<{ notification: ScheduledNotification; transition: DSTTransition }> {
  const warnings: Array<{
    notification: ScheduledNotification;
    transition: DSTTransition;
  }> = [];

  for (const notification of notifications) {
    const transition = detectDSTTransition(now, notification.triggerTime);
    if (transition.hasDST) {
      warnings.push({ notification, transition });
    }
  }

  return warnings;
}

/**
 * Scheduled notification data
 */
export interface ScheduledNotification {
  entryId: number;
  title: string;
  body: string;
  triggerTime: number;
  type: "countdown-complete" | "checkin-reminder";
}

/**
 * Countdown data needed for scheduling
 */
export interface CountdownScheduleData {
  entryId: number;
  title: string;
  targetDate: number;
  isCountUp?: boolean;
  notificationEnabled?: boolean;
  checkinRecurrence?: CheckinRecurrence;
}

/**
 * Find the Nth occurrence of a weekday in a given month
 * @param year - The year
 * @param month - The month (0-11)
 * @param dayOfWeek - The day of week (0-6, Sun-Sat)
 * @param weekOfMonth - Which occurrence (1-4, or 5 for "last")
 * @returns The date of that occurrence, or null if it doesn't exist
 */
export function getNthWeekdayOfMonth(
  year: number,
  month: number,
  dayOfWeek: number,
  weekOfMonth: number,
): Date | null {
  if (weekOfMonth === 5) {
    // "Last" occurrence - start from end of month and work backwards
    const lastDay = new Date(year, month + 1, 0); // Last day of month
    for (let d = lastDay.getDate(); d >= 1; d--) {
      const date = new Date(year, month, d);
      if (date.getDay() === dayOfWeek) {
        return date;
      }
    }
    return null;
  }

  // Find the Nth occurrence
  let count = 0;
  for (let d = 1; d <= 31; d++) {
    const date = new Date(year, month, d);
    // Check if we've moved to the next month
    if (date.getMonth() !== month) break;

    if (date.getDay() === dayOfWeek) {
      count++;
      if (count === weekOfMonth) {
        return date;
      }
    }
  }
  return null;
}

/**
 * Calculate all check-in reminder times for a recurrence within a time window
 */
export function calculateCheckinTimes(
  recurrence: CheckinRecurrence,
  startTime: number,
  endTime: number,
): number[] {
  if (recurrence.type === "none") {
    return [];
  }

  const times: number[] = [];
  const hour = recurrence.hour ?? 9;
  const minute = recurrence.minute ?? 0;
  const interval = recurrence.interval ?? 1;

  // For daily recurrence with interval
  if (recurrence.type === "daily") {
    const start = new Date(startTime);
    start.setHours(hour, minute, 0, 0);

    // If we're past today's time, start from tomorrow
    if (start.getTime() <= startTime) {
      start.setDate(start.getDate() + 1);
    }

    // Track days from first occurrence for interval calculation
    let dayCount = 0;
    const current = new Date(start);

    while (current.getTime() <= endTime) {
      if (dayCount % interval === 0) {
        times.push(current.getTime());
      }
      current.setDate(current.getDate() + 1);
      dayCount++;
    }
    return times;
  }

  // For weekly recurrence with interval
  if (recurrence.type === "weekly") {
    const dayOfWeek = recurrence.dayOfWeek ?? 0;
    const start = new Date(startTime);
    start.setHours(hour, minute, 0, 0);

    // Find the next occurrence of the target day of week
    while (start.getDay() !== dayOfWeek) {
      start.setDate(start.getDate() + 1);
    }

    // If we're past today's time on the target day, move to next week
    if (start.getTime() <= startTime) {
      start.setDate(start.getDate() + 7);
    }

    // Track weeks from first occurrence for interval calculation
    let weekCount = 0;
    const current = new Date(start);

    while (current.getTime() <= endTime) {
      if (weekCount % interval === 0) {
        times.push(current.getTime());
      }
      current.setDate(current.getDate() + 7);
      weekCount++;
    }
    return times;
  }

  // For monthly recurrence (Nth weekday of month)
  if (recurrence.type === "monthly") {
    const dayOfWeek = recurrence.dayOfWeek ?? 0;
    const weekOfMonth = recurrence.weekOfMonth ?? 1;

    const start = new Date(startTime);
    let currentMonth = start.getMonth();
    let currentYear = start.getFullYear();

    // Track months from first valid occurrence for interval calculation
    let monthCount = 0;
    let foundFirst = false;

    // Check up to 24 months ahead (more than enough for 7-day window, but handles long intervals)
    for (let i = 0; i < 24; i++) {
      const targetDate = getNthWeekdayOfMonth(
        currentYear,
        currentMonth,
        dayOfWeek,
        weekOfMonth,
      );

      if (targetDate) {
        targetDate.setHours(hour, minute, 0, 0);
        const targetTime = targetDate.getTime();

        if (targetTime > startTime && targetTime <= endTime) {
          if (!foundFirst) {
            foundFirst = true;
            monthCount = 0;
          }

          if (monthCount % interval === 0) {
            times.push(targetTime);
          }
        }

        if (foundFirst) {
          monthCount++;
        }
      }

      // Move to next month
      currentMonth++;
      if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
      }
    }
    return times;
  }

  return times;
}

/**
 * Gather all notifications that need to be scheduled for all countdowns
 */
export function gatherAllNotifications(
  countdowns: CountdownScheduleData[],
  now: number,
  endTime: number,
  maxNotifications: number = 32,
): ScheduledNotification[] {
  const notifications: ScheduledNotification[] = [];

  for (const countdown of countdowns) {
    // Countdown completion notification (if enabled and in the future)
    if (
      countdown.notificationEnabled &&
      !countdown.isCountUp &&
      countdown.targetDate > now &&
      countdown.targetDate <= endTime
    ) {
      notifications.push({
        entryId: countdown.entryId,
        title: countdown.title,
        body: "Your countdown is now complete!",
        triggerTime: countdown.targetDate,
        type: "countdown-complete",
      });
    }

    // Check-in reminder notifications
    if (
      countdown.checkinRecurrence &&
      countdown.checkinRecurrence.type !== "none"
    ) {
      const checkinTimes = calculateCheckinTimes(
        countdown.checkinRecurrence,
        now,
        endTime,
      );

      for (const time of checkinTimes) {
        // Don't schedule check-in reminders after countdown is complete (unless it's a count-up)
        if (!countdown.isCountUp && time > countdown.targetDate) {
          continue;
        }

        notifications.push({
          entryId: countdown.entryId,
          title: `Check in: ${countdown.title}`,
          body: "Time to check in on your progress!",
          triggerTime: time,
          type: "checkin-reminder",
        });
      }
    }
  }

  // Sort by trigger time (earliest first)
  notifications.sort((a, b) => a.triggerTime - b.triggerTime);

  // Limit to maxNotifications
  return notifications.slice(0, maxNotifications);
}
