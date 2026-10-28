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

    /** The device ID + password from the Jarvis site (Devices tab); kept so the app can sign in again by itself. */
    fun saveLogin(c: Context, username: String, password: String) {
        sp(c).edit().putString("login_user", username).putString("login_pass", password).apply()
    }

    fun loginUser(c: Context): String? = sp(c).getString("login_user", null)

    fun loginPass(c: Context): String? = sp(c).getString("login_pass", null)

    /** Sign in with the saved device ID + password. Returns the new token, or null if it did not work. */
    fun relogin(c: Context): String? {
        val u = loginUser(c) ?: return null
        val p = loginPass(c) ?: return null
        return try {
            val r = Http.request("POST", server(c).trimEnd('/') + "/api.php?r=agent_login", emptyMap(), org.json.JSONObject().put("username", u).put("password", p).toString())
            val json = org.json.JSONObject(r.body)
            if (r.code == 200 && json.has("token")) json.getString("token").also { save(c, server(c), it) } else null
        } catch (e: Exception) { null }
    }

    fun clearToken(c: Context) {
        sp(c).edit().remove("token").apply()
    }

    fun status(c: Context): String = sp(c).getString("status", "Abhi juda nahi") ?: "Abhi juda nahi"

    fun setStatus(c: Context, text: String) {
        sp(c).edit().putString("status", text).apply()
    }
}
