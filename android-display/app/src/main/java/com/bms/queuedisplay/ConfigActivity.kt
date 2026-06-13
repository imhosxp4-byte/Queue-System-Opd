package com.bms.queuedisplay

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONArray
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

data class DisplayConfig(val id: String, val name: String, val channels: List<String>) {
    override fun toString() = name
}

class ConfigActivity : AppCompatActivity() {

    private var displays = listOf<DisplayConfig>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_config)
        supportActionBar?.title = "ตั้งค่าจอแสดงคิว"

        val prefs = getSharedPreferences("queue_display", MODE_PRIVATE)

        val etUrl      = findViewById<EditText>(R.id.etServerUrl)
        val btnFetch   = findViewById<Button>(R.id.btnFetch)
        val spinner    = findViewById<Spinner>(R.id.spinnerDisplay)
        val tvStatus   = findViewById<TextView>(R.id.tvStatus)
        val tvInfo     = findViewById<TextView>(R.id.tvInfo)
        val btnOpen    = findViewById<Button>(R.id.btnOpen)

        etUrl.setText(prefs.getString("serverUrl", "") ?: "")

        btnFetch.setOnClickListener {
            val url = etUrl.text.toString().trim().trimEnd('/')
            if (url.isEmpty()) { tvStatus.text = "กรุณากรอก Server URL"; return@setOnClickListener }

            tvStatus.text = "กำลังดึงข้อมูล..."
            btnFetch.isEnabled = false
            btnOpen.isEnabled = false

            thread {
                try {
                    val conn = URL("$url/api/display/configs").openConnection() as HttpURLConnection
                    conn.connectTimeout = 5000
                    conn.readTimeout = 5000
                    val json = conn.inputStream.bufferedReader().readText()
                    conn.disconnect()

                    val arr = JSONArray(json)
                    val list = mutableListOf<DisplayConfig>()
                    for (i in 0 until arr.length()) {
                        val obj = arr.getJSONObject(i)
                        val channels = mutableListOf<String>()
                        val ch = obj.optJSONArray("channels")
                        if (ch != null) for (j in 0 until ch.length()) channels.add(ch.getString(j))
                        list.add(DisplayConfig(obj.getString("id"), obj.getString("name"), channels))
                    }

                    runOnUiThread {
                        displays = list
                        val adapter = ArrayAdapter(this, android.R.layout.simple_spinner_item, list)
                        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
                        spinner.adapter = adapter
                        tvStatus.text = "พบ ${list.size} จอแสดงผล ✓"
                        btnFetch.isEnabled = true
                        btnOpen.isEnabled = list.isNotEmpty()

                        val savedId = prefs.getString("displayId", "")
                        val idx = list.indexOfFirst { it.id == savedId }
                        if (idx >= 0) spinner.setSelection(idx)
                    }
                } catch (e: Exception) {
                    runOnUiThread {
                        tvStatus.text = "เชื่อมต่อไม่ได้: ${e.message}"
                        btnFetch.isEnabled = true
                    }
                }
            }
        }

        spinner.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>, view: View?, pos: Int, id: Long) {
                val d = displays.getOrNull(pos) ?: return
                tvInfo.text = if (d.channels.isEmpty()) "ทุกช่องบริการ"
                              else "ช่องบริการ: ${d.channels.joinToString(", ")}"
            }
            override fun onNothingSelected(parent: AdapterView<*>) {}
        }

        btnOpen.setOnClickListener {
            val serverUrl = etUrl.text.toString().trim().trimEnd('/')
            val d = displays.getOrNull(spinner.selectedItemPosition) ?: return@setOnClickListener
            prefs.edit()
                .putString("serverUrl", serverUrl)
                .putString("displayId", d.id)
                .putString("displayName", d.name)
                .apply()
            startActivity(Intent(this, MainActivity::class.java))
            finish()
        }

        if (etUrl.text.isNotEmpty()) btnFetch.performClick()
    }
}
