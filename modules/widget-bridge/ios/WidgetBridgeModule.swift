import ExpoModulesCore
#if canImport(WidgetKit)
import WidgetKit
#endif

public class WidgetBridgeModule: Module {
  private let appGroupId = "group.com.betazeta.jot.widgets"
  private let widgetDataKey = "countdownWidgets"

  public func definition() -> ModuleDefinition {
    Name("WidgetBridge")

    AsyncFunction("setWidgetData") { (json: String) -> Bool in
      guard let sharedDefaults = UserDefaults(suiteName: self.appGroupId) else {
        return false
      }
      sharedDefaults.set(json, forKey: self.widgetDataKey)
      sharedDefaults.synchronize()
      return true
    }

    AsyncFunction("reloadAllTimelines") { () -> Bool in
      #if canImport(WidgetKit)
      if #available(iOS 14.0, *) {
        WidgetCenter.shared.reloadAllTimelines()
        return true
      }
      #endif
      return false
    }

    AsyncFunction("updateAllWidgets") { () -> Bool in
      return false
    }

    Function("getAppGroupContainerPath") { () -> String? in
      return FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: self.appGroupId)?.path
    }
  }
}
