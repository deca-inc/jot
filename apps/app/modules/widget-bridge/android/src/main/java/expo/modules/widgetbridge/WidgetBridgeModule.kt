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
      val reactContext = appContext.reactContext ?: run {
        android.util.Log.e("WidgetBridge", "setWidgetData: No react context available")
        promise.resolve(false)
        return@AsyncFunction
      }

      try {
        // Use applicationContext to ensure SharedPreferences are accessible by widgets
        val context = reactContext.applicationContext
        val prefs = context.getSharedPreferences(widgetPrefsName, Context.MODE_PRIVATE)
        prefs.edit().putString(widgetDataKey, json).commit() // Use commit() for immediate write
        android.util.Log.d("WidgetBridge", "setWidgetData: Wrote ${json.length} chars to SharedPreferences (app context: ${context.packageName})")
        promise.resolve(true)
      } catch (e: Exception) {
        android.util.Log.e("WidgetBridge", "setWidgetData: Error writing data", e)
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
        val appWidgetManager = AppWidgetManager.getInstance(context)

        // Update both widget providers
        val providerNames = listOf("JotWidgetProvider", "CountdownWidgetProvider")

        for (providerName in providerNames) {
          val widgetProviderClass = try {
            Class.forName("${context.packageName}.widget.$providerName")
          } catch (e: ClassNotFoundException) {
            // Widget provider not yet created, skip
            continue
          }

          val componentName = ComponentName(context, widgetProviderClass)
          val widgetIds = appWidgetManager.getAppWidgetIds(componentName)

          if (widgetIds.isNotEmpty()) {
            // Call updateAppWidget directly via JotWidgetProvider.Companion
            // Both providers use the same update logic
            try {
              val jotProviderClass = Class.forName("${context.packageName}.widget.JotWidgetProvider")
              val companion = jotProviderClass.getField("Companion").get(null)
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
              val intent = Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE)
              intent.setPackage(context.packageName)
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
