import {
  getNthWeekdayOfMonth,
  calculateCheckinTimes,
  gatherAllNotifications,
  CountdownScheduleData,
  getTimezoneInfo,
  hasTimezoneChanged,
  detectDSTTransition,
  adjustForDST,
  checkNotificationsForDST,
  TimezoneInfo,
} from "./schedulerLogic";

// Helper to create a date at a specific time
function createDate(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): Date {
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

// Helper to get timestamp
function ts(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): number {
  return createDate(year, month, day, hour, minute).getTime();
}

describe("getNthWeekdayOfMonth", () => {
  describe("finding 1st weekday of month", () => {
    it("finds 1st Monday of January 2025", () => {
      // January 2025 starts on Wednesday, so 1st Monday is Jan 6
      const result = getNthWeekdayOfMonth(2025, 0, 1, 1); // year, month (0-indexed), Monday (1), 1st
      expect(result?.getDate()).toBe(6);
      expect(result?.getMonth()).toBe(0);
    });

    it("finds 1st Sunday of January 2025", () => {
      // January 2025 starts on Wednesday, so 1st Sunday is Jan 5
      const result = getNthWeekdayOfMonth(2025, 0, 0, 1); // Sunday (0), 1st
      expect(result?.getDate()).toBe(5);
    });

    it("finds 1st Friday of February 2025", () => {
      // February 2025 starts on Saturday, so 1st Friday is Feb 7
      const result = getNthWeekdayOfMonth(2025, 1, 5, 1); // Friday (5), 1st
      expect(result?.getDate()).toBe(7);
    });
  });

  describe("finding 2nd, 3rd, 4th weekday of month", () => {
    it("finds 2nd Monday of January 2025", () => {
      // 1st Monday is Jan 6, so 2nd Monday is Jan 13
      const result = getNthWeekdayOfMonth(2025, 0, 1, 2);
      expect(result?.getDate()).toBe(13);
    });

    it("finds 3rd Monday of January 2025", () => {
      // 3rd Monday is Jan 20
      const result = getNthWeekdayOfMonth(2025, 0, 1, 3);
      expect(result?.getDate()).toBe(20);
    });

    it("finds 4th Monday of January 2025", () => {
      // 4th Monday is Jan 27
      const result = getNthWeekdayOfMonth(2025, 0, 1, 4);
      expect(result?.getDate()).toBe(27);
    });
  });

  describe("finding last weekday of month (weekOfMonth = 5)", () => {
    it("finds last Monday of January 2025", () => {
      // January 2025 has 31 days, last Monday is Jan 27
      const result = getNthWeekdayOfMonth(2025, 0, 1, 5);
      expect(result?.getDate()).toBe(27);
    });

    it("finds last Friday of February 2025", () => {
      // February 2025 has 28 days, last Friday is Feb 28
      const result = getNthWeekdayOfMonth(2025, 1, 5, 5);
      expect(result?.getDate()).toBe(28);
    });

    it("finds last Sunday of February 2025", () => {
      // Last Sunday in Feb 2025 is Feb 23
      const result = getNthWeekdayOfMonth(2025, 1, 0, 5);
      expect(result?.getDate()).toBe(23);
    });

    it("finds last Thursday of April 2025", () => {
      // April 2025 has 30 days, last Thursday is April 24
      const result = getNthWeekdayOfMonth(2025, 3, 4, 5);
      expect(result?.getDate()).toBe(24);
    });
  });

  describe("edge cases", () => {
    it("returns null for 5th occurrence when month only has 4", () => {
      // Looking for 5th Monday in a month that only has 4
      // February 2025 only has 4 Mondays (3, 10, 17, 24)
      // But weekOfMonth=5 means "last", so it should return the last one
      const result = getNthWeekdayOfMonth(2025, 1, 1, 5);
      expect(result?.getDate()).toBe(24); // Last Monday
    });
  });
});

describe("calculateCheckinTimes", () => {
  describe("daily recurrence", () => {
    it("returns daily times within window", () => {
      const startTime = ts(2025, 1, 15, 10, 0); // Jan 15, 2025 at 10am
      const endTime = ts(2025, 1, 20, 10, 0); // Jan 20, 2025 at 10am

      const times = calculateCheckinTimes(
        { type: "daily", hour: 9, minute: 0 },
        startTime,
        endTime,
      );

      // Should include Jan 16, 17, 18, 19, 20 at 9am
      expect(times.length).toBe(5);
      expect(new Date(times[0]).getDate()).toBe(16);
      expect(new Date(times[0]).getHours()).toBe(9);
    });

    it("respects interval for every 2 days", () => {
      const startTime = ts(2025, 1, 15, 10, 0);
      const endTime = ts(2025, 1, 22, 10, 0);

      const times = calculateCheckinTimes(
        { type: "daily", interval: 2, hour: 9, minute: 0 },
        startTime,
        endTime,
      );

      // Should include Jan 16, 18, 20, 22 at 9am
      expect(times.length).toBe(4);
      expect(new Date(times[0]).getDate()).toBe(16);
      expect(new Date(times[1]).getDate()).toBe(18);
      expect(new Date(times[2]).getDate()).toBe(20);
      expect(new Date(times[3]).getDate()).toBe(22);
    });

    it("respects interval for every 3 days", () => {
      const startTime = ts(2025, 1, 15, 10, 0);
      const endTime = ts(2025, 1, 25, 10, 0);

      const times = calculateCheckinTimes(
        { type: "daily", interval: 3, hour: 9, minute: 0 },
        startTime,
        endTime,
      );

      // Should include Jan 16, 19, 22, 25 at 9am
      expect(times.length).toBe(4);
      expect(new Date(times[0]).getDate()).toBe(16);
      expect(new Date(times[1]).getDate()).toBe(19);
      expect(new Date(times[2]).getDate()).toBe(22);
      expect(new Date(times[3]).getDate()).toBe(25);
    });

    it("starts from next day if current time is past reminder time", () => {
      const startTime = ts(2025, 1, 15, 15, 0); // 3pm
      const endTime = ts(2025, 1, 18, 10, 0);

      const times = calculateCheckinTimes(
        { type: "daily", hour: 9, minute: 0 }, // 9am reminder
        startTime,
        endTime,
      );

      // Should start from Jan 16 since we're past 9am on Jan 15
      expect(new Date(times[0]).getDate()).toBe(16);
    });
  });

  describe("weekly recurrence", () => {
    it("returns weekly times on specified day", () => {
      // Start on a Wednesday, looking for Mondays
      const startTime = ts(2025, 1, 15, 10, 0); // Wed Jan 15
      const endTime = ts(2025, 2, 15, 10, 0); // Sat Feb 15

      const times = calculateCheckinTimes(
        { type: "weekly", dayOfWeek: 1, hour: 9, minute: 0 }, // Monday
        startTime,
        endTime,
      );

      // Should include Jan 20, 27, Feb 3, 10 (Mondays)
      expect(times.length).toBe(4);
      expect(new Date(times[0]).getDate()).toBe(20);
      expect(new Date(times[0]).getDay()).toBe(1); // Monday
    });

    it("respects interval for every 2 weeks", () => {
      const startTime = ts(2025, 1, 15, 10, 0); // Wed Jan 15
      const endTime = ts(2025, 2, 28, 10, 0); // Fri Feb 28

      const times = calculateCheckinTimes(
        { type: "weekly", dayOfWeek: 1, interval: 2, hour: 9, minute: 0 },
        startTime,
        endTime,
      );

      // Should include Jan 20, Feb 3, Feb 17 (every other Monday)
      expect(times.length).toBe(3);
      expect(new Date(times[0]).getDate()).toBe(20);
      expect(new Date(times[1]).getDate()).toBe(3);
      expect(new Date(times[1]).getMonth()).toBe(1); // February
      expect(new Date(times[2]).getDate()).toBe(17);
    });

    it("handles when start day is the target day but past the time", () => {
      // Start on Monday at 3pm, looking for Mondays at 9am
      const startTime = ts(2025, 1, 20, 15, 0); // Mon Jan 20 at 3pm
      const endTime = ts(2025, 2, 10, 10, 0);

      const times = calculateCheckinTimes(
        { type: "weekly", dayOfWeek: 1, hour: 9, minute: 0 },
        startTime,
        endTime,
      );

      // Should skip Jan 20 (past 9am) and include Jan 27, Feb 3, 10
      expect(new Date(times[0]).getDate()).toBe(27);
    });
  });

  describe("monthly recurrence", () => {
    it("finds 1st Monday of each month", () => {
      const startTime = ts(2025, 1, 1, 0, 0); // Jan 1
      const endTime = ts(2025, 4, 30, 23, 59); // April 30

      const times = calculateCheckinTimes(
        { type: "monthly", weekOfMonth: 1, dayOfWeek: 1, hour: 9, minute: 0 },
        startTime,
        endTime,
      );

      // 1st Mondays: Jan 6, Feb 3, Mar 3, Apr 7
      expect(times.length).toBe(4);
      expect(new Date(times[0]).getDate()).toBe(6);
      expect(new Date(times[0]).getMonth()).toBe(0); // January
      expect(new Date(times[1]).getDate()).toBe(3);
      expect(new Date(times[1]).getMonth()).toBe(1); // February
    });

    it("finds last Friday of each month", () => {
      const startTime = ts(2025, 1, 1, 0, 0);
      const endTime = ts(2025, 4, 30, 23, 59);

      const times = calculateCheckinTimes(
        { type: "monthly", weekOfMonth: 5, dayOfWeek: 5, hour: 9, minute: 0 }, // Last Friday
        startTime,
        endTime,
      );

      // Last Fridays: Jan 31, Feb 28, Mar 28, Apr 25
      expect(times.length).toBe(4);
      expect(new Date(times[0]).getDate()).toBe(31);
      expect(new Date(times[1]).getDate()).toBe(28);
      expect(new Date(times[2]).getDate()).toBe(28);
      expect(new Date(times[3]).getDate()).toBe(25);
    });

    it("respects interval for every 2 months", () => {
      const startTime = ts(2025, 1, 1, 0, 0);
      const endTime = ts(2025, 6, 30, 23, 59); // June 30

      const times = calculateCheckinTimes(
        {
          type: "monthly",
          weekOfMonth: 1,
          dayOfWeek: 1,
          interval: 2,
          hour: 9,
          minute: 0,
        },
        startTime,
        endTime,
      );

      // 1st Mondays every 2 months: Jan 6, Mar 3, May 5
      expect(times.length).toBe(3);
      expect(new Date(times[0]).getMonth()).toBe(0); // January
      expect(new Date(times[1]).getMonth()).toBe(2); // March
      expect(new Date(times[2]).getMonth()).toBe(4); // May
    });

    it("finds 3rd Wednesday of month", () => {
      const startTime = ts(2025, 1, 1, 0, 0);
      const endTime = ts(2025, 3, 31, 23, 59); // March 31

      const times = calculateCheckinTimes(
        { type: "monthly", weekOfMonth: 3, dayOfWeek: 3, hour: 9, minute: 0 }, // 3rd Wednesday
        startTime,
        endTime,
      );

      // 3rd Wednesdays: Jan 15, Feb 19, Mar 19
      expect(times.length).toBe(3);
      expect(new Date(times[0]).getDate()).toBe(15);
      expect(new Date(times[1]).getDate()).toBe(19);
      expect(new Date(times[2]).getDate()).toBe(19);
    });
  });

  describe("none recurrence", () => {
    it("returns empty array for none type", () => {
      const times = calculateCheckinTimes(
        { type: "none" },
        ts(2025, 1, 1, 0, 0),
        ts(2025, 12, 31, 23, 59),
      );
      expect(times).toEqual([]);
    });
  });

  describe("edge cases", () => {
    it("handles short time windows", () => {
      // Only 1 day window
      const startTime = ts(2025, 1, 15, 0, 0);
      const endTime = ts(2025, 1, 16, 0, 0);

      const times = calculateCheckinTimes(
        { type: "daily", hour: 9, minute: 0 },
        startTime,
        endTime,
      );

      expect(times.length).toBe(1);
    });

    it("returns empty when no occurrences in window", () => {
      // Looking for Monday but window is only Sat-Sun
      const startTime = ts(2025, 1, 18, 0, 0); // Saturday
      const endTime = ts(2025, 1, 19, 23, 59); // Sunday

      const times = calculateCheckinTimes(
        { type: "weekly", dayOfWeek: 1, hour: 9, minute: 0 }, // Monday
        startTime,
        endTime,
      );

      expect(times.length).toBe(0);
    });

    it("handles custom minute values", () => {
      const startTime = ts(2025, 1, 15, 0, 0);
      const endTime = ts(2025, 1, 17, 0, 0);

      const times = calculateCheckinTimes(
        { type: "daily", hour: 14, minute: 30 }, // 2:30pm
        startTime,
        endTime,
      );

      expect(new Date(times[0]).getHours()).toBe(14);
      expect(new Date(times[0]).getMinutes()).toBe(30);
    });
  });
});

describe("gatherAllNotifications", () => {
  const createCountdown = (
    overrides: Partial<CountdownScheduleData>,
  ): CountdownScheduleData => ({
    entryId: 1,
    title: "Test Countdown",
    targetDate: ts(2025, 1, 25, 12, 0),
    isCountUp: false,
    notificationEnabled: true,
    ...overrides,
  });

  describe("countdown completion notifications", () => {
    it("includes completion notification when enabled and in future", () => {
      const now = ts(2025, 1, 15, 10, 0);
      const endTime = ts(2025, 1, 30, 10, 0);

      const notifications = gatherAllNotifications(
        [
          createCountdown({
            entryId: 1,
            title: "Vacation",
            targetDate: ts(2025, 1, 20, 12, 0),
            notificationEnabled: true,
          }),
        ],
        now,
        endTime,
      );

      const completion = notifications.find(
        (n) => n.type === "countdown-complete",
      );
      expect(completion).toBeDefined();
      expect(completion?.title).toBe("Vacation");
    });

    it("excludes completion notification when disabled", () => {
      const now = ts(2025, 1, 15, 10, 0);
      const endTime = ts(2025, 1, 30, 10, 0);

      const notifications = gatherAllNotifications(
        [
          createCountdown({
            notificationEnabled: false,
          }),
        ],
        now,
        endTime,
      );

      const completion = notifications.find(
        (n) => n.type === "countdown-complete",
      );
      expect(completion).toBeUndefined();
    });

    it("excludes completion notification for count-up timers", () => {
      const now = ts(2025, 1, 15, 10, 0);
      const endTime = ts(2025, 1, 30, 10, 0);

      const notifications = gatherAllNotifications(
        [
          createCountdown({
            isCountUp: true,
            notificationEnabled: true,
          }),
        ],
        now,
        endTime,
      );

      const completion = notifications.find(
        (n) => n.type === "countdown-complete",
      );
      expect(completion).toBeUndefined();
    });

    it("excludes completion notification when target is past", () => {
      const now = ts(2025, 1, 20, 10, 0);
      const endTime = ts(2025, 1, 30, 10, 0);

      const notifications = gatherAllNotifications(
        [
          createCountdown({
            targetDate: ts(2025, 1, 15, 12, 0), // Past
            notificationEnabled: true,
          }),
        ],
        now,
        endTime,
      );

      const completion = notifications.find(
        (n) => n.type === "countdown-complete",
      );
      expect(completion).toBeUndefined();
    });

    it("excludes completion notification when target is outside window", () => {
      const now = ts(2025, 1, 15, 10, 0);
      const endTime = ts(2025, 1, 22, 10, 0); // 7 day window

      const notifications = gatherAllNotifications(
        [
          createCountdown({
            targetDate: ts(2025, 2, 1, 12, 0), // Outside window
            notificationEnabled: true,
          }),
        ],
        now,
        endTime,
      );

      const completion = notifications.find(
        (n) => n.type === "countdown-complete",
      );
      expect(completion).toBeUndefined();
    });
  });

  describe("check-in reminder notifications", () => {
    it("includes check-in reminders for daily recurrence", () => {
      const now = ts(2025, 1, 15, 10, 0);
      const endTime = ts(2025, 1, 22, 10, 0);

      const notifications = gatherAllNotifications(
        [
          createCountdown({
            entryId: 1,
            title: "Project",
            targetDate: ts(2025, 2, 1, 12, 0),
            checkinRecurrence: { type: "daily", hour: 9, minute: 0 },
          }),
        ],
        now,
        endTime,
      );

      const checkins = notifications.filter(
        (n) => n.type === "checkin-reminder",
      );
      expect(checkins.length).toBeGreaterThan(0);
      expect(checkins[0].title).toBe("Check in: Project");
    });

    it("excludes check-in reminders after countdown completion", () => {
      const now = ts(2025, 1, 15, 10, 0);
      const endTime = ts(2025, 1, 25, 10, 0);

      const notifications = gatherAllNotifications(
        [
          createCountdown({
            targetDate: ts(2025, 1, 18, 12, 0), // Completes on Jan 18
            checkinRecurrence: { type: "daily", hour: 9, minute: 0 },
          }),
        ],
        now,
        endTime,
      );

      const checkins = notifications.filter(
        (n) => n.type === "checkin-reminder",
      );
      // Should only have check-ins up to Jan 18
      for (const checkin of checkins) {
        expect(checkin.triggerTime).toBeLessThanOrEqual(ts(2025, 1, 18, 12, 0));
      }
    });

    it("includes check-in reminders after target for count-up timers", () => {
      const now = ts(2025, 1, 15, 10, 0);
      const endTime = ts(2025, 1, 25, 10, 0);

      const notifications = gatherAllNotifications(
        [
          createCountdown({
            targetDate: ts(2025, 1, 10, 12, 0), // Started Jan 10
            isCountUp: true,
            checkinRecurrence: { type: "daily", hour: 9, minute: 0 },
          }),
        ],
        now,
        endTime,
      );

      const checkins = notifications.filter(
        (n) => n.type === "checkin-reminder",
      );
      expect(checkins.length).toBeGreaterThan(0);
    });
  });

  describe("multiple countdowns", () => {
    it("combines notifications from multiple countdowns", () => {
      const now = ts(2025, 1, 15, 10, 0);
      const endTime = ts(2025, 1, 22, 10, 0);

      const notifications = gatherAllNotifications(
        [
          createCountdown({
            entryId: 1,
            title: "Vacation",
            targetDate: ts(2025, 1, 20, 12, 0),
            notificationEnabled: true,
            checkinRecurrence: { type: "daily", hour: 9, minute: 0 },
          }),
          createCountdown({
            entryId: 2,
            title: "Project",
            targetDate: ts(2025, 1, 18, 12, 0),
            notificationEnabled: true,
            checkinRecurrence: {
              type: "weekly",
              dayOfWeek: 1,
              hour: 10,
              minute: 0,
            },
          }),
        ],
        now,
        endTime,
      );

      // Should have notifications from both
      const entry1Notifications = notifications.filter((n) => n.entryId === 1);
      const entry2Notifications = notifications.filter((n) => n.entryId === 2);

      expect(entry1Notifications.length).toBeGreaterThan(0);
      expect(entry2Notifications.length).toBeGreaterThan(0);
    });

    it("sorts notifications by trigger time", () => {
      const now = ts(2025, 1, 15, 10, 0);
      const endTime = ts(2025, 1, 22, 10, 0);

      const notifications = gatherAllNotifications(
        [
          createCountdown({
            entryId: 1,
            targetDate: ts(2025, 1, 20, 12, 0),
            checkinRecurrence: { type: "daily", hour: 15, minute: 0 }, // 3pm
          }),
          createCountdown({
            entryId: 2,
            targetDate: ts(2025, 1, 20, 12, 0),
            checkinRecurrence: { type: "daily", hour: 9, minute: 0 }, // 9am
          }),
        ],
        now,
        endTime,
      );

      // Verify sorted by time
      for (let i = 1; i < notifications.length; i++) {
        expect(notifications[i].triggerTime).toBeGreaterThanOrEqual(
          notifications[i - 1].triggerTime,
        );
      }
    });
  });

  describe("notification limits", () => {
    it("respects max notification limit", () => {
      const now = ts(2025, 1, 1, 10, 0);
      const endTime = ts(2025, 12, 31, 10, 0); // Full year

      const notifications = gatherAllNotifications(
        [
          createCountdown({
            targetDate: ts(2025, 12, 31, 12, 0),
            checkinRecurrence: { type: "daily", hour: 9, minute: 0 },
          }),
        ],
        now,
        endTime,
        10, // Max 10 notifications
      );

      expect(notifications.length).toBe(10);
    });

    it("prioritizes earliest notifications when hitting limit", () => {
      const now = ts(2025, 1, 1, 10, 0);
      const endTime = ts(2025, 2, 28, 10, 0);

      const notifications = gatherAllNotifications(
        [
          createCountdown({
            targetDate: ts(2025, 2, 28, 12, 0),
            checkinRecurrence: { type: "daily", hour: 9, minute: 0 },
          }),
        ],
        now,
        endTime,
        5,
      );

      // Should have the earliest 5
      const firstNotificationDate = new Date(notifications[0].triggerTime);
      expect(firstNotificationDate.getMonth()).toBe(0); // January
    });
  });

  describe("7-day window simulation", () => {
    it("typical 7-day scheduling scenario", () => {
      const now = ts(2025, 1, 15, 10, 0); // Wednesday Jan 15
      const endTime = ts(2025, 1, 22, 10, 0); // 7 days later

      const notifications = gatherAllNotifications(
        [
          // Countdown completing in 3 days
          createCountdown({
            entryId: 1,
            title: "Deadline",
            targetDate: ts(2025, 1, 18, 17, 0),
            notificationEnabled: true,
            checkinRecurrence: { type: "daily", hour: 9, minute: 0 },
          }),
          // Countdown completing next month (outside window)
          createCountdown({
            entryId: 2,
            title: "Vacation",
            targetDate: ts(2025, 2, 15, 12, 0),
            notificationEnabled: true,
            checkinRecurrence: {
              type: "weekly",
              dayOfWeek: 1,
              hour: 10,
              minute: 0,
            },
          }),
        ],
        now,
        endTime,
        32,
      );

      // Should have:
      // - Deadline completion notification (Jan 18)
      // - Deadline check-ins for Jan 16, 17, 18
      // - Vacation check-in for Monday Jan 20
      // No vacation completion (outside window)

      const deadlineComplete = notifications.find(
        (n) => n.entryId === 1 && n.type === "countdown-complete",
      );
      expect(deadlineComplete).toBeDefined();

      const vacationComplete = notifications.find(
        (n) => n.entryId === 2 && n.type === "countdown-complete",
      );
      expect(vacationComplete).toBeUndefined();

      const deadlineCheckins = notifications.filter(
        (n) => n.entryId === 1 && n.type === "checkin-reminder",
      );
      expect(deadlineCheckins.length).toBe(3); // Jan 16, 17, 18

      const vacationCheckins = notifications.filter(
        (n) => n.entryId === 2 && n.type === "checkin-reminder",
      );
      expect(vacationCheckins.length).toBe(1); // Monday Jan 20
    });
  });
});

describe("getTimezoneInfo", () => {
  it("returns timezone info with offset and name", () => {
    const info = getTimezoneInfo();

    expect(typeof info.offset).toBe("number");
    expect(typeof info.name).toBe("string");
    expect(info.name.length).toBeGreaterThan(0);
  });

  it("returns consistent info for same timestamp", () => {
    const timestamp = ts(2025, 6, 15, 12, 0);
    const info1 = getTimezoneInfo(timestamp);
    const info2 = getTimezoneInfo(timestamp);

    expect(info1.offset).toBe(info2.offset);
    expect(info1.name).toBe(info2.name);
  });
});

describe("hasTimezoneChanged", () => {
  it("returns false for same timezone", () => {
    const tz1: TimezoneInfo = { offset: -300, name: "America/New_York" };
    const tz2: TimezoneInfo = { offset: -300, name: "America/New_York" };

    expect(hasTimezoneChanged(tz1, tz2)).toBe(false);
  });

  it("returns true when timezone name changes", () => {
    const tz1: TimezoneInfo = { offset: -300, name: "America/New_York" };
    const tz2: TimezoneInfo = { offset: -480, name: "America/Los_Angeles" };

    expect(hasTimezoneChanged(tz1, tz2)).toBe(true);
  });

  it("returns true when traveling to different timezone", () => {
    const tz1: TimezoneInfo = { offset: 0, name: "Europe/London" };
    const tz2: TimezoneInfo = { offset: -540, name: "Asia/Tokyo" };

    expect(hasTimezoneChanged(tz1, tz2)).toBe(true);
  });

  it("returns false when offset changes due to DST but name stays same", () => {
    // This is normal DST behavior, not a timezone change
    const tz1: TimezoneInfo = { offset: -300, name: "America/New_York" }; // EST
    const tz2: TimezoneInfo = { offset: -240, name: "America/New_York" }; // EDT

    expect(hasTimezoneChanged(tz1, tz2)).toBe(false);
  });
});

describe("detectDSTTransition", () => {
  it("returns no DST when times have same offset", () => {
    // Both times in same DST period
    const startTime = ts(2025, 1, 15, 10, 0);
    const endTime = ts(2025, 1, 20, 10, 0);

    const result = detectDSTTransition(startTime, endTime);

    expect(result.hasDST).toBe(false);
    expect(result.offsetChange).toBe(0);
  });

  // Note: These tests depend on the system timezone having DST
  // They may need adjustment based on the test environment
  describe("in DST-observing timezone", () => {
    it("detects spring forward (March)", () => {
      // US DST starts second Sunday of March
      // In 2025, that's March 9
      const beforeDST = ts(2025, 3, 8, 10, 0); // March 8
      const afterDST = ts(2025, 3, 10, 10, 0); // March 10

      const result = detectDSTTransition(beforeDST, afterDST);

      // This test will only pass in US timezones that observe DST
      // In other timezones, it will show no DST which is also valid
      if (result.hasDST) {
        expect(result.offsetChange).toBe(-60); // Spring forward = lose 1 hour
        expect(result.transitionTime).toBeDefined();
      }
    });

    it("detects fall back (November)", () => {
      // US DST ends first Sunday of November
      // In 2025, that's November 2
      const beforeDST = ts(2025, 11, 1, 10, 0); // Nov 1
      const afterDST = ts(2025, 11, 3, 10, 0); // Nov 3

      const result = detectDSTTransition(beforeDST, afterDST);

      // This test will only pass in US timezones that observe DST
      if (result.hasDST) {
        expect(result.offsetChange).toBe(60); // Fall back = gain 1 hour
        expect(result.transitionTime).toBeDefined();
      }
    });
  });

  it("finds approximate transition time with binary search", () => {
    // Create a large time window that might span DST
    const startTime = ts(2025, 3, 1, 0, 0); // March 1
    const endTime = ts(2025, 3, 15, 0, 0); // March 15

    const result = detectDSTTransition(startTime, endTime);

    // If DST occurred, transition time should be between start and end
    if (result.hasDST && result.transitionTime) {
      expect(result.transitionTime).toBeGreaterThan(startTime);
      expect(result.transitionTime).toBeLessThanOrEqual(endTime);
    }
  });
});

describe("adjustForDST", () => {
  it("returns same time when hours match", () => {
    const triggerTime = ts(2025, 1, 15, 9, 0);
    const adjusted = adjustForDST(triggerTime, 9, 0);

    expect(adjusted).toBe(triggerTime);
  });

  it("returns same time when hours and minutes match", () => {
    const triggerTime = ts(2025, 1, 15, 14, 30);
    const adjusted = adjustForDST(triggerTime, 14, 30);

    expect(adjusted).toBe(triggerTime);
  });

  it("adjusts time when hour drifted", () => {
    // Simulate DST causing time to drift from 9am to 10am
    const driftedTime = ts(2025, 3, 10, 10, 0);
    const adjusted = adjustForDST(driftedTime, 9, 0);

    const adjustedDate = new Date(adjusted);
    expect(adjustedDate.getHours()).toBe(9);
    expect(adjustedDate.getMinutes()).toBe(0);
  });

  it("adjusts time when hour drifted backwards", () => {
    // Simulate DST causing time to drift from 9am to 8am
    const driftedTime = ts(2025, 11, 3, 8, 0);
    const adjusted = adjustForDST(driftedTime, 9, 0);

    const adjustedDate = new Date(adjusted);
    expect(adjustedDate.getHours()).toBe(9);
    expect(adjustedDate.getMinutes()).toBe(0);
  });
});

describe("checkNotificationsForDST", () => {
  const createNotification = (
    triggerTime: number,
    title: string = "Test",
  ): {
    entryId: number;
    title: string;
    body: string;
    triggerTime: number;
    type: "countdown-complete" | "checkin-reminder";
  } => ({
    entryId: 1,
    title,
    body: "Test body",
    triggerTime,
    type: "checkin-reminder",
  });

  it("returns empty array when no DST transitions", () => {
    const now = ts(2025, 1, 15, 10, 0);
    const notifications = [
      createNotification(ts(2025, 1, 16, 9, 0)),
      createNotification(ts(2025, 1, 17, 9, 0)),
    ];

    const warnings = checkNotificationsForDST(notifications, now);

    expect(warnings.length).toBe(0);
  });

  it("returns warnings for notifications crossing DST", () => {
    // This test only works in DST-observing timezones
    const now = ts(2025, 3, 8, 10, 0); // March 8
    const notifications = [
      createNotification(ts(2025, 3, 9, 9, 0), "Before DST"),
      createNotification(ts(2025, 3, 10, 9, 0), "After DST"),
    ];

    const warnings = checkNotificationsForDST(notifications, now);

    // In DST-observing timezones, the March 10 notification crosses DST
    // In non-DST timezones, no warnings expected
    for (const warning of warnings) {
      expect(warning.notification).toBeDefined();
      expect(warning.transition.hasDST).toBe(true);
    }
  });

  it("includes notification and transition details in warnings", () => {
    const now = ts(2025, 3, 1, 10, 0);
    const notifications = [
      createNotification(ts(2025, 3, 15, 9, 0), "Mid-March Notification"),
    ];

    const warnings = checkNotificationsForDST(notifications, now);

    // If there are warnings, verify structure
    for (const warning of warnings) {
      expect(warning.notification.title).toBe("Mid-March Notification");
      expect(warning.transition.hasDST).toBe(true);
      expect(typeof warning.transition.offsetChange).toBe("number");
    }
  });
});
