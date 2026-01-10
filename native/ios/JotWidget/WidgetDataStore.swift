import Foundation

/// Data structure matching the JS WidgetCountdownData
struct WidgetCountdownData: Codable, Identifiable {
    let entryId: Int
    let title: String
    let targetDate: Int // Unix timestamp in milliseconds
    let isCountUp: Bool
    let isPinned: Bool
    let updatedAt: Int

    var id: Int { entryId }

    /// Target date as Date object
    var targetDateAsDate: Date {
        Date(timeIntervalSince1970: Double(targetDate) / 1000.0)
    }
}

/// Reads countdown data from App Groups shared storage
class WidgetDataStore {
    static let shared = WidgetDataStore()

    private let appGroupId = "group.com.betazeta.jot.widgets"
    private let widgetDataKey = "countdownWidgets"

    private init() {}

    /// Get all countdown data from shared storage
    func getAllCountdowns() -> [WidgetCountdownData] {
        guard let sharedDefaults = UserDefaults(suiteName: appGroupId),
              let jsonString = sharedDefaults.string(forKey: widgetDataKey),
              let jsonData = jsonString.data(using: .utf8) else {
            return []
        }

        do {
            let countdowns = try JSONDecoder().decode([WidgetCountdownData].self, from: jsonData)
            return countdowns
        } catch {
            print("[WidgetDataStore] Error decoding countdowns: \(error)")
            return []
        }
    }

    /// Get a specific countdown by entry ID
    func getCountdown(entryId: Int) -> WidgetCountdownData? {
        return getAllCountdowns().first { $0.entryId == entryId }
    }
}
