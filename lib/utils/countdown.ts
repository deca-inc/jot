import { Block } from "../db/entries";

/**
 * Data extracted from a countdown entry's blocks
 */
export interface CountdownData {
  targetDate: number;
  title: string;
  isCountUp?: boolean;
  rewardsNote?: string;
  confettiEnabled?: boolean;
  confettiTriggeredAt?: number;
}

/**
 * Result of time remaining calculation
 */
export interface TimeRemaining {
  isPast: boolean;
  days: number;
  hours: number;
  minutes: number;
  totalMinutes: number;
}

/**
 * Extract countdown data from entry blocks
 */
export function extractCountdownData(blocks: Block[]): CountdownData | null {
  const countdownBlock = blocks.find((b) => b.type === "countdown");
  if (!countdownBlock || countdownBlock.type !== "countdown") {
    return null;
  }
  return {
    targetDate: countdownBlock.targetDate,
    title: countdownBlock.title,
    isCountUp: countdownBlock.isCountUp,
    rewardsNote: countdownBlock.rewardsNote,
    confettiEnabled: countdownBlock.confettiEnabled ?? false,
    confettiTriggeredAt: countdownBlock.confettiTriggeredAt,
  };
}

/**
 * Calculate time remaining/elapsed from target date
 */
export function calculateTimeRemaining(targetDate: number): TimeRemaining {
  const now = Date.now();
  const diff = targetDate - now;
  const isPast = diff < 0;
  const absDiff = Math.abs(diff);

  const totalMinutes = Math.floor(absDiff / (1000 * 60));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  return { isPast, days, hours, minutes, totalMinutes };
}

/**
 * Format countdown/time since for display
 * Shows max 2 units: "5d", "3w 2d", "1y 5w"
 * For countdown: adds "ago" suffix when past
 */
export function formatCountdown(targetDate: number, isCountUp?: boolean): string {
  const { isPast, days, hours, minutes, totalMinutes } = calculateTimeRemaining(targetDate);

  // Handle < 1 day case
  if (days === 0) {
    // For countup (Time Since), just show "0d" when less than a day
    if (isCountUp) {
      return "0d";
    }

    if (totalMinutes === 0) {
      return isPast ? "<1h ago" : "<1h";
    }
    // Less than a day: show hours and minutes
    if (hours > 0) {
      const timeStr = minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
      return isPast ? `${timeStr} ago` : timeStr;
    }
    // Less than an hour: show just minutes
    const timeStr = `${minutes}m`;
    return isPast ? `${timeStr} ago` : timeStr;
  }

  // Calculate larger units
  const years = Math.floor(days / 365);
  const weeks = Math.floor((days % 365) / 7);
  const remainingDays = days % 7;

  let timeStr: string;

  if (years > 0) {
    // Show years and weeks (e.g., "1y 5w" or just "2y")
    timeStr = weeks > 0 ? `${years}y ${weeks}w` : `${years}y`;
  } else if (weeks > 0) {
    // Show weeks and days (e.g., "3w 2d" or just "5w")
    timeStr = remainingDays > 0 ? `${weeks}w ${remainingDays}d` : `${weeks}w`;
  } else {
    // Show days and hours (e.g., "5d 3h" or just "5d")
    timeStr = hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }

  // For countup, never show "ago"
  if (isCountUp) {
    return timeStr;
  }

  return isPast ? `${timeStr} ago` : timeStr;
}

/**
 * Check if confetti should be triggered
 * Returns true if countdown is complete, confetti is enabled, and hasn't been triggered yet
 */
export function shouldTriggerConfetti(data: CountdownData): boolean {
  const { isPast } = calculateTimeRemaining(data.targetDate);
  return (
    isPast && (data.confettiEnabled ?? true) && !data.confettiTriggeredAt
  );
}

/**
 * Check if countdown is complete
 */
export function isCountdownComplete(targetDate: number): boolean {
  return Date.now() >= targetDate;
}

/**
 * Create a countdown block from form data
 */
export function createCountdownBlock(data: {
  targetDate: number;
  title: string;
  isCountUp?: boolean;
  rewardsNote?: string;
  confettiEnabled?: boolean;
}): Block {
  return {
    type: "countdown",
    targetDate: data.targetDate,
    title: data.title,
    isCountUp: data.isCountUp,
    rewardsNote: data.rewardsNote,
    confettiEnabled: data.confettiEnabled ?? false,
  };
}
