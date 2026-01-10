import SwiftUI
import WidgetKit

/// Main widget view
struct CountdownWidgetView: View {
    var entry: CountdownTimelineProvider.Entry

    @Environment(\.widgetFamily) var widgetFamily

    var body: some View {
        switch widgetFamily {
        case .systemLarge:
            // Large widget shows list of all countdowns
            LargeListWidgetView(countdowns: entry.allCountdowns)
        case .systemSmall:
            if let countdown = entry.countdown {
                SmallWidgetView(countdown: countdown)
            } else {
                PlaceholderView()
            }
        case .systemMedium:
            MediumListWidgetView(countdowns: entry.allCountdowns)
        case .accessoryCircular:
            if let countdown = entry.countdown {
                CircularWidgetView(countdown: countdown)
            } else {
                PlaceholderView()
            }
        case .accessoryRectangular:
            if let countdown = entry.countdown {
                RectangularWidgetView(countdown: countdown)
            } else {
                PlaceholderView()
            }
        default:
            if let countdown = entry.countdown {
                SmallWidgetView(countdown: countdown)
            } else {
                PlaceholderView()
            }
        }
    }
}

/// Small widget - shows single countdown with icon
struct SmallWidgetView: View {
    let countdown: WidgetCountdownData

    var body: some View {
        let formattedTime = CountdownFormatter.format(
            targetDate: countdown.targetDateAsDate,
            isCountUp: countdown.isCountUp
        )

        VStack(alignment: .leading, spacing: 4) {
            // Type icon and title row
            HStack(spacing: 6) {
                Image(systemName: countdown.isCountUp ? "arrow.up.circle.fill" : "arrow.down.circle.fill")
                    .font(.system(size: 16))
                    .foregroundColor(countdown.isCountUp ? .blue : .orange)

                Text(countdown.title)
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundColor(.secondary)
                    .lineLimit(1)
            }

            Spacer()

            // Large time display
            Text(formattedTime)
                .font(.system(size: 32, weight: .bold, design: .rounded))
                .foregroundColor(.primary)
                .minimumScaleFactor(0.5)
                .lineLimit(1)

            // Type label
            Text(countdown.isCountUp ? "Time Since" : "Countdown")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding(8)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .widgetURL(URL(string: "jot://countdown/\(countdown.entryId)"))
    }
}

/// Medium widget - shows list of up to 2 countdowns/countups plus quick create buttons
struct MediumListWidgetView: View {
    let countdowns: [WidgetCountdownData]

    // Maximum number of items to show in medium widget (2 rows + quick create row)
    private let maxItems = 2

    var body: some View {
        if countdowns.isEmpty {
            VStack(spacing: 0) {
                Spacer()

                VStack(spacing: 6) {
                    Image(systemName: "timer")
                        .font(.system(size: 28))
                        .foregroundColor(.secondary)

                    Text("No Countdowns")
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundColor(.primary)
                }

                Spacer()

                QuickCreateButtonsView()
            }
        } else {
            let items = Array(countdowns.prefix(maxItems))

            VStack(spacing: 0) {
                ForEach(Array(items.enumerated()), id: \.element.id) { index, countdown in
                    MediumRowView(countdown: countdown)

                    if index < items.count - 1 {
                        Divider()
                            .padding(.leading, 36)
                    }
                }

                Spacer(minLength: 0)

                QuickCreateButtonsView()
            }
            .padding(.vertical, 4)
            .padding(.horizontal, 2)
        }
    }
}

/// Row for medium widget with flexible height
struct MediumRowView: View {
    let countdown: WidgetCountdownData

    var body: some View {
        Link(destination: URL(string: "jot://countdown/\(countdown.entryId)")!) {
            HStack(spacing: 8) {
                // Type icon
                Image(systemName: countdown.isCountUp ? "arrow.up.circle.fill" : "arrow.down.circle.fill")
                    .font(.system(size: 20))
                    .foregroundColor(countdown.isCountUp ? .blue : .orange)

                // Title
                Text(countdown.title)
                    .font(.body)
                    .fontWeight(.medium)
                    .foregroundColor(.primary)
                    .lineLimit(1)

                Spacer()

                // Time
                Text(CountdownFormatter.format(
                    targetDate: countdown.targetDateAsDate,
                    isCountUp: countdown.isCountUp
                ))
                .font(.system(.body, design: .rounded))
                .fontWeight(.semibold)
                .foregroundColor(.primary)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 10)
        }
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
                    .font(.system(size: 26, weight: .bold, design: .rounded))
                Text("days")
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
            } else if hours > 0 {
                Text("\(hours)")
                    .font(.system(size: 26, weight: .bold, design: .rounded))
                Text("hours")
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
            } else if isPast {
                Text("Done")
                    .font(.system(size: 18, weight: .bold, design: .rounded))
            } else {
                Text("<1h")
                    .font(.system(size: 18, weight: .bold, design: .rounded))
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
                .font(.subheadline)
                .fontWeight(.medium)
                .lineLimit(1)

            Text(formattedTime)
                .font(.system(size: 22, weight: .bold, design: .rounded))
        }
        .widgetURL(URL(string: "jot://countdown/\(countdown.entryId)"))
    }
}

/// Large widget - shows list of all countdowns and countups
struct LargeListWidgetView: View {
    let countdowns: [WidgetCountdownData]

    // Maximum number of items to show
    private let maxItems = 5

    var body: some View {
        if countdowns.isEmpty {
            EmptyListView()
        } else {
            VStack(alignment: .leading, spacing: 0) {
                // Countdown list - no header, just the items
                VStack(spacing: 0) {
                    ForEach(Array(countdowns.prefix(maxItems).enumerated()), id: \.element.id) { index, countdown in
                        CountdownRowView(countdown: countdown, showDivider: index < min(countdowns.count, maxItems) - 1)
                    }
                }
                .padding(.top, 4)

                Spacer(minLength: 0)

                // Quick create buttons
                QuickCreateButtonsView()
            }
        }
    }
}

/// Single row in the large widget list
struct CountdownRowView: View {
    let countdown: WidgetCountdownData
    let showDivider: Bool

    var body: some View {
        Link(destination: URL(string: "jot://countdown/\(countdown.entryId)")!) {
            VStack(spacing: 0) {
                HStack(spacing: 10) {
                    // Type icon - differentiate countup vs countdown
                    Image(systemName: countdown.isCountUp ? "arrow.up.circle.fill" : "arrow.down.circle.fill")
                        .font(.system(size: 22))
                        .foregroundColor(countdown.isCountUp ? .blue : .orange)

                    // Title and type label
                    VStack(alignment: .leading, spacing: 2) {
                        Text(countdown.title)
                            .font(.body)
                            .fontWeight(.medium)
                            .foregroundColor(.primary)
                            .lineLimit(1)

                        Text(countdown.isCountUp ? "Time Since" : "Countdown")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }

                    Spacer()

                    // Time
                    Text(CountdownFormatter.format(
                        targetDate: countdown.targetDateAsDate,
                        isCountUp: countdown.isCountUp
                    ))
                    .font(.system(.title3, design: .rounded))
                    .fontWeight(.semibold)
                    .foregroundColor(.primary)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 5)

                if showDivider {
                    Divider()
                        .padding(.leading, 40)
                }
            }
        }
    }
}

/// Empty state for large widget
struct EmptyListView: View {
    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            VStack(spacing: 10) {
                Image(systemName: "timer")
                    .font(.system(size: 44))
                    .foregroundColor(.secondary)

                Text("No Countdowns")
                    .font(.title3)
                    .fontWeight(.semibold)
                    .foregroundColor(.primary)

                Text("Tap below to create")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
            }

            Spacer()

            // Quick create buttons
            QuickCreateButtonsView()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// Quick create buttons row for large widget
struct QuickCreateButtonsView: View {
    var body: some View {
        HStack(spacing: 0) {
            // Journal button
            Link(destination: URL(string: "jot://create/journal")!) {
                VStack(spacing: 2) {
                    Image(systemName: "square.and.pencil")
                        .font(.system(size: 18))
                        .foregroundColor(.green)
                    Text("Journal")
                        .font(.system(size: 9))
                        .foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity)
            }

            // Chat button
            Link(destination: URL(string: "jot://create/chat")!) {
                VStack(spacing: 2) {
                    Image(systemName: "bubble.left.fill")
                        .font(.system(size: 18))
                        .foregroundColor(.blue)
                    Text("Chat")
                        .font(.system(size: 9))
                        .foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity)
            }

            // Countdown button
            Link(destination: URL(string: "jot://create/countdown")!) {
                VStack(spacing: 2) {
                    Image(systemName: "timer")
                        .font(.system(size: 18))
                        .foregroundColor(.orange)
                    Text("Countdown")
                        .font(.system(size: 9))
                        .foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity)
            }
        }
        .padding(.horizontal, 4)
        .padding(.top, 6)
    }
}

/// Placeholder view when no countdown is selected
struct PlaceholderView: View {
    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: "timer")
                .font(.system(size: 36))
                .foregroundColor(.secondary)

            Text("Select a countdown")
                .font(.subheadline)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
