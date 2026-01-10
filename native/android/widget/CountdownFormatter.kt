package com.dotdotdot.jot.widget

import kotlin.math.abs

/**
 * Formats countdown/time since for display
 * Mirrors the logic from lib/utils/countdown.ts formatCountdown()
 */
object CountdownFormatter {

    data class TimeRemaining(
        val isPast: Boolean,
        val days: Int,
        val hours: Int,
        val minutes: Int,
        val totalMinutes: Int
    )

    /**
     * Calculate time remaining/elapsed from target date
     */
    fun calculateTimeRemaining(targetDate: Long): TimeRemaining {
        val now = System.currentTimeMillis()
        val diff = targetDate - now
        val isPast = diff < 0
        val absDiff = abs(diff)

        val totalMinutes = (absDiff / (1000 * 60)).toInt()
        val days = totalMinutes / (60 * 24)
        val hours = (totalMinutes % (60 * 24)) / 60
        val minutes = totalMinutes % 60

        return TimeRemaining(isPast, days, hours, minutes, totalMinutes)
    }

    /**
     * Format countdown/time since for display
     */
    fun format(targetDate: Long, isCountUp: Boolean): String {
        val (isPast, days, hours, minutes, totalMinutes) = calculateTimeRemaining(targetDate)

        // Handle < 1 day case
        if (days == 0) {
            // For countup (Time Since), just show "0d" when less than a day
            if (isCountUp) {
                return "0d"
            }

            // Special formatting for countdowns near completion
            if (!isPast) {
                // Countdown still running
                if (totalMinutes < 1) {
                    return "<1m"
                }
                if (totalMinutes < 5) {
                    return "<5m"
                }
            } else {
                // Countdown ended
                if (totalMinutes < 5) {
                    return "Just Now"
                }
                if (totalMinutes < 30) {
                    return "<30m ago"
                }
                if (totalMinutes < 60) {
                    return "<1h ago"
                }
            }

            if (totalMinutes == 0) {
                return if (isPast) "<1h ago" else "<1h"
            }

            // Less than a day: show hours and minutes
            if (hours > 0) {
                val timeStr = if (minutes > 0) "${hours}h ${minutes}m" else "${hours}h"
                return if (isPast) "$timeStr ago" else timeStr
            }

            // Less than an hour: show just minutes
            val timeStr = "${minutes}m"
            return if (isPast) "$timeStr ago" else timeStr
        }

        // Calculate larger units
        val years = days / 365
        val weeks = (days % 365) / 7
        val remainingDays = days % 7

        val timeStr = when {
            years > 0 -> if (weeks > 0) "${years}y ${weeks}w" else "${years}y"
            weeks > 0 -> if (remainingDays > 0) "${weeks}w ${remainingDays}d" else "${weeks}w"
            else -> if (hours > 0) "${days}d ${hours}h" else "${days}d"
        }

        // For countup, never show "ago"
        if (isCountUp) {
            return timeStr
        }

        return if (isPast) "$timeStr ago" else timeStr
    }

    /**
     * Get a short status label
     */
    fun statusLabel(targetDate: Long, isCountUp: Boolean): String {
        val isPast = targetDate < System.currentTimeMillis()

        return when {
            isCountUp -> "Time Since"
            isPast -> "Completed"
            else -> "Countdown"
        }
    }
}
