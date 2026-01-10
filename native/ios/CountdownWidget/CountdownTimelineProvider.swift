import WidgetKit
import SwiftUI

/// Timeline entry for countdown widget
struct CountdownEntry: TimelineEntry {
    let date: Date
    let countdown: WidgetCountdownData?
    let configuration: CountdownWidgetConfigurationIntent
}

/// Timeline provider for countdown widget
struct CountdownTimelineProvider: IntentTimelineProvider {
    typealias Entry = CountdownEntry
    typealias Intent = CountdownWidgetConfigurationIntent

    func placeholder(in context: Context) -> CountdownEntry {
        CountdownEntry(
            date: Date(),
            countdown: WidgetCountdownData(
                entryId: 0,
                title: "My Countdown",
                targetDate: Int(Date().addingTimeInterval(86400 * 7).timeIntervalSince1970 * 1000),
                isCountUp: false,
                isPinned: false,
                updatedAt: Int(Date().timeIntervalSince1970 * 1000)
            ),
            configuration: CountdownWidgetConfigurationIntent()
        )
    }

    func getSnapshot(for configuration: CountdownWidgetConfigurationIntent, in context: Context, completion: @escaping (CountdownEntry) -> Void) {
        let countdown = getSelectedCountdown(for: configuration)
        let entry = CountdownEntry(date: Date(), countdown: countdown, configuration: configuration)
        completion(entry)
    }

    func getTimeline(for configuration: CountdownWidgetConfigurationIntent, in context: Context, completion: @escaping (Timeline<CountdownEntry>) -> Void) {
        let countdown = getSelectedCountdown(for: configuration)

        var entries: [CountdownEntry] = []
        let currentDate = Date()

        // Generate timeline entries
        if let countdown = countdown {
            let targetDate = countdown.targetDateAsDate
            let isPast = targetDate < currentDate

            if isPast {
                // Countdown completed - update once per hour
                for hourOffset in 0..<12 {
                    let entryDate = Calendar.current.date(byAdding: .hour, value: hourOffset, to: currentDate)!
                    entries.append(CountdownEntry(date: entryDate, countdown: countdown, configuration: configuration))
                }
            } else {
                // Active countdown - update more frequently as we approach target
                let timeUntilTarget = targetDate.timeIntervalSince(currentDate)

                if timeUntilTarget < 3600 {
                    // Less than 1 hour - update every minute
                    for minuteOffset in 0..<60 {
                        let entryDate = Calendar.current.date(byAdding: .minute, value: minuteOffset, to: currentDate)!
                        if entryDate <= targetDate.addingTimeInterval(60) {
                            entries.append(CountdownEntry(date: entryDate, countdown: countdown, configuration: configuration))
                        }
                    }
                } else if timeUntilTarget < 86400 {
                    // Less than 1 day - update every hour
                    for hourOffset in 0..<24 {
                        let entryDate = Calendar.current.date(byAdding: .hour, value: hourOffset, to: currentDate)!
                        entries.append(CountdownEntry(date: entryDate, countdown: countdown, configuration: configuration))
                    }
                } else {
                    // More than 1 day - update every 6 hours
                    for sixHourOffset in 0..<8 {
                        let entryDate = Calendar.current.date(byAdding: .hour, value: sixHourOffset * 6, to: currentDate)!
                        entries.append(CountdownEntry(date: entryDate, countdown: countdown, configuration: configuration))
                    }
                }
            }
        } else {
            // No countdown selected - single entry
            entries.append(CountdownEntry(date: currentDate, countdown: nil, configuration: configuration))
        }

        // Ensure we have at least one entry
        if entries.isEmpty {
            entries.append(CountdownEntry(date: currentDate, countdown: countdown, configuration: configuration))
        }

        let timeline = Timeline(entries: entries, policy: .atEnd)
        completion(timeline)
    }

    private func getSelectedCountdown(for configuration: CountdownWidgetConfigurationIntent) -> WidgetCountdownData? {
        guard let selectedCountdown = configuration.countdown,
              let entryIdString = selectedCountdown.identifier,
              let entryId = Int(entryIdString) else {
            // No countdown selected - return the first available
            return WidgetDataStore.shared.getAllCountdowns().first
        }

        return WidgetDataStore.shared.getCountdown(entryId: entryId)
    }
}
