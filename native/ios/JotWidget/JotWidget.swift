import WidgetKit
import SwiftUI

/// Small countdown widget - displays a single countdown timer
struct CountdownWidget: Widget {
    let kind: String = "CountdownWidget"

    var body: some WidgetConfiguration {
        IntentConfiguration(
            kind: kind,
            intent: JotWidgetConfigurationIntent.self,
            provider: JotTimelineProvider()
        ) { entry in
            JotWidgetView(entry: entry)
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
        IntentConfiguration(
            kind: kind,
            intent: JotWidgetConfigurationIntent.self,
            provider: JotTimelineProvider()
        ) { entry in
            JotWidgetView(entry: entry)
        }
        .configurationDisplayName("Jot")
        .description("See recent countdowns and quickly create entries.")
        .supportedFamilies([
            .systemMedium
        ])
    }
}

/// Widget preview provider
struct JotWidget_Previews: PreviewProvider {
    static var previews: some View {
        let sampleCountdown = WidgetCountdownData(
            entryId: 1,
            title: "My Birthday",
            targetDate: Int(Date().addingTimeInterval(86400 * 30).timeIntervalSince1970 * 1000),
            isCountUp: false,
            isPinned: true,
            updatedAt: Int(Date().timeIntervalSince1970 * 1000)
        )

        JotWidgetView(entry: JotEntry(
            date: Date(),
            countdown: sampleCountdown,
            configuration: JotWidgetConfigurationIntent()
        ))
        .previewContext(WidgetPreviewContext(family: .systemSmall))

        JotWidgetView(entry: JotEntry(
            date: Date(),
            countdown: sampleCountdown,
            configuration: JotWidgetConfigurationIntent()
        ))
        .previewContext(WidgetPreviewContext(family: .systemMedium))
    }
}
