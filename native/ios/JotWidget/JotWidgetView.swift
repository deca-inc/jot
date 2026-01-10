import SwiftUI
import WidgetKit

/// Main widget view
struct JotWidgetView: View {
    var entry: JotTimelineProvider.Entry

    @Environment(\.widgetFamily) var widgetFamily

    var body: some View {
        if let countdown = entry.countdown {
            switch widgetFamily {
            case .systemSmall:
                SmallWidgetView(countdown: countdown)
            case .systemMedium:
                MediumWidgetView(countdown: countdown)
            case .accessoryCircular:
                CircularWidgetView(countdown: countdown)
            case .accessoryRectangular:
                RectangularWidgetView(countdown: countdown)
            default:
                SmallWidgetView(countdown: countdown)
            }
        } else {
            PlaceholderView()
        }
    }
}

/// Small widget - shows title and time
struct SmallWidgetView: View {
    let countdown: WidgetCountdownData

    var body: some View {
        let formattedTime = CountdownFormatter.format(
            targetDate: countdown.targetDateAsDate,
            isCountUp: countdown.isCountUp
        )
        let status = CountdownFormatter.statusLabel(
            targetDate: countdown.targetDateAsDate,
            isCountUp: countdown.isCountUp
        )

        VStack(alignment: .leading, spacing: 4) {
            Text(countdown.title)
                .font(.caption)
                .fontWeight(.medium)
                .foregroundColor(.secondary)
                .lineLimit(1)

            Spacer()

            Text(formattedTime)
                .font(.system(size: 32, weight: .bold, design: .rounded))
                .foregroundColor(.primary)
                .minimumScaleFactor(0.5)
                .lineLimit(1)

            Text(status)
                .font(.caption2)
                .foregroundColor(.secondary)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .widgetURL(URL(string: "jot://countdown/\(countdown.entryId)"))
    }
}

/// Medium widget - shows title, time, and target date
struct MediumWidgetView: View {
    let countdown: WidgetCountdownData

    var body: some View {
        let formattedTime = CountdownFormatter.format(
            targetDate: countdown.targetDateAsDate,
            isCountUp: countdown.isCountUp
        )
        let status = CountdownFormatter.statusLabel(
            targetDate: countdown.targetDateAsDate,
            isCountUp: countdown.isCountUp
        )

        let dateFormatter: DateFormatter = {
            let formatter = DateFormatter()
            formatter.dateStyle = .medium
            formatter.timeStyle = .short
            return formatter
        }()

        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(countdown.title)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundColor(.secondary)
                    .lineLimit(1)

                Text(formattedTime)
                    .font(.system(size: 36, weight: .bold, design: .rounded))
                    .foregroundColor(.primary)
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)

                Text(status)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 4) {
                Text(countdown.isCountUp ? "Since" : "Target")
                    .font(.caption2)
                    .foregroundColor(.secondary)

                Text(dateFormatter.string(from: countdown.targetDateAsDate))
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.trailing)
            }
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .widgetURL(URL(string: "jot://countdown/\(countdown.entryId)"))
    }
}

/// Circular lock screen widget
struct CircularWidgetView: View {
    let countdown: WidgetCountdownData

    var body: some View {
        let (isPast, days, hours, _, _) = CountdownFormatter.calculateTimeRemaining(
            targetDate: countdown.targetDateAsDate
        )

        VStack(spacing: 0) {
            if days > 0 {
                Text("\(days)")
                    .font(.system(size: 24, weight: .bold, design: .rounded))
                Text("days")
                    .font(.system(size: 10))
                    .foregroundColor(.secondary)
            } else if hours > 0 {
                Text("\(hours)")
                    .font(.system(size: 24, weight: .bold, design: .rounded))
                Text("hours")
                    .font(.system(size: 10))
                    .foregroundColor(.secondary)
            } else if isPast {
                Text("Done")
                    .font(.system(size: 16, weight: .bold, design: .rounded))
            } else {
                Text("<1h")
                    .font(.system(size: 16, weight: .bold, design: .rounded))
            }
        }
        .widgetURL(URL(string: "jot://countdown/\(countdown.entryId)"))
    }
}

/// Rectangular lock screen widget
struct RectangularWidgetView: View {
    let countdown: WidgetCountdownData

    var body: some View {
        let formattedTime = CountdownFormatter.format(
            targetDate: countdown.targetDateAsDate,
            isCountUp: countdown.isCountUp
        )

        VStack(alignment: .leading, spacing: 2) {
            Text(countdown.title)
                .font(.caption)
                .fontWeight(.medium)
                .lineLimit(1)

            Text(formattedTime)
                .font(.system(size: 20, weight: .bold, design: .rounded))
        }
        .widgetURL(URL(string: "jot://countdown/\(countdown.entryId)"))
    }
}

/// Placeholder view when no countdown is selected
struct PlaceholderView: View {
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "timer")
                .font(.largeTitle)
                .foregroundColor(.secondary)

            Text("Select a countdown")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
