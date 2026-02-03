import WidgetKit
import SwiftUI
import AppIntents

// MARK: - App Intent for Widget Configuration

/// App Intent to select a countdown for the widget
struct SelectCountdownIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Select Countdown"
    static var description = IntentDescription("Choose which countdown to display")

    @Parameter(title: "Countdown")
    var countdown: CountdownEntity?
}

/// Entity representing a countdown for selection
struct CountdownEntity: AppEntity {
    let id: String
    let title: String

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Countdown"
    static var defaultQuery = CountdownEntityQuery()

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(title)")
    }
}

/// Query to fetch available countdowns
struct CountdownEntityQuery: EntityQuery {
    func entities(for identifiers: [CountdownEntity.ID]) async throws -> [CountdownEntity] {
        let countdowns = WidgetDataStore.shared.getAllCountdowns()
        return identifiers.compactMap { id in
            guard let countdown = countdowns.first(where: { String($0.entryId) == id }) else {
                return nil
            }
            return CountdownEntity(id: String(countdown.entryId), title: countdown.title)
        }
    }

    func suggestedEntities() async throws -> [CountdownEntity] {
        let countdowns = WidgetDataStore.shared.getAllCountdowns()
        return countdowns.map { countdown in
            CountdownEntity(id: String(countdown.entryId), title: countdown.title)
        }
    }

    func defaultResult() async -> CountdownEntity? {
        let countdowns = WidgetDataStore.shared.getAllCountdowns()
        guard let first = countdowns.first else { return nil }
        return CountdownEntity(id: String(first.entryId), title: first.title)
    }
}

// MARK: - Timeline Entry

/// Timeline entry for countdown widget
struct JotEntry: TimelineEntry {
    let date: Date
    let countdown: WidgetCountdownData?
    let allCountdowns: [WidgetCountdownData] // For large widget list view
    let configuration: SelectCountdownIntent
}

// MARK: - Timeline Provider

/// Timeline provider for countdown widget
struct JotTimelineProvider: AppIntentTimelineProvider {
    typealias Entry = JotEntry
    typealias Intent = SelectCountdownIntent

    func placeholder(in context: Context) -> JotEntry {
        let sampleCountdown = WidgetCountdownData(
            entryId: 0,
            title: "My Countdown",
            targetDate: Int(Date().addingTimeInterval(86400 * 7).timeIntervalSince1970 * 1000),
            isCountUp: false,
            isPinned: false,
            updatedAt: Int(Date().timeIntervalSince1970 * 1000)
        )
        return JotEntry(
            date: Date(),
            countdown: sampleCountdown,
            allCountdowns: [sampleCountdown],
            configuration: SelectCountdownIntent()
        )
    }

    func snapshot(for configuration: SelectCountdownIntent, in context: Context) async -> JotEntry {
        let allCountdowns = WidgetDataStore.shared.getAllCountdowns()
        let countdown = getSelectedCountdown(for: configuration) ?? allCountdowns.first
        return JotEntry(
            date: Date(),
            countdown: countdown,
            allCountdowns: allCountdowns,
            configuration: configuration
        )
    }

    func timeline(for configuration: SelectCountdownIntent, in context: Context) async -> Timeline<JotEntry> {
        let allCountdowns = WidgetDataStore.shared.getAllCountdowns()
        let selectedCountdown = getSelectedCountdown(for: configuration) ?? allCountdowns.first

        var entries: [JotEntry] = []
        let currentDate = Date()

        // Generate timeline entries for time-based updates
        if let countdown = selectedCountdown {
            let targetDate = countdown.targetDateAsDate
            let isPast = targetDate < currentDate

            if isPast {
                // Countdown completed - update once per hour
                for hourOffset in 0..<12 {
                    let entryDate = Calendar.current.date(byAdding: .hour, value: hourOffset, to: currentDate)!
                    entries.append(JotEntry(
                        date: entryDate,
                        countdown: countdown,
                        allCountdowns: allCountdowns,
                        configuration: configuration
                    ))
                }
            } else {
                let timeUntilTarget = targetDate.timeIntervalSince(currentDate)

                if timeUntilTarget < 3600 {
                    // Less than 1 hour - update every minute
                    for minuteOffset in 0..<60 {
                        let entryDate = Calendar.current.date(byAdding: .minute, value: minuteOffset, to: currentDate)!
                        if entryDate <= targetDate.addingTimeInterval(60) {
                            entries.append(JotEntry(
                                date: entryDate,
                                countdown: countdown,
                                allCountdowns: allCountdowns,
                                configuration: configuration
                            ))
                        }
                    }
                } else if timeUntilTarget < 86400 {
                    // Less than 1 day - update every hour
                    for hourOffset in 0..<24 {
                        let entryDate = Calendar.current.date(byAdding: .hour, value: hourOffset, to: currentDate)!
                        entries.append(JotEntry(
                            date: entryDate,
                            countdown: countdown,
                            allCountdowns: allCountdowns,
                            configuration: configuration
                        ))
                    }
                } else {
                    // More than 1 day - update every 6 hours
                    for sixHourOffset in 0..<8 {
                        let entryDate = Calendar.current.date(byAdding: .hour, value: sixHourOffset * 6, to: currentDate)!
                        entries.append(JotEntry(
                            date: entryDate,
                            countdown: countdown,
                            allCountdowns: allCountdowns,
                            configuration: configuration
                        ))
                    }
                }
            }
        }

        // Ensure we have at least one entry
        if entries.isEmpty {
            entries.append(JotEntry(
                date: currentDate,
                countdown: selectedCountdown,
                allCountdowns: allCountdowns,
                configuration: configuration
            ))
        }

        return Timeline(entries: entries, policy: .atEnd)
    }

    private func getSelectedCountdown(for configuration: SelectCountdownIntent) -> WidgetCountdownData? {
        guard let selectedCountdown = configuration.countdown,
              let entryId = Int(selectedCountdown.id) else {
            // No countdown selected - return nil to enable rotation
            return nil
        }

        return WidgetDataStore.shared.getCountdown(entryId: entryId)
    }
}

// MARK: - Widget Definitions

/// Small countdown widget - displays a single countdown timer
struct CountdownWidget: Widget {
    let kind: String = "CountdownWidget"

    var body: some WidgetConfiguration {
        AppIntentConfiguration(
            kind: kind,
            intent: SelectCountdownIntent.self,
            provider: JotTimelineProvider()
        ) { entry in
            JotWidgetView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Countdown")
        .description("Display a countdown or time since timer.")
        .supportedFamilies([
            .systemSmall,
            .accessoryCircular,
            .accessoryRectangular
        ])
    }
}

/// Main Jot widget - displays recent countdowns and quick entry creation
struct JotWidget: Widget {
    let kind: String = "JotWidget"

    var body: some WidgetConfiguration {
        AppIntentConfiguration(
            kind: kind,
            intent: SelectCountdownIntent.self,
            provider: JotTimelineProvider()
        ) { entry in
            JotWidgetView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Jot")
        .description("See recent countdowns and quickly create entries.")
        .supportedFamilies([
            .systemMedium,
            .systemLarge
        ])
    }
}

// MARK: - Preview

#Preview(as: .systemLarge) {
    JotWidget()
} timeline: {
    let sampleCountdowns = [
        WidgetCountdownData(
            entryId: 1,
            title: "My Birthday",
            targetDate: Int(Date().addingTimeInterval(86400 * 30).timeIntervalSince1970 * 1000),
            isCountUp: false,
            isPinned: true,
            updatedAt: Int(Date().timeIntervalSince1970 * 1000)
        ),
        WidgetCountdownData(
            entryId: 2,
            title: "Sober Streak",
            targetDate: Int(Date().addingTimeInterval(-86400 * 45).timeIntervalSince1970 * 1000),
            isCountUp: true,
            isPinned: false,
            updatedAt: Int(Date().timeIntervalSince1970 * 1000)
        ),
        WidgetCountdownData(
            entryId: 3,
            title: "Project Due",
            targetDate: Int(Date().addingTimeInterval(86400 * 7).timeIntervalSince1970 * 1000),
            isCountUp: false,
            isPinned: false,
            updatedAt: Int(Date().timeIntervalSince1970 * 1000)
        )
    ]
    JotEntry(
        date: Date(),
        countdown: sampleCountdowns[0],
        allCountdowns: sampleCountdowns,
        configuration: SelectCountdownIntent()
    )
}
