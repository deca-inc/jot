package com.dotdotdot.jot.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * App Widget Provider for Jot widgets
 */
class JotWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        // Update each widget instance
        for (appWidgetId in appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId)
        }
    }

    override fun onDeleted(context: Context, appWidgetIds: IntArray) {
        // Clean up widget preferences when widgets are deleted
        for (appWidgetId in appWidgetIds) {
            WidgetDataStore.deleteWidgetPrefs(context, appWidgetId)
        }
    }

    companion object {
        /**
         * Update a single widget
         */
        fun updateAppWidget(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int
        ) {
            // Get the selected countdown for this widget
            val entryId = WidgetDataStore.getWidgetCountdownId(context, appWidgetId)
            val countdown = if (entryId >= 0) {
                WidgetDataStore.getCountdown(context, entryId)
            } else {
                // No countdown selected - use first available
                WidgetDataStore.getAllCountdowns(context).firstOrNull()
            }

            // Get the layout resource ID
            val layoutId = getLayoutId(context)

            val views = RemoteViews(context.packageName, layoutId)

            if (countdown != null) {
                // Format the countdown time
                val formattedTime = CountdownFormatter.format(
                    countdown.targetDate,
                    countdown.isCountUp
                )
                val status = CountdownFormatter.statusLabel(
                    countdown.targetDate,
                    countdown.isCountUp
                )

                // Format target date
                val dateFormat = SimpleDateFormat("MMM d, yyyy", Locale.getDefault())
                val targetDateStr = dateFormat.format(Date(countdown.targetDate))

                // Set widget content
                views.setTextViewText(getResourceId(context, "widget_title"), countdown.title)
                views.setTextViewText(getResourceId(context, "widget_time"), formattedTime)
                views.setTextViewText(getResourceId(context, "widget_status"), status)
                views.setTextViewText(getResourceId(context, "widget_target_date"), targetDateStr)

                // Set click intent to open the app at this countdown
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse("jot://countdown/${countdown.entryId}"))
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                val pendingIntent = PendingIntent.getActivity(
                    context,
                    appWidgetId,
                    intent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                views.setOnClickPendingIntent(getResourceId(context, "widget_container"), pendingIntent)
            } else {
                // No countdown available
                views.setTextViewText(getResourceId(context, "widget_title"), "No countdown")
                views.setTextViewText(getResourceId(context, "widget_time"), "--")
                views.setTextViewText(getResourceId(context, "widget_status"), "Tap to configure")
                views.setTextViewText(getResourceId(context, "widget_target_date"), "")

                // Open configure activity on click
                val configIntent = Intent(context, JotWidgetConfigureActivity::class.java)
                configIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
                val configPendingIntent = PendingIntent.getActivity(
                    context,
                    appWidgetId,
                    configIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                views.setOnClickPendingIntent(getResourceId(context, "widget_container"), configPendingIntent)
            }

            // Update the widget
            appWidgetManager.updateAppWidget(appWidgetId, views)
        }

        private fun getLayoutId(context: Context): Int {
            return context.resources.getIdentifier(
                "jot_widget",
                "layout",
                context.packageName
            )
        }

        private fun getResourceId(context: Context, name: String): Int {
            return context.resources.getIdentifier(
                name,
                "id",
                context.packageName
            )
        }
    }
}
