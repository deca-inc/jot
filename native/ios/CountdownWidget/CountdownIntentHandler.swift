import Intents

/// Intent handler for providing dynamic countdown options
class CountdownIntentHandler: NSObject, CountdownWidgetConfigurationIntentHandling {

    func provideCountdownOptionsCollection(
        for intent: CountdownWidgetConfigurationIntent,
        with completion: @escaping (INObjectCollection<CountdownItem>?, Error?) -> Void
    ) {
        let countdowns = WidgetDataStore.shared.getAllCountdowns()

        let items = countdowns.map { countdown in
            CountdownItem(
                identifier: String(countdown.entryId),
                display: countdown.title
            )
        }

        let collection = INObjectCollection(items: items)
        completion(collection, nil)
    }

    func defaultCountdown(for intent: CountdownWidgetConfigurationIntent) -> CountdownItem? {
        guard let firstCountdown = WidgetDataStore.shared.getAllCountdowns().first else {
            return nil
        }

        return CountdownItem(
            identifier: String(firstCountdown.entryId),
            display: firstCountdown.title
        )
    }
}
