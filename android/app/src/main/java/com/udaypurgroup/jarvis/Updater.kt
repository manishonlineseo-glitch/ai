package com.udaypurgroup.jarvis

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * Keeps this app at the version the owner's Jarvis server has. When a newer APK is published the app downloads it, checks its
 * SHA-256 against the server's list, and installs it with Android's session installer (no extra tap on Android 12+ once this
 * app has installed an update itself; the first time Android asks for one confirmation). Call [check] from a background thread.
 */
object Updater {
    private const val ACTION = "com.udaypurgroup.jarvis.UPDATE_RESULT"

    fun currentCode(ctx: Context): Long {
        val info = ctx.packageManager.getPackageInfo(ctx.packageName, 0)
        return if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else @Suppress("DEPRECATION") info.versionCode.toLong()
    }

    fun check(ctx: Context) {
        val token = Prefs.token(ctx) ?: return
        val base = Prefs.server(ctx).trimEnd('/') + "/api.php?r="
        val headers = mapOf("X-Agent-Token" to token)
        val r = Http.request("GET", base + "app_update&platform=android", headers)
        if (r.code != 200 || !r.contentType.contains("json")) return
        val j = JSONObject(r.body)
        val code = j.optLong("code", 0)
        if (code <= currentCode(ctx)) return
        if (!ctx.packageManager.canRequestPackageInstalls()) {
            Prefs.setStatus(ctx, "Naya version (${j.optString("name")}) tayyar: Settings me 'Install unknown apps' allow karo")
            Notify.post(ctx, "Jarvis update tayyar", "Jarvis > Settings me 'Auto-update' ko Allow karo, phir app khud update ho jayega.")
            return
        }
        val apk = File(ctx.cacheDir, "update.apk")
        val conn = URL(base + "app_update_file&platform=android").openConnection() as HttpURLConnection
        try {
            conn.connectTimeout = 15_000
            conn.readTimeout = 120_000
            conn.setRequestProperty("X-Agent-Token", token)
            conn.setRequestProperty("X-Requested-With", "jarvis")
            if (conn.responseCode != 200) return
            val md = MessageDigest.getInstance("SHA-256")
            conn.inputStream.use { input ->
                apk.outputStream().use { out ->
                    val buf = ByteArray(64 * 1024)
                    while (true) {
                        val n = input.read(buf)
                        if (n < 0) break
                        md.update(buf, 0, n)
                        out.write(buf, 0, n)
                    }
                }
            }
            val sha = md.digest().joinToString("") { "%02x".format(it) }
            if (sha != j.optString("sha256")) {
                apk.delete()
                Prefs.setStatus(ctx, "Update ki file galat nikli, chhod di")
                return
            }
        } finally {
            conn.disconnect()
        }
        Prefs.setStatus(ctx, "Update install ho raha hai (v${j.optString("name")})")
        install(ctx, apk)
    }

    private fun install(ctx: Context, apk: File) {
        val installer = ctx.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
        if (Build.VERSION.SDK_INT >= 31) params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
        val id = installer.createSession(params)
        installer.openSession(id).use { session ->
            apk.inputStream().use { input ->
                session.openWrite("jarvis.apk", 0, apk.length()).use { out ->
                    input.copyTo(out)
                    session.fsync(out)
                }
            }
            val pi = PendingIntent.getBroadcast(
                ctx, id, Intent(ACTION).setPackage(ctx.packageName),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
            )
            session.commit(pi.intentSender)
        }
    }

    /** Receives the installer's answer: when Android needs one confirmation tap, show it (or a notification if the app is in the background). */
    class Receiver : BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
            when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, -1)) {
                PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                    @Suppress("DEPRECATION")
                    val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT) ?: return
                    confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    Notify.postIntent(ctx, "Jarvis update", "Tap karke 'Update' dabao", confirm)
                }
                PackageInstaller.STATUS_SUCCESS -> Prefs.setStatus(ctx, "Update ho gaya")
                else -> Prefs.setStatus(ctx, "Update fail: " + (intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: "?"))
            }
        }
    }
}
