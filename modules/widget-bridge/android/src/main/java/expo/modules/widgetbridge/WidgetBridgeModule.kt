package expo.modules.widgetbridge

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise

class WidgetBridgeModule : Module() {
  private val widgetPrefsName = "jot_widget_data"
  private val widgetDataKey = "countdownWidgets"

  override fun definition() = ModuleDefinition {
    Name("WidgetBridge")

    // Set the widget data JSON
    AsyncFunction("setWidgetData") { json: String, promise: Promise ->
      val context = appContext.reactContext ?: run {
        promise.resolve(false)
        return@AsyncFunction
      }

      try {
        val prefs = context.getSharedPreferences(widgetPrefsName, Context.MODE_PRIVATE)
        prefs.edit().putString(widgetDataKey, json).apply()
        promise.resolve(true)
      } catch (e: Exception) {
        promise.resolve(false)
      }
    }

    // iOS-only function, no-op on Android
    AsyncFunction("reloadAllTimelines") { promise: Promise ->
      // No-op on Android
      promise.resolve(false)
    }

    // Update all widgets with broadcast
    AsyncFunction("updateAllWidgets") { promise: Promise ->
      val context = appContext.reactContext ?: run {
        promise.resolve(false)
        return@AsyncFunction
      }

      try {
        // Send broadcast to update all countdown widgets
        val intent = Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE)
        intent.setPackage(context.packageName)

        // Get all widget IDs for JotWidgetProvider
        val appWidgetManager = AppWidgetManager.getInstance(context)
        val widgetProviderClass = try {
          Class.forName("${context.packageName}.widget.JotWidgetProvider")
        } catch (e: ClassNotFoundException) {
          // Widget provider not yet created
          promise.resolve(true)
          return@AsyncFunction
        }

        val componentName = ComponentName(context, widgetProviderClass)
        val widgetIds = appWidgetManager.getAppWidgetIds(componentName)

        if (widgetIds.isNotEmpty()) {
          // Call updateAppWidget directly for each widget via reflection
          // This ensures both single and list widgets get updated
          try {
            val updateMethod = widgetProviderClass.getMethod(
              "updateAppWidget",
              Context::class.java,
              AppWidgetManager::class.java,
              Int::class.javaPrimitiveType
            )
            val companion = widgetProviderClass.getField("Companion").get(null)
            val companionClass = companion.javaClass
            val companionUpdateMethod = companionClass.getMethod(
              "updateAppWidget",
              Context::class.java,
              AppWidgetManager::class.java,
              Int::class.javaPrimitiveType
            )

            for (widgetId in widgetIds) {
              companionUpdateMethod.invoke(companion, context, appWidgetManager, widgetId)
            }
          } catch (e: Exception) {
            // Fallback to broadcast if reflection fails
            intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, widgetIds)
            context.sendBroadcast(intent)
          }

          // Also notify list view data changed for scrollable widgets
          val listViewId = context.resources.getIdentifier("widget_list_view", "id", context.packageName)
          if (listViewId != 0) {
            for (widgetId in widgetIds) {
              appWidgetManager.notifyAppWidgetViewDataChanged(widgetId, listViewId)
            }
          }
        }

        promise.resolve(true)
      } catch (e: Exception) {
        promise.resolve(false)
      }
    }

    // iOS-only function, return null on Android
    Function("getAppGroupContainerPath") {
      null
    }
  }
}
