import Intents

/// Intent handler for providing dynamic countdown options
class JotIntentHandler: NSObject, JotWidgetConfigurationIntentHandling {

    func provideCountdownOptionsCollection(
        for intent: JotWidgetConfigurationIntent,
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

    func defaultCountdown(for intent: JotWidgetConfigurationIntent) -> CountdownItem? {
        guard let firstCountdown = WidgetDataStore.shared.getAllCountdowns().first else {
            return nil
        }

        return CountdownItem(
            identifier: String(firstCountdown.entryId),
            display: firstCountdown.title
        )
    }
}
