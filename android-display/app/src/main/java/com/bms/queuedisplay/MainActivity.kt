package com.bms.queuedisplay

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var loadingLayout: LinearLayout
    private lateinit var tvLoadingInfo: TextView
    private lateinit var tvError: TextView
    private lateinit var btnRetry: Button
    private val handler = Handler(Looper.getMainLooper())
    private var reactCheckRunnable: Runnable? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val prefs = getSharedPreferences("queue_display", MODE_PRIVATE)
        val serverUrl = prefs.getString("serverUrl", "") ?: ""
        val displayId  = prefs.getString("displayId",  "") ?: ""
        val displayName = prefs.getString("displayName", "") ?: ""

        if (serverUrl.isEmpty() || displayId.isEmpty()) {
            startActivity(Intent(this, ConfigActivity::class.java))
            finish()
            return
        }

        val root = FrameLayout(this).apply {
            setBackgroundColor(Color.parseColor("#1a237e"))
        }
        setContentView(root)

        // ── WebView ──────────────────────────────────────────────
        webView = WebView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(Color.parseColor("#1a237e"))
            visibility = View.INVISIBLE
        }

        // ── Loading overlay ──────────────────────────────────────
        loadingLayout = LinearLayout(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#1a237e"))
        }
        val pb = ProgressBar(this).apply {
            isIndeterminate = true
            indeterminateTintList = android.content.res.ColorStateList.valueOf(Color.WHITE)
        }
        tvLoadingInfo = TextView(this).apply {
            text = "กำลังเชื่อมต่อ...\n$serverUrl\nจอ: $displayName"
            textSize = 16f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            setPadding(24, 24, 24, 0)
        }
        loadingLayout.addView(pb)
        loadingLayout.addView(tvLoadingInfo)

        // ── Error overlay ────────────────────────────────────────
        val errorLayout = LinearLayout(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#1a237e"))
            visibility = View.GONE
        }
        tvError = TextView(this).apply {
            textSize = 18f
            setTextColor(Color.parseColor("#FF5252"))
            gravity = Gravity.CENTER
            setPadding(32, 32, 32, 24)
        }
        btnRetry = Button(this).apply {
            text = "โหลดใหม่"
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.parseColor("#283593"))
            setPadding(40, 16, 40, 16)
        }
        val btnConfig = Button(this).apply {
            text = "ตั้งค่าใหม่"
            setTextColor(Color.parseColor("#90CAF9"))
            setBackgroundColor(Color.TRANSPARENT)
            setPadding(40, 8, 40, 8)
        }
        errorLayout.addView(tvError)
        errorLayout.addView(btnRetry)
        errorLayout.addView(btnConfig)

        root.addView(webView)
        root.addView(loadingLayout)
        root.addView(errorLayout)

        val displayUrl = "${serverUrl.trimEnd('/')}/#/display?id=$displayId"

        btnRetry.setOnClickListener {
            errorLayout.visibility = View.GONE
            loadingLayout.visibility = View.VISIBLE
            webView.visibility = View.INVISIBLE
            tvLoadingInfo.text = "กำลังโหลดใหม่...\n$serverUrl\nจอ: $displayName"
            webView.loadUrl(displayUrl)
        }
        btnConfig.setOnClickListener {
            startActivity(Intent(this, ConfigActivity::class.java))
            finish()
        }

        // ── WebView settings ─────────────────────────────────────
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            loadWithOverviewMode = true
            useWideViewPort = true
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            allowFileAccess = true
            javaScriptCanOpenWindowsAutomatically = true
            setSupportMultipleWindows(false)
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(msg: ConsoleMessage) = true
        }

        webView.webViewClient = object : WebViewClient() {
            override fun onReceivedError(view: WebView, req: WebResourceRequest, err: WebResourceError) {
                if (req.isForMainFrame) {
                    cancelReactCheck()
                    val code = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) err.errorCode else -1
                    tvError.text = "เชื่อมต่อ Server ไม่ได้\n\n${req.url}\n\nรหัสข้อผิดพลาด: $code\n\nตรวจสอบว่า Server เปิดอยู่\nและ IP ถูกต้อง"
                    loadingLayout.visibility = View.GONE
                    webView.visibility = View.INVISIBLE
                    errorLayout.visibility = View.VISIBLE
                }
            }

            override fun onPageFinished(view: WebView, url: String) {
                tvLoadingInfo.text = "กำลังแสดงผล...\nจอ: $displayName"
                // ตรวจว่า React render แล้วหรือยัง (รอ children ใน #root)
                scheduleReactCheck(view, errorLayout, displayName)
            }
        }

        webView.loadUrl(displayUrl)
        hideSystemUI()
    }

    private fun scheduleReactCheck(view: WebView, errorLayout: LinearLayout, displayName: String) {
        cancelReactCheck()
        var attempts = 0
        reactCheckRunnable = object : Runnable {
            override fun run() {
                attempts++
                view.evaluateJavascript(
                    "(function(){ var r=document.getElementById('root'); return r ? r.children.length : -1; })()"
                ) { result ->
                    val count = result?.trim()?.toIntOrNull() ?: -1
                    when {
                        count > 0 -> {
                            // React rendered
                            loadingLayout.visibility = View.GONE
                            errorLayout.visibility = View.GONE
                            webView.visibility = View.VISIBLE
                        }
                        attempts < 20 -> {
                            // ยังไม่ render รอ 500ms แล้วลองใหม่ (รวม 10 วินาที)
                            handler.postDelayed(this, 500)
                        }
                        else -> {
                            // Timeout — React ไม่ render
                            tvError.text = "หน้าจอไม่แสดงผล\n\nหน้าเว็บโหลดแล้วแต่ระบบไม่เริ่มต้น\nอาจเกิดจาก WebView รุ่นเก่า\n\nกด 'โหลดใหม่' หรือ 'ตั้งค่าใหม่'"
                            loadingLayout.visibility = View.GONE
                            webView.visibility = View.INVISIBLE
                            errorLayout.visibility = View.VISIBLE
                        }
                    }
                }
            }
        }
        handler.postDelayed(reactCheckRunnable!!, 500)
    }

    private fun cancelReactCheck() {
        reactCheckRunnable?.let { handler.removeCallbacks(it) }
        reactCheckRunnable = null
    }

    override fun onDestroy() {
        super.onDestroy()
        cancelReactCheck()
    }

    private fun hideSystemUI() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.insetsController?.let {
                it.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            )
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemUI()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        AlertDialog.Builder(this)
            .setTitle("Queue Display")
            .setItems(arrayOf("ตั้งค่า / เปลี่ยนจอ", "โหลดหน้าใหม่", "ยกเลิก")) { _, which ->
                when (which) {
                    0 -> { startActivity(Intent(this, ConfigActivity::class.java)); finish() }
                    1 -> {
                        cancelReactCheck()
                        loadingLayout.visibility = View.VISIBLE
                        webView.visibility = View.INVISIBLE
                        webView.reload()
                    }
                }
            }
            .show()
    }
}
