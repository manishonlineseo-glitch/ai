package com.udaypurgroup.jarvis

import android.content.Context

/** The server address and this phone's agent token, kept in the app's private storage. */
object Prefs {
    const val DEFAULT_SERVER = "https://ai.udaypurgroup.in/"

    private fun sp(c: Context) = c.getSharedPreferences("jarvis", Context.MODE_PRIVATE)

    fun server(c: Context): String = sp(c).getString("server", DEFAULT_SERVER) ?: DEFAULT_SERVER

    fun token(c: Context): String? = sp(c).getString("token", null)

    fun save(c: Context, server: String, token: String) {
        sp(c).edit().putString("server", server).putString("token", token).apply()
    }

    fun clearToken(c: Context) {
        sp(c).edit().remove("token").apply()
    }

    fun status(c: Context): String = sp(c).getString("status", "Abhi juda nahi") ?: "Abhi juda nahi"

    fun setStatus(c: Context, text: String) {
        sp(c).edit().putString("status", text).apply()
    }
}
