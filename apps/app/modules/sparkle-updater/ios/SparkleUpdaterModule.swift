import ExpoModulesCore

#if os(macOS)
import Sparkle
#endif

public class SparkleUpdaterModule: Module {
  #if os(macOS)
  // Sparkle updater controller - manages the update lifecycle
  private lazy var updaterController: SPUStandardUpdaterController = {
    // Initialize with default UI and no delegate
    // The updater reads SUFeedURL from Info.plist
    return SPUStandardUpdaterController(
      startingUpdater: true,
      updaterDelegate: nil,
      userDriverDelegate: nil
    )
  }()

  private var updater: SPUUpdater {
    return updaterController.updater
  }
  #endif

  public func definition() -> ModuleDefinition {
    Name("SparkleUpdater")

    // Check for updates and show the standard Sparkle UI
    AsyncFunction("checkForUpdates") { () in
      #if os(macOS)
      await MainActor.run {
        self.updaterController.checkForUpdates(nil)
      }
      #else
      throw SparkleError.notAvailable("Sparkle is only available on macOS")
      #endif
    }

    // Check for updates silently in the background
    AsyncFunction("checkForUpdatesInBackground") { () -> Bool in
      #if os(macOS)
      return await withCheckedContinuation { continuation in
        DispatchQueue.main.async {
          // Check if we can check for updates
          guard self.updater.canCheckForUpdates else {
            continuation.resume(returning: false)
            return
          }

          // Start a background check
          self.updater.checkForUpdatesInBackground()

          // For now, return true to indicate check was initiated
          // A more sophisticated implementation would use delegates
          // to track the actual result
          continuation.resume(returning: true)
        }
      }
      #else
      return false
      #endif
    }

    // Get current version info
    Function("getVersionInfo") { () -> [String: String] in
      let bundle = Bundle.main
      let version = bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.0.0"
      let build = bundle.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0"

      return [
        "currentVersion": version,
        "currentBuild": build
      ]
    }

    // Check if automatic checks are enabled
    Function("isAutomaticCheckEnabled") { () -> Bool in
      #if os(macOS)
      return self.updater.automaticallyChecksForUpdates
      #else
      return false
      #endif
    }

    // Enable/disable automatic checks
    Function("setAutomaticCheckEnabled") { (enabled: Bool) in
      #if os(macOS)
      self.updater.automaticallyChecksForUpdates = enabled
      #endif
    }

    // Get last update check date
    Function("getLastUpdateCheckDate") { () -> String? in
      #if os(macOS)
      guard let date = self.updater.lastUpdateCheckDate else {
        return nil
      }
      let formatter = ISO8601DateFormatter()
      return formatter.string(from: date)
      #else
      return nil
      #endif
    }
  }
}

// Custom errors for the module
enum SparkleError: Error, LocalizedError {
  case notAvailable(String)

  var errorDescription: String? {
    switch self {
    case .notAvailable(let message):
      return message
    }
  }
}
