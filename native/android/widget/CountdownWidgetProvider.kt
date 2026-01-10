package com.dotdotdot.jot.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context

/**
 * App Widget Provider for small Countdown widgets
 * Reuses the same update logic as JotWidgetProvider
 */
class CountdownWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        // Update each widget instance using shared logic
        for (appWidgetId in appWidgetIds) {
            JotWidgetProvider.updateAppWidget(context, appWidgetManager, appWidgetId)
        }
    }

    override fun onDeleted(context: Context, appWidgetIds: IntArray) {
        // Clean up widget preferences when widgets are deleted
        for (appWidgetId in appWidgetIds) {
            WidgetDataStore.deleteWidgetPrefs(context, appWidgetId)
        }
    }
}
