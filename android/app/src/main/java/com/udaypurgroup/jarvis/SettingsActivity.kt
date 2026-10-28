package com.udaypurgroup.jarvis

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.PowerManager
import android.provider.Settings
import android.text.InputType
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import org.json.JSONObject

/** Pair the phone with a one-time code, and grant the permissions the phone agent needs (each one explained). */
class SettingsActivity : Activity() {
    private lateinit var statusView: TextView
    private lateinit var permsBox: LinearLayout
    private lateinit var serverField: EditText
    private lateinit var codeField: EditText
    private lateinit var passField: EditText
    private lateinit var pairMsg: TextView

    private fun dp(n: Int) = (n * resources.displayMetrics.density).toInt()

    private fun label(text: String, size: Float = 14f, bold: Boolean = false) = TextView(this).apply {
        this.text = text
        textSize = size
        if (bold) setTypeface(typeface, android.graphics.Typeface.BOLD)
        setPadding(0, dp(6), 0, dp(2))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(24), dp(20), dp(32))
        }
        col.addView(label("Jarvis phone agent", 22f, true))
        statusView = label("", 15f)
        col.addView(statusView)

        col.addView(label("1. Phone ko Jarvis se jodo", 17f, true))
        col.addView(label("Jarvis site > Devices me is phone ka Username aur Password banao (Device type: Android) aur wahi yahan daalo."))
        serverField = EditText(this).apply {
            setText(Prefs.server(this@SettingsActivity))
            inputType = InputType.TYPE_TEXT_VARIATION_URI
            hint = "Server"
        }
        col.addView(serverField)
        codeField = EditText(this).apply {
            hint = "Username"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
            setText(Prefs.loginUser(this@SettingsActivity) ?: "")
            textSize = 18f
        }
        col.addView(codeField)
        passField = EditText(this).apply {
            hint = "Password"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            textSize = 18f
        }
        col.addView(passField)
        col.addView(Button(this).apply {
            text = "Login"
            setOnClickListener { pair() }
        })
        pairMsg = label("")
        col.addView(pairMsg)

        col.addView(label("2. Permissions", 17f, true))
        col.addView(label("Jitni zyada permission, utna zyada kaam Jarvis phone par kar sakta hai. Har ek ka kaam likha hai."))
        col.addView(label("Agar 'App was denied access' / 'Restricted setting' likha aaye (APK bahar se install ki ho to Android aisa karta hai):", 13f, true))
        col.addView(label("1) Neeche 'App info kholo' dabao  2) Upar kone me teen dot (\u22EE)  3) 'Allow restricted settings' dabao (PIN/fingerprint lagega)  4) Wapas aakar Allow dabao. " +
            "Teen dot na dikhe to pehle ek baar Allow dabao (error aane do), phir App info me jaao.", 13f))
        col.addView(Button(this).apply {
            text = "App info kholo"
            setOnClickListener {
                startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
            }
        })
        permsBox = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        col.addView(permsBox)

        col.addView(Button(this).apply {
            text = "Jarvis kholo"
            setOnClickListener { finish() }
        })
        setContentView(ScrollView(this).apply { addView(col) })
    }

    override fun onResume() {
        super.onResume()
        refresh()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        refresh()
    }

    private class Perm(val title: String, val why: String, val granted: Boolean, val restricted: Boolean = false, val ask: () -> Unit)

    private fun perms(): List<Perm> {
        val list = ArrayList<Perm>()
        if (Build.VERSION.SDK_INT >= 33) {
            list.add(Perm("Notifications", "Jarvis ke message aur 'tap karke kholo' wali notification.",
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
                requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
            })
        }
        list.add(Perm("Microphone", "Bol kar Jarvis se baat karne ke liye.",
            checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 2)
        })
        list.add(Perm("Call karna", "'Mom ko call karo' par seedha call lagane ke liye (warna sirf dialer khulta hai).",
            checkSelfPermission(Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.CALL_PHONE), 3)
        })
        list.add(Perm("Display over other apps", "Background se YouTube/dialer apne aap kholne ke liye (Android iske bina rokta hai).",
            Settings.canDrawOverlays(this), true) {
            startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
        })
        list.add(Perm("All files access", "Purane screenshots dhundhne aur 'Jarvis Trash' me daalne ke liye. Kuch bhi delete nahi hota.",
            Environment.isExternalStorageManager(), true) {
            startActivity(Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:$packageName")))
        })
        list.add(Perm("Auto-update", "Jarvis server par naya app aate hi ye app khud update ho jaye (aapko baar baar APK nahi chadhani padegi).",
            packageManager.canRequestPackageInstalls(), true) {
            startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName")))
        })
        val pm = getSystemService(POWER_SERVICE) as PowerManager
        list.add(Perm("Battery optimization band", "Taaki Android Jarvis ko background me band na kare.",
            pm.isIgnoringBatteryOptimizations(packageName)) {
            startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
        })
        return list
    }

    private fun refresh() {
        statusView.text = "Status: " + Prefs.status(this) + if (Prefs.token(this) != null) "" else " (login karo)"
        permsBox.removeAllViews()
        for (p in perms()) {
            val row = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(0, dp(8), 0, dp(8)) }
            row.addView(label((if (p.granted) "✅ " else "❌ ") + p.title, 16f, true))
            row.addView(label(p.why, 13f))
            if (!p.granted && p.restricted) row.addView(label("Agar error aaye: upar wale 'Allow restricted settings' steps karo.", 12f))
            if (!p.granted) row.addView(Button(this).apply {
                text = "Allow"
                setOnClickListener { p.ask() }
            })
            permsBox.addView(row)
        }
    }

    private fun pair() {
        val server = serverField.text.toString().trim().trimEnd('/') + "/"
        val username = codeField.text.toString().trim()
        val password = passField.text.toString()
        if (!server.startsWith("https://")) {
            pairMsg.text = "Server https:// se shuru hona chahiye."
            return
        }
        pairMsg.text = "Jod raha hoon..."
        Thread {
            val msg = try {
                val r = Http.request("POST", server + "api.php?r=agent_login", emptyMap(), JSONObject().put("username", username).put("password", password).toString())
                val json = JSONObject(r.body)
                if (r.code == 200 && json.has("token")) {
                    Prefs.save(this, server, json.getString("token"))
                    Prefs.saveLogin(this, username, password)
                    Prefs.setStatus(this, "Jud gaya: " + json.optString("name"))
                    startForegroundService(Intent(this, PhoneAgentService::class.java))
                    "Jud gaya: ${json.optString("name")}. Ab neeche ki permissions allow karo."
                } else json.optString("error", "Error ${r.code}")
            } catch (e: Exception) {
                "Server se baat nahi ho payi: ${e.message}"
            }
            runOnUiThread {
                pairMsg.text = msg
                refresh()
            }
        }.start()
    }
}
