package com.dotdotdot.jot.widget

import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import android.widget.RemoteViewsService

/**
 * Service that provides the factory for populating the widget ListView
 */
class JotWidgetService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory {
        return JotWidgetFactory(applicationContext)
    }
}

/**
 * Factory that creates the views for each item in the widget ListView
 */
class JotWidgetFactory(private val context: Context) : RemoteViewsService.RemoteViewsFactory {

    private var countdowns: List<WidgetCountdownData> = emptyList()

    override fun onCreate() {
        // Initial data load
        countdowns = WidgetDataStore.getAllCountdowns(context)
    }

    override fun onDataSetChanged() {
        // Refresh data
        countdowns = WidgetDataStore.getAllCountdowns(context)
    }

    override fun onDestroy() {
        countdowns = emptyList()
    }

    override fun getCount(): Int = countdowns.size

    override fun getViewAt(position: Int): RemoteViews {
        val layoutId = context.resources.getIdentifier(
            "jot_widget_list_item",
            "layout",
            context.packageName
        )
        val views = RemoteViews(context.packageName, layoutId)

        if (position < countdowns.size) {
            val countdown = countdowns[position]

            // Set icon based on type
            val iconResName = if (countdown.isCountUp) "ic_widget_arrow_up" else "ic_widget_arrow_down"
            val iconResId = context.resources.getIdentifier(iconResName, "drawable", context.packageName)
            views.setImageViewResource(
                context.resources.getIdentifier("item_icon", "id", context.packageName),
                iconResId
            )

            // Set title
            views.setTextViewText(
                context.resources.getIdentifier("item_title", "id", context.packageName),
                countdown.title
            )

            // Set subtitle
            views.setTextViewText(
                context.resources.getIdentifier("item_subtitle", "id", context.packageName),
                CountdownFormatter.statusLabel(countdown.targetDate, countdown.isCountUp)
            )

            // Set time
            views.setTextViewText(
                context.resources.getIdentifier("item_time", "id", context.packageName),
                CountdownFormatter.format(countdown.targetDate, countdown.isCountUp)
            )

            // Set fill-in intent for clicks
            val fillInIntent = Intent().apply {
                putExtra("entry_id", countdown.entryId)
            }
            views.setOnClickFillInIntent(
                context.resources.getIdentifier("item_container", "id", context.packageName),
                fillInIntent
            )
        }

        return views
    }

    override fun getLoadingView(): RemoteViews? = null

    override fun getViewTypeCount(): Int = 1

    override fun getItemId(position: Int): Long = position.toLong()

    override fun hasStableIds(): Boolean = true
}
