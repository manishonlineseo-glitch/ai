package com.udaypurgroup.jarvis

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build

/** Notifications: the always-on "agent running" one, messages from Jarvis, and "tap to open" fallbacks. */
object Notify {
    private const val CH_AGENT = "agent"
    private const val CH_ALERTS = "alerts"
    private var counter = 100

    fun ensureChannels(ctx: Context) {
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(NotificationChannel(CH_AGENT, "Jarvis agent", NotificationManager.IMPORTANCE_MIN))
        nm.createNotificationChannel(NotificationChannel(CH_ALERTS, "Jarvis messages", NotificationManager.IMPORTANCE_HIGH))
    }

    private fun builder(ctx: Context, channel: String): Notification.Builder =
        if (Build.VERSION.SDK_INT >= 26) Notification.Builder(ctx, channel) else @Suppress("DEPRECATION") Notification.Builder(ctx)

    fun foreground(ctx: Context, text: String): Notification {
        val open = PendingIntent.getActivity(ctx, 0, Intent(ctx, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        return builder(ctx, CH_AGENT)
            .setSmallIcon(R.drawable.ic_launcher)
            .setContentTitle("Jarvis")
            .setContentText(text)
            .setOngoing(true)
            .setContentIntent(open)
            .build()
    }

    fun updateForeground(ctx: Context, text: String) {
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(PhoneAgentService.NOTIF_ID, foreground(ctx, text))
    }

    fun post(ctx: Context, title: String, text: String) {
        ensureChannels(ctx)
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val n = builder(ctx, CH_ALERTS).setSmallIcon(R.drawable.ic_launcher).setContentTitle(title).setContentText(text)
            .setStyle(Notification.BigTextStyle().bigText(text)).setAutoCancel(true).build()
        nm.notify(counter++, n)
    }

    /** A notification that opens [intent] when tapped (used when Android will not let a background service open apps). */
    fun postIntent(ctx: Context, title: String, text: String, intent: Intent) {
        ensureChannels(ctx)
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val pi = PendingIntent.getActivity(ctx, counter, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n = builder(ctx, CH_ALERTS).setSmallIcon(R.drawable.ic_launcher).setContentTitle(title).setContentText(text)
            .setContentIntent(pi).setAutoCancel(true).build()
        nm.notify(counter++, n)
    }
}
