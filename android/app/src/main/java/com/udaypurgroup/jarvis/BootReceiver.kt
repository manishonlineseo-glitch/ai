package com.udaypurgroup.jarvis

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** After a restart, bring the phone agent back if the phone was already paired. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED && Prefs.token(context) != null) {
            context.startForegroundService(Intent(context, PhoneAgentService::class.java))
        }
    }
}
