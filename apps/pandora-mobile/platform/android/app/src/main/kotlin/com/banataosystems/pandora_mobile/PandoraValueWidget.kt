package com.banataosystems.pandora_mobile

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.text.format.DateUtils
import android.view.View
import android.widget.RemoteViews

class PandoraValueWidget : AppWidgetProvider() {
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
    ) {
        appWidgetIds.forEach { appWidgetId ->
            appWidgetManager.updateAppWidget(appWidgetId, render(context))
        }
    }

    companion object {
        fun updateAll(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val component = ComponentName(context, PandoraValueWidget::class.java)
            manager.getAppWidgetIds(component).forEach { appWidgetId ->
                manager.updateAppWidget(appWidgetId, render(context))
            }
        }

        private fun render(context: Context): RemoteViews {
            val snapshot = PandoraValueWidgetStore.read(context)
            val now = System.currentTimeMillis()
            val verified = snapshot.isVerifiedNow(now)
            val views = RemoteViews(context.packageName, R.layout.pandora_value_widget)

            views.setTextViewText(
                R.id.pandora_value_score,
                if (verified) snapshot.score.toString() else "—",
            )
            views.setTextViewText(
                R.id.pandora_value_suffix,
                if (verified) "/100" else "",
            )
            views.setTextViewText(
                R.id.pandora_value_status,
                if (verified) "Verified value" else "Not measured yet",
            )
            views.setTextViewText(
                R.id.pandora_value_detail,
                if (verified) {
                    "Evidence-backed customer value"
                } else {
                    "Waiting for fresh verified customer-value evidence"
                },
            )

            val freshness = when {
                snapshot.lastVerifiedAtEpochMs == null -> "No verified value reading"
                snapshot.staleAfterEpochMs != null && snapshot.staleAfterEpochMs <= now ->
                    "Value evidence is stale · open Pandora"
                else -> {
                    val relative = DateUtils.getRelativeTimeSpanString(
                        snapshot.lastVerifiedAtEpochMs,
                        now,
                        DateUtils.MINUTE_IN_MILLIS,
                        DateUtils.FORMAT_ABBREV_RELATIVE,
                    )
                    "Verified $relative"
                }
            }
            views.setTextViewText(R.id.pandora_value_freshness, freshness)

            views.setViewVisibility(
                R.id.pandora_value_progress,
                if (verified) View.VISIBLE else View.GONE,
            )
            if (verified) {
                views.setProgressBar(
                    R.id.pandora_value_progress,
                    100,
                    snapshot.score ?: 0,
                    false,
                )
            }

            val openPandora = PendingIntent.getActivity(
                context,
                0,
                Intent(context, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                },
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            views.setOnClickPendingIntent(R.id.pandora_value_widget_root, openPandora)
            return views
        }
    }
}
