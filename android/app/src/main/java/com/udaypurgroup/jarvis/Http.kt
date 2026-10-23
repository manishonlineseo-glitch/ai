package com.udaypurgroup.jarvis

import java.net.HttpURLConnection
import java.net.URL

/** Small blocking HTTP helper (no libraries). Always call it from a background thread. */
object Http {
    class Reply(val code: Int, val body: String, val contentType: String)

    fun request(
        method: String,
        url: String,
        headers: Map<String, String> = emptyMap(),
        body: String? = null,
        timeoutMs: Int = 30_000,
    ): Reply {
        val conn = URL(url).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = method
            conn.connectTimeout = 15_000
            conn.readTimeout = timeoutMs
            conn.setRequestProperty("User-Agent", "JarvisPhone/1.0")
            conn.setRequestProperty("X-Requested-With", "jarvis")
            headers.forEach { (k, v) -> conn.setRequestProperty(k, v) }
            if (body != null) {
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json")
                conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            }
            val code = conn.responseCode
            val stream = if (code >= 400) conn.errorStream else conn.inputStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
            return Reply(code, text, conn.contentType ?: "")
        } finally {
            conn.disconnect()
        }
    }
}
