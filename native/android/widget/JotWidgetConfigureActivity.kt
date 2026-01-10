package com.dotdotdot.jot.widget

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView

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

        // Set up the RecyclerView
        val recyclerViewId = resources.getIdentifier(
            "countdown_list",
            "id",
            packageName
        )
        val recyclerView = findViewById<RecyclerView>(recyclerViewId)
        recyclerView.layoutManager = LinearLayoutManager(this)

        // Get available countdowns
        val countdowns = WidgetDataStore.getAllCountdowns(this)

        if (countdowns.isEmpty()) {
            // No countdowns available - show message and close
            val emptyId = resources.getIdentifier("empty_message", "id", packageName)
            findViewById<View>(emptyId)?.visibility = View.VISIBLE
            recyclerView.visibility = View.GONE
            return
        }

        // Set up adapter
        recyclerView.adapter = CountdownAdapter(countdowns) { selectedCountdown ->
            onCountdownSelected(selectedCountdown)
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
     * RecyclerView adapter for countdown list
     */
    private inner class CountdownAdapter(
        private val countdowns: List<WidgetCountdownData>,
        private val onItemClick: (WidgetCountdownData) -> Unit
    ) : RecyclerView.Adapter<CountdownAdapter.ViewHolder>() {

        inner class ViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
            val titleText: TextView
            val timeText: TextView

            init {
                val titleId = resources.getIdentifier("item_title", "id", packageName)
                val timeId = resources.getIdentifier("item_time", "id", packageName)
                titleText = itemView.findViewById(titleId)
                timeText = itemView.findViewById(timeId)
            }
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
            val layoutId = resources.getIdentifier(
                "jot_widget_configure_item",
                "layout",
                packageName
            )
            val view = LayoutInflater.from(parent.context).inflate(layoutId, parent, false)
            return ViewHolder(view)
        }

        override fun onBindViewHolder(holder: ViewHolder, position: Int) {
            val countdown = countdowns[position]

            holder.titleText.text = countdown.title
            holder.timeText.text = CountdownFormatter.format(
                countdown.targetDate,
                countdown.isCountUp
            )

            holder.itemView.setOnClickListener {
                onItemClick(countdown)
            }
        }

        override fun getItemCount() = countdowns.size
    }
}
