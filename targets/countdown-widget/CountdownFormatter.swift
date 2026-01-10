import Foundation

/// Formats countdown/time since for display
/// Mirrors the logic from lib/utils/countdown.ts formatCountdown()
struct CountdownFormatter {

    /// Calculate time remaining/elapsed from target date
    static func calculateTimeRemaining(targetDate: Date) -> (isPast: Bool, days: Int, hours: Int, minutes: Int, totalMinutes: Int) {
        let now = Date()
        let diff = targetDate.timeIntervalSince(now)
        let isPast = diff < 0
        let absDiff = abs(diff)

        let totalMinutes = Int(absDiff / 60)
        let days = totalMinutes / (60 * 24)
        let hours = (totalMinutes % (60 * 24)) / 60
        let minutes = totalMinutes % 60

        return (isPast, days, hours, minutes, totalMinutes)
    }

    /// Format countdown/time since for display
    static func format(targetDate: Date, isCountUp: Bool) -> String {
        let (isPast, days, hours, minutes, totalMinutes) = calculateTimeRemaining(targetDate: targetDate)

        // Handle < 1 day case
        if days == 0 {
            // For countup (Time Since), just show "0d" when less than a day
            if isCountUp {
                return "0d"
            }

            // Special formatting for countdowns near completion
            if !isPast {
                // Countdown still running
                if totalMinutes < 1 {
                    return "<1m"
                }
                if totalMinutes < 5 {
                    return "<5m"
                }
            } else {
                // Countdown ended
                if totalMinutes < 5 {
                    return "Just Now"
                }
                if totalMinutes < 30 {
                    return "<30m ago"
                }
                if totalMinutes < 60 {
                    return "<1h ago"
                }
            }

            if totalMinutes == 0 {
                return isPast ? "<1h ago" : "<1h"
            }

            // Less than a day: show hours and minutes
            if hours > 0 {
                let timeStr = minutes > 0 ? "\(hours)h \(minutes)m" : "\(hours)h"
                return isPast ? "\(timeStr) ago" : timeStr
            }

            // Less than an hour: show just minutes
            let timeStr = "\(minutes)m"
            return isPast ? "\(timeStr) ago" : timeStr
        }

        // Calculate larger units
        let years = days / 365
        let weeks = (days % 365) / 7
        let remainingDays = days % 7

        var timeStr: String

        if years > 0 {
            timeStr = weeks > 0 ? "\(years)y \(weeks)w" : "\(years)y"
        } else if weeks > 0 {
            timeStr = remainingDays > 0 ? "\(weeks)w \(remainingDays)d" : "\(weeks)w"
        } else {
            timeStr = hours > 0 ? "\(days)d \(hours)h" : "\(days)d"
        }

        // For countup, never show "ago"
        if isCountUp {
            return timeStr
        }

        return isPast ? "\(timeStr) ago" : timeStr
    }

    /// Get a short status label
    static func statusLabel(targetDate: Date, isCountUp: Bool) -> String {
        let isPast = targetDate < Date()

        if isCountUp {
            return "Time Since"
        } else if isPast {
            return "Completed"
        } else {
            return "Countdown"
        }
    }
}
