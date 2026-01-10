import WidgetKit
import SwiftUI

/// Main countdown widget definition
struct CountdownWidget: Widget {
    let kind: String = "CountdownWidget"

    var body: some WidgetConfiguration {
        IntentConfiguration(
            kind: kind,
            intent: CountdownWidgetConfigurationIntent.self,
            provider: CountdownTimelineProvider()
        ) { entry in
            CountdownWidgetView(entry: entry)
        }
        .configurationDisplayName("Countdown")
        .description("Display a countdown or time since timer.")
        .supportedFamilies([
            .systemSmall,
            .systemMedium,
            .accessoryCircular,
            .accessoryRectangular
        ])
    }
}

/// Widget preview provider
struct CountdownWidget_Previews: PreviewProvider {
    static var previews: some View {
        let sampleCountdown = WidgetCountdownData(
            entryId: 1,
            title: "My Birthday",
            targetDate: Int(Date().addingTimeInterval(86400 * 30).timeIntervalSince1970 * 1000),
            isCountUp: false,
            isPinned: true,
            updatedAt: Int(Date().timeIntervalSince1970 * 1000)
        )

        CountdownWidgetView(entry: CountdownEntry(
            date: Date(),
            countdown: sampleCountdown,
            configuration: CountdownWidgetConfigurationIntent()
        ))
        .previewContext(WidgetPreviewContext(family: .systemSmall))

        CountdownWidgetView(entry: CountdownEntry(
            date: Date(),
            countdown: sampleCountdown,
            configuration: CountdownWidgetConfigurationIntent()
        ))
        .previewContext(WidgetPreviewContext(family: .systemMedium))
    }
}
