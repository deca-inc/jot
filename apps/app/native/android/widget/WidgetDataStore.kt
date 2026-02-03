package com.dotdotdot.jot.widget

import android.content.Context
import org.json.JSONArray

/**
 * Data class matching the JS WidgetCountdownData
 */
data class WidgetCountdownData(
    val entryId: Int,
    val title: String,
    val targetDate: Long, // Unix timestamp in milliseconds
    val isCountUp: Boolean,
    val isPinned: Boolean,
    val updatedAt: Long
)

/**
 * Reads countdown data from SharedPreferences
 */
object WidgetDataStore {
    private const val PREFS_NAME = "jot_widget_data"
    private const val WIDGET_DATA_KEY = "countdownWidgets"

    /**
     * Get all countdown data from shared storage
     */
    fun getAllCountdowns(context: Context): List<WidgetCountdownData> {
        // Use applicationContext to ensure we read from the same SharedPreferences as the app
        val appContext = context.applicationContext
        val prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val jsonString = prefs.getString(WIDGET_DATA_KEY, null) ?: return emptyList()

        return try {
            val jsonArray = JSONArray(jsonString)
            val countdowns = mutableListOf<WidgetCountdownData>()

            for (i in 0 until jsonArray.length()) {
                val obj = jsonArray.getJSONObject(i)
                countdowns.add(
                    WidgetCountdownData(
                        entryId = obj.getInt("entryId"),
                        title = obj.getString("title"),
                        targetDate = obj.getLong("targetDate"),
                        isCountUp = obj.optBoolean("isCountUp", false),
                        isPinned = obj.optBoolean("isPinned", false),
                        updatedAt = obj.optLong("updatedAt", 0)
                    )
                )
            }

            countdowns
        } catch (e: Exception) {
            emptyList()
        }
    }

    /**
     * Get a specific countdown by entry ID
     */
    fun getCountdown(context: Context, entryId: Int): WidgetCountdownData? {
        return getAllCountdowns(context).find { it.entryId == entryId }
    }

    /**
     * Get widget-specific preferences name
     */
    fun getWidgetPrefsName(appWidgetId: Int): String {
        return "widget_$appWidgetId"
    }

    /**
     * Save selected countdown ID for a widget
     */
    fun saveWidgetCountdownId(context: Context, appWidgetId: Int, entryId: Int) {
        val prefs = context.getSharedPreferences(getWidgetPrefsName(appWidgetId), Context.MODE_PRIVATE)
        prefs.edit().putInt("entryId", entryId).apply()
    }

    /**
     * Get selected countdown ID for a widget
     */
    fun getWidgetCountdownId(context: Context, appWidgetId: Int): Int {
        val prefs = context.getSharedPreferences(getWidgetPrefsName(appWidgetId), Context.MODE_PRIVATE)
        return prefs.getInt("entryId", -1)
    }

    /**
     * Delete widget preferences
     */
    fun deleteWidgetPrefs(context: Context, appWidgetId: Int) {
        val prefs = context.getSharedPreferences(getWidgetPrefsName(appWidgetId), Context.MODE_PRIVATE)
        prefs.edit().clear().apply()
    }
}
