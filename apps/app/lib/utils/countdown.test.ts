import {
  calculateTimeRemaining,
  formatCountdown,
  isCountdownComplete,
  shouldTriggerConfetti,
  extractCountdownData,
  createCountdownBlock,
  type CountdownData,
} from "./countdown";
import type { Block } from "../db/entries";

describe("calculateTimeRemaining", () => {
  beforeEach(() => {
    // Mock Date.now to a fixed time for consistent tests
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-01-15T12:00:00Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("calculates time remaining for future date", () => {
    // 5 days, 3 hours, 30 minutes from now
    const futureDate =
      Date.now() +
      5 * 24 * 60 * 60 * 1000 +
      3 * 60 * 60 * 1000 +
      30 * 60 * 1000;
    const result = calculateTimeRemaining(futureDate);

    expect(result.isPast).toBe(false);
    expect(result.days).toBe(5);
    expect(result.hours).toBe(3);
    expect(result.minutes).toBe(30);
  });

  it("calculates time elapsed for past date", () => {
    // 2 days ago
    const pastDate = Date.now() - 2 * 24 * 60 * 60 * 1000;
    const result = calculateTimeRemaining(pastDate);

    expect(result.isPast).toBe(true);
    expect(result.days).toBe(2);
  });

  it("handles exact current time", () => {
    const result = calculateTimeRemaining(Date.now());

    expect(result.isPast).toBe(false);
    expect(result.days).toBe(0);
    expect(result.hours).toBe(0);
    expect(result.minutes).toBe(0);
    expect(result.totalMinutes).toBe(0);
  });

  it("calculates total minutes correctly", () => {
    // 1 day, 2 hours, 30 minutes = 1590 minutes
    const futureDate =
      Date.now() +
      1 * 24 * 60 * 60 * 1000 +
      2 * 60 * 60 * 1000 +
      30 * 60 * 1000;
    const result = calculateTimeRemaining(futureDate);

    expect(result.totalMinutes).toBe(1590);
  });
});

describe("formatCountdown", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-01-15T12:00:00Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("countdown mode (isCountUp = false)", () => {
    it("shows days and hours when more than 1 day", () => {
      const futureDate =
        Date.now() + 5 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000;
      expect(formatCountdown(futureDate, false)).toBe("5d 3h");
    });

    it("shows just days when no extra hours", () => {
      const futureDate = Date.now() + 5 * 24 * 60 * 60 * 1000;
      expect(formatCountdown(futureDate, false)).toBe("5d");
    });

    it("shows hours and minutes when less than 1 day", () => {
      const futureDate = Date.now() + 5 * 60 * 60 * 1000 + 30 * 60 * 1000;
      expect(formatCountdown(futureDate, false)).toBe("5h 30m");
    });

    it("shows just hours when no extra minutes", () => {
      const futureDate = Date.now() + 5 * 60 * 60 * 1000;
      expect(formatCountdown(futureDate, false)).toBe("5h");
    });

    it("shows <5m when less than 5 minutes remaining", () => {
      const futureDate = Date.now() + 3 * 60 * 1000;
      expect(formatCountdown(futureDate, false)).toBe("<5m");
    });

    it("shows <1m when less than 1 minute remaining", () => {
      const futureDate = Date.now() + 30 * 1000;
      expect(formatCountdown(futureDate, false)).toBe("<1m");
    });

    it("shows negative time when past", () => {
      const pastDate =
        Date.now() - 2 * 24 * 60 * 60 * 1000 - 3 * 60 * 60 * 1000;
      expect(formatCountdown(pastDate, false)).toBe("-2d 3h");
    });

    it("shows weeks and days when more than 1 week", () => {
      const futureDate =
        Date.now() + 3 * 7 * 24 * 60 * 60 * 1000 + 2 * 24 * 60 * 60 * 1000;
      expect(formatCountdown(futureDate, false)).toBe("3w 2d");
    });

    it("shows years and weeks when more than 1 year", () => {
      const futureDate = Date.now() + 400 * 24 * 60 * 60 * 1000; // ~1 year + 5 weeks
      expect(formatCountdown(futureDate, false)).toBe("1y 5w");
    });
  });

  describe("count-up mode (isCountUp = true)", () => {
    it("shows 0d when less than a day", () => {
      // Past date but less than 1 day ago
      const pastDate = Date.now() - 5 * 60 * 60 * 1000;
      expect(formatCountdown(pastDate, true)).toBe("0d");
    });

    it("shows elapsed time without negative prefix", () => {
      const pastDate =
        Date.now() - 5 * 24 * 60 * 60 * 1000 - 3 * 60 * 60 * 1000;
      expect(formatCountdown(pastDate, true)).toBe("5d 3h");
    });

    it("shows weeks for longer periods", () => {
      const pastDate = Date.now() - 15 * 24 * 60 * 60 * 1000; // 2 weeks 1 day ago
      expect(formatCountdown(pastDate, true)).toBe("2w 1d");
    });
  });
});

describe("isCountdownComplete", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-01-15T12:00:00Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns true when target is in the past", () => {
    const pastDate = Date.now() - 1000;
    expect(isCountdownComplete(pastDate)).toBe(true);
  });

  it("returns false when target is in the future", () => {
    const futureDate = Date.now() + 1000;
    expect(isCountdownComplete(futureDate)).toBe(false);
  });

  it("returns true when target equals current time", () => {
    expect(isCountdownComplete(Date.now())).toBe(true);
  });
});

describe("shouldTriggerConfetti", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-01-15T12:00:00Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns true when countdown is complete, confetti enabled, not yet triggered", () => {
    const data: CountdownData = {
      targetDate: Date.now() - 1000,
      title: "Test",
      confettiEnabled: true,
      confettiTriggeredAt: undefined,
    };
    expect(shouldTriggerConfetti(data)).toBe(true);
  });

  it("returns false when countdown is not complete", () => {
    const data: CountdownData = {
      targetDate: Date.now() + 1000,
      title: "Test",
      confettiEnabled: true,
    };
    expect(shouldTriggerConfetti(data)).toBe(false);
  });

  it("returns false when confetti is disabled", () => {
    const data: CountdownData = {
      targetDate: Date.now() - 1000,
      title: "Test",
      confettiEnabled: false,
    };
    expect(shouldTriggerConfetti(data)).toBe(false);
  });

  it("returns false when confetti already triggered", () => {
    const data: CountdownData = {
      targetDate: Date.now() - 1000,
      title: "Test",
      confettiEnabled: true,
      confettiTriggeredAt: Date.now() - 500,
    };
    expect(shouldTriggerConfetti(data)).toBe(false);
  });
});

describe("extractCountdownData", () => {
  it("extracts countdown data from blocks", () => {
    const blocks: Block[] = [
      {
        type: "countdown",
        targetDate: 1705320000000,
        title: "My Countdown",
        isCountUp: false,
        confettiEnabled: true,
      },
    ];

    const result = extractCountdownData(blocks);

    expect(result).not.toBeNull();
    expect(result?.title).toBe("My Countdown");
    expect(result?.targetDate).toBe(1705320000000);
    expect(result?.isCountUp).toBe(false);
    expect(result?.confettiEnabled).toBe(true);
  });

  it("returns null when no countdown block exists", () => {
    const blocks: Block[] = [{ type: "paragraph", content: "Hello" }];

    const result = extractCountdownData(blocks);

    expect(result).toBeNull();
  });

  it("defaults confettiEnabled to false when not specified", () => {
    const blocks: Block[] = [
      {
        type: "countdown",
        targetDate: 1705320000000,
        title: "My Countdown",
      },
    ];

    const result = extractCountdownData(blocks);

    expect(result?.confettiEnabled).toBe(false);
  });
});

describe("createCountdownBlock", () => {
  it("creates a countdown block with required fields", () => {
    const block = createCountdownBlock({
      targetDate: 1705320000000,
      title: "My Countdown",
    });

    expect(block.type).toBe("countdown");
    expect(block).toHaveProperty("targetDate", 1705320000000);
    expect(block).toHaveProperty("title", "My Countdown");
  });

  it("includes optional fields when provided", () => {
    const block = createCountdownBlock({
      targetDate: 1705320000000,
      title: "My Countdown",
      isCountUp: true,
      rewardsNote: "Celebrate!",
      confettiEnabled: true,
    });

    expect(block).toHaveProperty("isCountUp", true);
    expect(block).toHaveProperty("rewardsNote", "Celebrate!");
    expect(block).toHaveProperty("confettiEnabled", true);
  });

  it("defaults confettiEnabled to false", () => {
    const block = createCountdownBlock({
      targetDate: 1705320000000,
      title: "My Countdown",
    });

    expect(block).toHaveProperty("confettiEnabled", false);
  });
});
