package com.udaypurgroup.jarvis

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.DownloadManager
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.view.Gravity
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.URLUtil
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.TextView
import android.widget.Toast
import org.json.JSONObject

/** The Jarvis web app in a full-screen WebView, plus native voice input and a button to the Settings screen. */
class MainActivity : Activity() {
    private lateinit var web: WebView
    private var recognizer: SpeechRecognizer? = null
    private var pendingLang: String? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = FrameLayout(this)
        web = WebView(this)
        root.addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))

        val dp = resources.displayMetrics.density
        val gear = TextView(this).apply {
            text = "⚙"
            textSize = 20f
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.argb(150, 11, 16, 32))
            gravity = Gravity.CENTER
            setOnClickListener { startActivity(Intent(this@MainActivity, SettingsActivity::class.java)) }
        }
        root.addView(gear, FrameLayout.LayoutParams((40 * dp).toInt(), (40 * dp).toInt(), Gravity.TOP or Gravity.END).apply {
            setMargins(0, (6 * dp).toInt(), (6 * dp).toInt(), 0)
        })
        setContentView(root)

        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            userAgentString = userAgentString + " JarvisApp/1.0"
        }
        CookieManager.getInstance().setAcceptCookie(true)
        web.addJavascriptInterface(Bridge(), "JarvisNative")
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                val ownHost = Uri.parse(Prefs.server(this@MainActivity)).host
                if ((uri.scheme == "https" || uri.scheme == "http") && uri.host == ownHost) return false
                // tel:, whatsapp:, other sites: hand them to the phone (dialer, WhatsApp, browser)
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                } catch (_: Exception) {
                    Toast.makeText(this@MainActivity, "Ye link khul nahi paya", Toast.LENGTH_SHORT).show()
                }
                return true
            }
        }
        web.setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
            val name = URLUtil.guessFileName(url, contentDisposition, mimeType)
            val req = DownloadManager.Request(Uri.parse(url))
                .addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url) ?: "")
                .addRequestHeader("User-Agent", userAgent)
                .setMimeType(mimeType)
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
            (getSystemService(DOWNLOAD_SERVICE) as DownloadManager).enqueue(req)
            Toast.makeText(this, "Download shuru: $name", Toast.LENGTH_SHORT).show()
        }
        web.loadUrl(Prefs.server(this))

        if (Prefs.token(this) != null) {
            startForegroundService(Intent(this, PhoneAgentService::class.java))
        } else {
            startActivity(Intent(this, SettingsActivity::class.java)) // first run: pair the phone and grant permissions
        }
    }

    override fun onResume() {
        super.onResume()
        if (Prefs.token(this) != null && !PhoneAgentService.running) {
            startForegroundService(Intent(this, PhoneAgentService::class.java))
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else @Suppress("DEPRECATION") super.onBackPressed()
    }

    override fun onDestroy() {
        recognizer?.destroy()
        super.onDestroy()
    }

    // ---------------------------------------------------------------- voice: the phone's own speech recognizer (the browser's does not exist in a WebView)
    private fun js(code: String) = runOnUiThread { web.evaluateJavascript(code, null) }

    inner class Bridge {
        @JavascriptInterface
        fun available(): Boolean = SpeechRecognizer.isRecognitionAvailable(this@MainActivity)

        @JavascriptInterface
        fun listen(lang: String) {
            runOnUiThread { startListening(lang) }
        }

        @JavascriptInterface
        fun stop() {
            runOnUiThread { recognizer?.stopListening() }
        }
    }

    private fun startListening(lang: String) {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            pendingLang = lang
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 11)
            return
        }
        recognizer?.destroy()
        val rec = SpeechRecognizer.createSpeechRecognizer(this)
        recognizer = rec
        rec.setRecognitionListener(object : RecognitionListener {
            override fun onResults(results: android.os.Bundle?) {
                val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
                if (text.isNullOrBlank()) js("window.onNativeSpeechEnd && window.onNativeSpeechEnd()")
                else js("window.onNativeSpeech && window.onNativeSpeech(" + JSONObject.quote(text) + ")")
            }

            override fun onError(error: Int) {
                js("window.onNativeSpeechEnd && window.onNativeSpeechEnd()")
            }

            override fun onReadyForSpeech(params: android.os.Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onPartialResults(partialResults: android.os.Bundle?) {}
            override fun onEvent(eventType: Int, params: android.os.Bundle?) {}
        })
        rec.startListening(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        })
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 11) {
            val lang = pendingLang
            pendingLang = null
            if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED && lang != null) startListening(lang)
            else js("window.onNativeSpeechEnd && window.onNativeSpeechEnd()")
        }
    }
}
