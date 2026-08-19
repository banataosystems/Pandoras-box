package com.banataosystems.pandora_mobile

import android.content.Context

internal data class PandoraValueWidgetSnapshot(
    val verified: Boolean,
    val score: Int?,
    val freshnessState: String,
    val lastVerifiedAtEpochMs: Long?,
    val staleAfterEpochMs: Long?,
) {
    fun isVerifiedNow(nowEpochMs: Long = System.currentTimeMillis()): Boolean =
        verified &&
            score != null &&
            score in 0..100 &&
            freshnessState == "fresh" &&
            lastVerifiedAtEpochMs != null &&
            staleAfterEpochMs != null &&
            staleAfterEpochMs > nowEpochMs
}

internal object PandoraValueWidgetStore {
    private const val preferencesName = "pandora_value_widget_v1"
    private const val keyVerified = "verified"
    private const val keyScore = "score"
    private const val keyFreshness = "freshness"
    private const val keyLastVerifiedAt = "last_verified_at_ms"
    private const val keyStaleAfter = "stale_after_ms"
    private const val missingLong = -1L

    private val allowedFreshness = setOf("fresh", "stale", "notChecked")

    fun write(context: Context, arguments: Map<*, *>) {
        val now = System.currentTimeMillis()
        val requestedVerified = arguments[keyVerified] as? Boolean ?: false
        val score = (arguments[keyScore] as? Number)?.toInt()?.takeIf { it in 0..100 }
        val freshness = (arguments["freshnessState"] as? String)
            ?.takeIf { it in allowedFreshness }
            ?: "notChecked"
        val lastVerifiedAt = (arguments["lastVerifiedAtEpochMs"] as? Number)
            ?.toLong()
            ?.takeIf { it > 0 && it <= now + 5 * 60 * 1000L }
        val staleAfter = (arguments["staleAfterEpochMs"] as? Number)
            ?.toLong()
            ?.takeIf {
                it > now &&
                    it <= now + 30L * 24 * 60 * 60 * 1000 &&
                    (lastVerifiedAt == null || it >= lastVerifiedAt)
            }
        val verified = requestedVerified &&
            score != null &&
            freshness == "fresh" &&
            lastVerifiedAt != null &&
            staleAfter != null

        context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(keyVerified, verified)
            .putInt(keyScore, score ?: -1)
            .putString(keyFreshness, freshness)
            .putLong(keyLastVerifiedAt, lastVerifiedAt ?: missingLong)
            .putLong(keyStaleAfter, staleAfter ?: missingLong)
            .apply()
    }

    fun read(context: Context): PandoraValueWidgetSnapshot {
        val preferences = context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
        val score = preferences.getInt(keyScore, -1).takeIf { it in 0..100 }
        val freshness = preferences.getString(keyFreshness, "notChecked")
            ?.takeIf { it in allowedFreshness }
            ?: "notChecked"
        val lastVerifiedAt = preferences.getLong(keyLastVerifiedAt, missingLong)
            .takeIf { it > 0 }
        val staleAfter = preferences.getLong(keyStaleAfter, missingLong)
            .takeIf { it > 0 }
        return PandoraValueWidgetSnapshot(
            verified = preferences.getBoolean(keyVerified, false),
            score = score,
            freshnessState = freshness,
            lastVerifiedAtEpochMs = lastVerifiedAt,
            staleAfterEpochMs = staleAfter,
        )
    }
}
