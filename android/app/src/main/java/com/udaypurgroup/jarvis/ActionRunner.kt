package com.udaypurgroup.jarvis

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.BatteryManager
import android.os.Environment
import android.os.StatFs
import android.provider.Settings
import org.json.JSONObject
import java.io.File
import java.net.URLEncoder
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * The things Jarvis can do on this phone. Every action comes from the owner's own server; the server decides what needs
 * a tap on the phone/web app first (calls, moving files). Nothing is deleted: files only move to "Pictures/Jarvis Trash".
 */
object ActionRunner {

    fun run(ctx: Context, action: String, args: JSONObject): String = when (action) {
        "phone_status" -> status(ctx)
        "phone_notify" -> {
            Notify.post(ctx, "Jarvis", args.getString("text"))
            "Notification bhej di"
        }
        "phone_open_url" -> openOrNotify(ctx, Intent(Intent.ACTION_VIEW, Uri.parse(args.getString("url"))), "Link")
        "phone_youtube_play" -> youtube(ctx, args.getString("query"))
        "phone_call" -> call(ctx, args.getString("number"), args.optString("contact"))
        "phone_scan_files" -> scanScreenshots(args.optInt("older_than_days", 30))
        "phone_trash_files" -> trashScreenshots(ctx, args.optInt("older_than_days", 30))
        else -> throw IllegalArgumentException("unknown action: $action")
    }

    /**
     * Android 10+ blocks a background service from opening apps unless the user allowed "Display over other apps".
     * Without it we post a notification that opens the app when tapped, so the command still works with one tap.
     */
    private fun openOrNotify(ctx: Context, intent: Intent, label: String): String {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return if (Settings.canDrawOverlays(ctx)) {
            ctx.startActivity(intent)
            "$label khol diya"
        } else {
            Notify.postIntent(ctx, "Jarvis: $label", "Tap karke kholo", intent)
            "'Display over other apps' permission nahi hai, isliye notification bheji ($label): tap karna padega"
        }
    }

    private fun status(ctx: Context): String {
        val bat = ctx.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level = bat?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = bat?.getIntExtra(BatteryManager.EXTRA_SCALE, 100) ?: 100
        val charging = (bat?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1).let {
            it == BatteryManager.BATTERY_STATUS_CHARGING || it == BatteryManager.BATTERY_STATUS_FULL
        }
        val fs = StatFs(Environment.getDataDirectory().path)
        val freeGb = fs.availableBytes / 1_073_741_824.0
        val totalGb = fs.totalBytes / 1_073_741_824.0
        return "Battery ${if (scale > 0) level * 100 / scale else level}%${if (charging) " (charging)" else ""}, " +
            "storage %.1f GB free / %.0f GB".format(Locale.US, freeGb, totalGb)
    }

    private fun youtube(ctx: Context, query: String): String {
        val q = URLEncoder.encode(query, "UTF-8")
        var videoId: String? = null
        try {
            val r = Http.request(
                "GET", "https://www.youtube.com/results?search_query=$q&sp=EgIQAQ%253D%253D",
                mapOf("User-Agent" to "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36", "Accept-Language" to "en-IN"),
                null, 20_000,
            )
            if (r.code == 200) videoId = Regex("\"videoId\":\"([A-Za-z0-9_-]{11})\"").find(r.body)?.groupValues?.get(1)
        } catch (_: Exception) {
            // fall back to the search page below
        }
        val intent = if (videoId != null) {
            Intent(Intent.ACTION_VIEW, Uri.parse("vnd.youtube:$videoId")).apply {
                if (ctx.packageManager.getLaunchIntentForPackage("com.google.android.youtube") != null) setPackage("com.google.android.youtube")
            }
        } else {
            Intent(Intent.ACTION_VIEW, Uri.parse("https://www.youtube.com/results?search_query=$q"))
        }
        val how = openOrNotify(ctx, intent, "YouTube: $query")
        return if (videoId != null) "$how (pehla video: youtu.be/$videoId)" else "$how (video nahi mila, search khola)"
    }

    private fun call(ctx: Context, number: String, contact: String): String {
        val granted = ctx.checkSelfPermission(Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED
        val intent = Intent(if (granted) Intent.ACTION_CALL else Intent.ACTION_DIAL, Uri.parse("tel:" + Uri.encode(number)))
        val who = if (contact.isNotBlank()) contact else "number"
        return openOrNotify(ctx, intent, (if (granted) "Call " else "Dialer: ") + who)
    }

    // ------------------------------------------------------------------ screenshots: scan, then move to a trash folder
    private fun screenshotFiles(olderThanDays: Int): List<File> {
        val cutoff = System.currentTimeMillis() - olderThanDays * 86_400_000L
        val root = Environment.getExternalStorageDirectory()
        val exts = setOf("png", "jpg", "jpeg", "webp")
        return listOf("Pictures/Screenshots", "DCIM/Screenshots").map { File(root, it) }
            .filter { it.isDirectory }
            .flatMap { (it.listFiles() ?: emptyArray()).toList() }
            .filter { it.isFile && it.lastModified() < cutoff && it.extension.lowercase(Locale.ROOT) in exts }
    }

    private fun requireAllFiles() {
        if (!Environment.isExternalStorageManager()) {
            throw IllegalStateException("'All files access' permission nahi hai: Jarvis app > Settings me allow karo")
        }
    }

    private fun scanScreenshots(days: Int): String {
        requireAllFiles()
        val files = screenshotFiles(days)
        if (files.isEmpty()) return "$days din se purane screenshots nahi mile."
        val mb = files.sumOf { it.length() } / 1_048_576.0
        val fmt = SimpleDateFormat("dd MMM yyyy", Locale.US)
        val oldest = files.minOf { it.lastModified() }
        val newest = files.maxOf { it.lastModified() }
        return "%d screenshots ($days din se purane), %.0f MB, %s se %s tak. Hataane ke liye bolo: 'inhe trash me daalo'.".format(
            Locale.US, files.size, mb, fmt.format(Date(oldest)), fmt.format(Date(newest)),
        )
    }

    private fun trashScreenshots(ctx: Context, days: Int): String {
        requireAllFiles()
        val files = screenshotFiles(days)
        if (files.isEmpty()) return "$days din se purane screenshots nahi mile."
        val root = File(Environment.getExternalStorageDirectory(), "Pictures/Jarvis Trash")
        purgeOldTrash(root)
        val dest = File(root, SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date()))
        dest.mkdirs()
        val moved = ArrayList<String>()
        var skipped = 0
        for (f in files) {
            var target = File(dest, f.name)
            var n = 1
            while (target.exists()) target = File(dest, "${f.nameWithoutExtension}_${n++}.${f.extension}")
            if (f.renameTo(target)) {
                moved.add(f.absolutePath)
                moved.add(target.absolutePath)
            } else skipped++
        }
        if (moved.isNotEmpty()) MediaScannerConnection.scanFile(ctx, moved.toTypedArray(), null, null)
        return "${moved.size / 2} screenshots 'Pictures/Jarvis Trash/${dest.name}' me daale (delete nahi kiye, 30 din baad trash saaf hoga)." +
            if (skipped > 0) " $skipped move nahi ho paye." else ""
    }

    /** Trash folders older than 30 days are removed; only ever inside "Jarvis Trash". */
    private fun purgeOldTrash(root: File) {
        val cutoff = System.currentTimeMillis() - 30 * 86_400_000L
        root.listFiles()?.filter { it.isDirectory && it.lastModified() < cutoff }?.forEach { it.deleteRecursively() }
    }
}
