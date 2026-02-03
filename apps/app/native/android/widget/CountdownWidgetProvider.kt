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
 * App Widget Provider for small Countdown widgets
 */
class CountdownWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (appWidgetId in appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId)
        }
    }

    override fun onDeleted(context: Context, appWidgetIds: IntArray) {
        for (appWidgetId in appWidgetIds) {
            WidgetDataStore.deleteWidgetPrefs(context, appWidgetId)
        }
    }

    companion object {
        fun updateAppWidget(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int
        ) {
            val entryId = WidgetDataStore.getWidgetCountdownId(context, appWidgetId)
            val countdown = if (entryId >= 0) {
                WidgetDataStore.getCountdown(context, entryId)
            } else {
                WidgetDataStore.getAllCountdowns(context).firstOrNull()
            }

            val layoutId = context.resources.getIdentifier("jot_widget", "layout", context.packageName)
            val views = RemoteViews(context.packageName, layoutId)

            if (countdown != null) {
                val formattedTime = CountdownFormatter.format(countdown.targetDate, countdown.isCountUp)
                val status = CountdownFormatter.statusLabel(countdown.targetDate, countdown.isCountUp)
                val dateFormat = SimpleDateFormat("MMM d, yyyy", Locale.getDefault())
                val targetDateStr = dateFormat.format(Date(countdown.targetDate))

                views.setTextViewText(getId(context, "widget_status"), status.uppercase())
                views.setTextViewText(getId(context, "widget_title"), countdown.title)
                views.setTextViewText(getId(context, "widget_time"), formattedTime)
                views.setTextViewText(getId(context, "widget_target_date"), targetDateStr)

                // Color the status based on type
                val statusColor = if (countdown.isCountUp) 0xFF64B5F6.toInt() else 0xFFFFB74D.toInt()
                views.setTextColor(getId(context, "widget_status"), statusColor)

                val intent = Intent(Intent.ACTION_VIEW, Uri.parse("jot://countdown/${countdown.entryId}"))
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                val pendingIntent = PendingIntent.getActivity(
                    context, appWidgetId, intent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                views.setOnClickPendingIntent(getId(context, "widget_container"), pendingIntent)
            } else {
                views.setTextViewText(getId(context, "widget_status"), "NO DATA")
                views.setTextColor(getId(context, "widget_status"), 0xFF888888.toInt())
                views.setTextViewText(getId(context, "widget_title"), "Add a countdown")
                views.setTextViewText(getId(context, "widget_time"), "—")
                views.setTextViewText(getId(context, "widget_target_date"), "Tap to open app")

                val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
                if (launchIntent != null) {
                    val pendingIntent = PendingIntent.getActivity(
                        context, appWidgetId, launchIntent,
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                    )
                    views.setOnClickPendingIntent(getId(context, "widget_container"), pendingIntent)
                }
            }

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }

        private fun getId(context: Context, name: String): Int {
            return context.resources.getIdentifier(name, "id", context.packageName)
        }
    }
}
