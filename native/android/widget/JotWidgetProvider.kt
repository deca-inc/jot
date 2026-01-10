package com.dotdotdot.jot.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * App Widget Provider for Jot widgets - responsive sizing
 * Shows small layout (single countdown) when narrow, medium layout (list) when wide
 */
class JotWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (appWidgetId in appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId)
        }
    }

    override fun onAppWidgetOptionsChanged(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetId: Int,
        newOptions: Bundle?
    ) {
        // Widget was resized - update with appropriate layout
        updateAppWidget(context, appWidgetManager, appWidgetId)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)

        when (intent.action) {
            ACTION_PREV, ACTION_NEXT -> {
                val appWidgetId = intent.getIntExtra(
                    AppWidgetManager.EXTRA_APPWIDGET_ID,
                    AppWidgetManager.INVALID_APPWIDGET_ID
                )
                if (appWidgetId != AppWidgetManager.INVALID_APPWIDGET_ID) {
                    val isPrev = intent.action == ACTION_PREV
                    cycleCountdown(context, appWidgetId, isPrev)
                }
            }
            ACTION_LIST_CLICK -> {
                val entryId = intent.getIntExtra("entry_id", -1)
                if (entryId >= 0) {
                    val viewIntent = Intent(Intent.ACTION_VIEW, Uri.parse("jot://countdown/$entryId"))
                    viewIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    context.startActivity(viewIntent)
                }
            }
        }
    }

    override fun onDeleted(context: Context, appWidgetIds: IntArray) {
        for (appWidgetId in appWidgetIds) {
            WidgetDataStore.deleteWidgetPrefs(context, appWidgetId)
        }
    }

    companion object {
        private const val ACTION_PREV = "com.dotdotdot.jot.widget.ACTION_PREV"
        private const val ACTION_NEXT = "com.dotdotdot.jot.widget.ACTION_NEXT"
        const val ACTION_LIST_CLICK = "com.dotdotdot.jot.widget.ACTION_LIST_CLICK"
        private val dateFormat = SimpleDateFormat("MMM d, yyyy", Locale.getDefault())

        private fun cycleCountdown(context: Context, appWidgetId: Int, isPrev: Boolean) {
            val countdowns = WidgetDataStore.getAllCountdowns(context)
            if (countdowns.isEmpty()) return

            val currentId = WidgetDataStore.getWidgetCountdownId(context, appWidgetId)
            val currentIndex = countdowns.indexOfFirst { it.entryId == currentId }

            val newIndex = when {
                currentIndex < 0 -> 0
                isPrev -> if (currentIndex > 0) currentIndex - 1 else countdowns.size - 1
                else -> if (currentIndex < countdowns.size - 1) currentIndex + 1 else 0
            }

            WidgetDataStore.saveWidgetCountdownId(context, appWidgetId, countdowns[newIndex].entryId)

            val appWidgetManager = AppWidgetManager.getInstance(context)
            updateAppWidget(context, appWidgetManager, appWidgetId)
        }

        fun updateAppWidget(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int
        ) {
            // Check widget size to determine layout
            val options = appWidgetManager.getAppWidgetOptions(appWidgetId)
            val minWidth = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0)

            // Use small layout for narrow widgets (< 200dp), medium for wider
            if (minWidth < 200) {
                updateSmallLayout(context, appWidgetManager, appWidgetId)
            } else {
                updateMediumLayout(context, appWidgetManager, appWidgetId)
            }
        }

        private fun updateSmallLayout(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int
        ) {
            val layoutId = context.resources.getIdentifier("jot_widget", "layout", context.packageName)
            val views = RemoteViews(context.packageName, layoutId)

            val countdowns = WidgetDataStore.getAllCountdowns(context)
            val entryId = WidgetDataStore.getWidgetCountdownId(context, appWidgetId)
            val countdown = if (entryId >= 0) {
                countdowns.find { it.entryId == entryId } ?: countdowns.firstOrNull()
            } else {
                countdowns.firstOrNull()
            }

            // Show/hide navigation arrows based on countdown count
            val showNav = countdowns.size > 1
            views.setViewVisibility(getId(context, "btn_prev"), if (showNav) View.VISIBLE else View.INVISIBLE)
            views.setViewVisibility(getId(context, "btn_next"), if (showNav) View.VISIBLE else View.INVISIBLE)

            if (countdown != null) {
                // Save current countdown ID if not already saved
                if (entryId < 0) {
                    WidgetDataStore.saveWidgetCountdownId(context, appWidgetId, countdown.entryId)
                }

                val formattedTime = CountdownFormatter.format(countdown.targetDate, countdown.isCountUp)
                val status = CountdownFormatter.statusLabel(countdown.targetDate, countdown.isCountUp)
                val targetDateStr = dateFormat.format(Date(countdown.targetDate))

                views.setTextViewText(getId(context, "widget_status"), status.uppercase())
                views.setTextViewText(getId(context, "widget_title"), countdown.title)
                views.setTextViewText(getId(context, "widget_time"), formattedTime)
                views.setTextViewText(getId(context, "widget_target_date"), targetDateStr)

                val statusColor = if (countdown.isCountUp) 0xFF64B5F6.toInt() else 0xFFFFB74D.toInt()
                views.setTextColor(getId(context, "widget_status"), statusColor)

                // Click on main content opens the countdown
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse("jot://countdown/${countdown.entryId}"))
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                val pi = PendingIntent.getActivity(context, appWidgetId, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                views.setOnClickPendingIntent(getId(context, "widget_container"), pi)
            } else {
                views.setTextViewText(getId(context, "widget_status"), "NO DATA")
                views.setTextColor(getId(context, "widget_status"), 0xFF888888.toInt())
                views.setTextViewText(getId(context, "widget_title"), "Add a countdown")
                views.setTextViewText(getId(context, "widget_time"), "—")
                views.setTextViewText(getId(context, "widget_target_date"), "Tap to open app")

                val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
                if (launchIntent != null) {
                    val pi = PendingIntent.getActivity(context, appWidgetId, launchIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                    views.setOnClickPendingIntent(getId(context, "widget_container"), pi)
                }
            }

            // Set up navigation button clicks
            if (showNav) {
                val prevIntent = Intent(context, JotWidgetProvider::class.java).apply {
                    action = ACTION_PREV
                    putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
                }
                val prevPi = PendingIntent.getBroadcast(context, appWidgetId * 100, prevIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                views.setOnClickPendingIntent(getId(context, "btn_prev"), prevPi)

                val nextIntent = Intent(context, JotWidgetProvider::class.java).apply {
                    action = ACTION_NEXT
                    putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
                }
                val nextPi = PendingIntent.getBroadcast(context, appWidgetId * 100 + 1, nextIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                views.setOnClickPendingIntent(getId(context, "btn_next"), nextPi)
            }

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }

        private fun updateMediumLayout(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int
        ) {
            val layoutId = context.resources.getIdentifier("jot_widget_medium", "layout", context.packageName)
            val views = RemoteViews(context.packageName, layoutId)
            val countdowns = WidgetDataStore.getAllCountdowns(context)

            if (countdowns.isEmpty()) {
                views.setViewVisibility(getId(context, "countdown_list"), View.GONE)
                views.setViewVisibility(getId(context, "empty_view"), View.VISIBLE)
            } else {
                views.setViewVisibility(getId(context, "countdown_list"), View.VISIBLE)
                views.setViewVisibility(getId(context, "empty_view"), View.GONE)

                // Set up the ListView with RemoteViewsService
                val serviceIntent = Intent(context, JotWidgetService::class.java).apply {
                    putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
                    data = Uri.parse(toUri(Intent.URI_INTENT_SCHEME))
                }
                views.setRemoteAdapter(getId(context, "countdown_list"), serviceIntent)
                views.setEmptyView(getId(context, "countdown_list"), getId(context, "empty_view"))

                // Set up click handling for list items
                val clickIntent = Intent(context, JotWidgetProvider::class.java).apply {
                    action = ACTION_LIST_CLICK
                    putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
                }
                val clickPi = PendingIntent.getBroadcast(
                    context,
                    appWidgetId,
                    clickIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
                )
                views.setPendingIntentTemplate(getId(context, "countdown_list"), clickPi)
            }

            // Quick create buttons
            setupButton(context, views, "btn_journal", "jot://create/journal", 1000 + appWidgetId)
            setupButton(context, views, "btn_chat", "jot://create/chat", 2000 + appWidgetId)
            setupButton(context, views, "btn_countdown", "jot://create/countdown", 3000 + appWidgetId)

            appWidgetManager.updateAppWidget(appWidgetId, views)

            // Notify the ListView to refresh its data
            appWidgetManager.notifyAppWidgetViewDataChanged(appWidgetId, getId(context, "countdown_list"))
        }

        private fun setupButton(context: Context, views: RemoteViews, buttonId: String, uri: String, requestCode: Int) {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri))
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            val pi = PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            views.setOnClickPendingIntent(getId(context, buttonId), pi)
        }

        private fun getId(context: Context, name: String): Int {
            return context.resources.getIdentifier(name, "id", context.packageName)
        }
    }
}
