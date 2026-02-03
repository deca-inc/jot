package com.dotdotdot.jot.widget

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.widget.AdapterView
import android.widget.BaseAdapter
import android.widget.ListView
import android.widget.TextView

/**
 * Activity for configuring which countdown to display in a Jot widget
 */
class JotWidgetConfigureActivity : Activity() {

    private var appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Set result to CANCELED in case the user backs out
        setResult(RESULT_CANCELED)

        // Get the widget ID from the intent
        appWidgetId = intent?.extras?.getInt(
            AppWidgetManager.EXTRA_APPWIDGET_ID,
            AppWidgetManager.INVALID_APPWIDGET_ID
        ) ?: AppWidgetManager.INVALID_APPWIDGET_ID

        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish()
            return
        }

        // Get layout resource ID
        val layoutId = resources.getIdentifier(
            "jot_widget_configure",
            "layout",
            packageName
        )
        setContentView(layoutId)

        // Get available countdowns
        val countdowns = WidgetDataStore.getAllCountdowns(this)

        if (countdowns.isEmpty()) {
            // No countdowns available - show message and close
            val emptyId = resources.getIdentifier("empty_message", "id", packageName)
            findViewById<View>(emptyId)?.visibility = View.VISIBLE
            return
        }

        // Set up the ListView
        val listViewId = resources.getIdentifier(
            "countdown_list",
            "id",
            packageName
        )
        val listView = findViewById<ListView>(listViewId)
        listView.adapter = CountdownAdapter(countdowns)
        listView.onItemClickListener = AdapterView.OnItemClickListener { _, _, position, _ ->
            onCountdownSelected(countdowns[position])
        }
    }

    private fun onCountdownSelected(countdown: WidgetCountdownData) {
        // Save the selection
        WidgetDataStore.saveWidgetCountdownId(this, appWidgetId, countdown.entryId)

        // Update the widget
        val appWidgetManager = AppWidgetManager.getInstance(this)
        JotWidgetProvider.updateAppWidget(this, appWidgetManager, appWidgetId)

        // Return success
        val resultValue = Intent()
        resultValue.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
        setResult(RESULT_OK, resultValue)
        finish()
    }

    /**
     * Simple adapter for countdown list
     */
    private inner class CountdownAdapter(
        private val countdowns: List<WidgetCountdownData>
    ) : BaseAdapter() {

        override fun getCount() = countdowns.size
        override fun getItem(position: Int) = countdowns[position]
        override fun getItemId(position: Int) = position.toLong()

        override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
            val view = convertView ?: layoutInflater.inflate(
                resources.getIdentifier("jot_widget_configure_item", "layout", packageName),
                parent,
                false
            )

            val countdown = countdowns[position]
            val titleId = resources.getIdentifier("item_title", "id", packageName)
            val timeId = resources.getIdentifier("item_time", "id", packageName)

            view.findViewById<TextView>(titleId).text = countdown.title
            view.findViewById<TextView>(timeId).text = CountdownFormatter.format(
                countdown.targetDate,
                countdown.isCountUp
            )

            return view
        }
    }
}
