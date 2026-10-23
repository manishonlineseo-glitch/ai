package com.udaypurgroup.jarvis

import android.app.ActivityManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.BatteryManager
import android.os.Build
import android.os.IBinder
import org.json.JSONObject
import java.io.IOException

/**
 * Keeps this phone connected to the owner's Jarvis server like the Windows agent: it asks "anything for me?" (the server holds
 * each request up to 18 s, about 3 a minute), runs the commands and reports the result.
 */
class PhoneAgentService : Service() {
    companion object {
        const val NOTIF_ID = 1
        @Volatile var running = false
    }

    private var worker: Thread? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Notify.ensureChannels(this)
        val n = Notify.foreground(this, "Jarvis phone agent: shuru ho raha hai")
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(NOTIF_ID, n)
        }
        if (Prefs.token(this) == null) {
            Prefs.setStatus(this, "Code se jodna baaki hai")
            stopSelf()
            return START_NOT_STICKY
        }
        if (!running) {
            running = true
            worker = Thread { loop() }.also { it.isDaemon = true; it.start() }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        running = false
        worker?.interrupt()
        super.onDestroy()
    }

    private fun status(text: String) {
        Prefs.setStatus(this, text)
        Notify.updateForeground(this, text)
    }

    private fun sleepQuietly(ms: Long) {
        try {
            Thread.sleep(ms)
        } catch (_: InterruptedException) {
            // service is stopping
        }
    }

    private fun loop() {
        while (running) {
            val token = Prefs.token(this)
            if (token == null) {
                status("Token nahi hai, dobara jodo")
                break
            }
            val base = Prefs.server(this).trimEnd('/') + "/api.php?r="
            val headers = mapOf("X-Agent-Token" to token)
            try {
                val r = Http.request("GET", base + "agent_poll&wait=18" + metrics() + "&projects=", headers, null, 40_000)
                when {
                    r.code == 401 -> {
                        status("Server ne token reject kiya, Settings me naye code se jodo")
                        Prefs.clearToken(this)
                        break
                    }
                    r.code in intArrayOf(403, 429, 503) || !r.contentType.contains("json") -> {
                        status("Server ne roka (HTTP ${r.code}), 2 minute ruk raha hoon")
                        sleepQuietly(120_000)
                        continue
                    }
                }
                status("Jude hue hain")
                val cmds = JSONObject(r.body).optJSONArray("commands")
                if (cmds != null) {
                    for (i in 0 until cmds.length()) {
                        val c = cmds.getJSONObject(i)
                        var ok = true
                        var result: String
                        try {
                            result = ActionRunner.run(this, c.getString("action"), c.optJSONObject("args") ?: JSONObject())
                        } catch (e: Exception) {
                            ok = false
                            result = "${e.javaClass.simpleName}: ${e.message}"
                        }
                        report(base, headers, c.getInt("id"), ok, result)
                    }
                }
                sleepQuietly(1_000)
            } catch (e: IOException) {
                status("Internet/server nahi mil raha")
                sleepQuietly(10_000)
            } catch (e: Exception) {
                status("Error: ${e.message}")
                sleepQuietly(15_000)
            }
        }
        running = false
    }

    private fun report(base: String, headers: Map<String, String>, id: Int, ok: Boolean, result: String) {
        val body = JSONObject().put("id", id).put("ok", ok).put("result", result).toString()
        repeat(3) {
            try {
                Http.request("POST", base + "agent_result", headers, body, 30_000)
                return
            } catch (_: IOException) {
                sleepQuietly(5_000)
            }
        }
    }

    /** Battery and memory for the Command Center card (the server accepts 0-100 values). */
    private fun metrics(): String {
        val sb = StringBuilder()
        val bat = registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level = bat?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = bat?.getIntExtra(BatteryManager.EXTRA_SCALE, 100) ?: 100
        if (level >= 0 && scale > 0) sb.append("&bat=").append(level * 100 / scale)
        val mi = ActivityManager.MemoryInfo()
        (getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).getMemoryInfo(mi)
        if (mi.totalMem > 0) sb.append("&ram=").append(100 - (mi.availMem * 100 / mi.totalMem))
        return sb.toString()
    }
}
