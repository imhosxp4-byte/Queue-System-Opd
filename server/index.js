// Queue OPD — Express + WebSocket server (Browser mode)
'use strict'

// Polyfill for Node.js < 19: msedge-tts requires globalThis.crypto (Web Crypto API)
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = require('crypto').webcrypto
}

const http = require('http')
const path = require('path')
const fs = require('fs')
const express = require('express')
const cors = require('cors')
const { WebSocketServer } = require('ws')
const mysql = require('mysql2/promise')
const { Client: PgClient } = require('pg')
const md5 = require('md5')

const PORT = process.env.PORT || 3200
const DATA_DIR = process.env.QUEUE_DATA_DIR || path.join(__dirname, '..', 'data')
const SETTINGS_FILE = path.join(DATA_DIR, 'db-settings.json')
const DISPLAY_CONFIGS_FILE = path.join(DATA_DIR, 'display-configs.json')
const TTS_CACHE_DIR = path.join(DATA_DIR, 'tts-cache')

// Ensure data dirs exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
if (!fs.existsSync(TTS_CACHE_DIR)) fs.mkdirSync(TTS_CACHE_DIR, { recursive: true })

// ─── Seed default configs on first run ───────────────────────────────────────

const DEFAULT_DISPLAY_CONFIGS = [
  {
    "id": "1780456207756",
    "name": "ซักประวัติตรวจโรคทั่วไป",
    "bgColor": "#bbdf07",
    "textColor": "#FFFFFF",
    "queueColor": "#00BCD4",
    "font": "Sarabun",
    "fontSize": 120,
    "title": "ระบบคิวผู้ป่วยนอก-ตรวจโรคทั่วไป",
    "subTitle": "GP",
    "showClock": true,
    "queueBgColor": "rgba(0,188,212,0.15)",
    "showHistory": true,
    "animationType": "scale",
    "soundEnabled": true,
    "channels": ["1", "2"]
  }
]

const DEFAULT_QD_CONFIG = {
  "title": "ระบบคิวผู้ป่วยนอก",
  "headerBg": "#061332",
  "headerTextColor": "#faf9f9",
  "showClock": true,
  "clockColor": "#fb1909",
  "soundEnabled": true,
  "colSpHeader": "ช่องบริการ",
  "colQueueHeader": "หมายเลขที่เรียกเข้าบริการ",
  "tableHeaderBg": "#2f90c1",
  "tableHeaderColor": "#ffffff",
  "spColumnBg": "#f8f9fa",
  "spColumnColor": "#0f0f48",
  "spHeaderBg": "#1b92c5",
  "spHeaderColor": "#ffffff",
  "showNoShowPanel": true,
  "noShowItemHeight": 120,
  "queueBg": "#ffffff",
  "queueColor": "#102565",
  "spDisplayNames": {},
  "spFontSize": 14,
  "spColumnWidth": 300,
  "spColumnVisible": true,
  "borderColor": "#07c3e9",
  "borderWidth": 2,
  "footerHeight": 62,
  "rightPanelBg": "#1a0000",
  "rightPanelHeaderBg": "#7f0000",
  "rightPanelHeaderColor": "#ffffff",
  "rightPanelLabel": "เรียกแล้วไม่มา",
  "rightPanelQueueColor": "#ff6b6b",
  "rightPanelWidth": 310,
  "rightPanelFontSize": 5.5,
  "rightPanelMaxItems": 12,
  "font": "Arial",
  "fontSize": 14.5,
  "animationType": "scale",
  "showFooter": true,
  "marqueeText": "ยินดีต้อนรับ  กรุณานั่งรอเรียกหมายเลขคิว",
  "footerBg": "#1596c1",
  "footerTextColor": "#ffffff",
  "footerFontSize": 31,
  "footerScrollSpeed": 60,
  "hiddenSPs": [],
  "displayStation": "",
  "filterDepts": [],
  "numColumns": 1,
  "spColumns": {},
  "spRows": {},
  "displayConfigId": "1780456207756",
  "displayConfigName": "ซักประวัติตรวจโรคทั่วไป",
  "displayChannels": ["1", "2"],
  "ttsEnabled": true,
  "ttsSource": "server",
  "ttsPrefix1": "ขอเชิญคิว",
  "ttsMiddle": "ที่ช่องบริการ",
  "ttsSuffix": "ค่ะ",
  "ttsVoiceName": "Microsoft เปรมวดี Online (Natural) - Thai (Thailand)",
  "ttsServerVoiceName": "th-TH-PremwadeeNeural",
  "ttsRate": 0.7,
  "ttsPitch": 0.9,
  "ttsVolume": 0.8,
  "ttsShowName": false,
  "maskLastName": false
}

const QD_DEFAULT_FILE_SEED = path.join(DATA_DIR, 'qd-default-config.json')
const QD_DISPLAY_CONFIG_SEED = path.join(DATA_DIR, 'qd-config-1780456207756.json')
if (!fs.existsSync(DISPLAY_CONFIGS_FILE))
  fs.writeFileSync(DISPLAY_CONFIGS_FILE, JSON.stringify(DEFAULT_DISPLAY_CONFIGS, null, 2), 'utf-8')
if (!fs.existsSync(QD_DEFAULT_FILE_SEED))
  fs.writeFileSync(QD_DEFAULT_FILE_SEED, JSON.stringify(DEFAULT_QD_CONFIG, null, 2), 'utf-8')
if (!fs.existsSync(QD_DISPLAY_CONFIG_SEED))
  fs.writeFileSync(QD_DISPLAY_CONFIG_SEED, JSON.stringify(DEFAULT_QD_CONFIG, null, 2), 'utf-8')

// ─── Settings helpers ─────────────────────────────────────────────────────────

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'))
  } catch {}
  return null
}

function saveSettings(s) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2), 'utf-8')
}

// ─── Display configs helpers ──────────────────────────────────────────────────

function loadDisplayConfigs() {
  try {
    if (fs.existsSync(DISPLAY_CONFIGS_FILE)) return JSON.parse(fs.readFileSync(DISPLAY_CONFIGS_FILE, 'utf-8'))
  } catch {}
  return []
}

function saveDisplayConfigs(configs) {
  fs.writeFileSync(DISPLAY_CONFIGS_FILE, JSON.stringify(configs, null, 2), 'utf-8')
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

let _mysqlPool = null
let _poolSettings = null

function getMysqlPool(settings) {
  const key = `${settings.host}:${settings.port}:${settings.database}:${settings.username}`
  if (_mysqlPool && _poolSettings === key) return _mysqlPool
  if (_mysqlPool) { _mysqlPool.end().catch(() => {}) }
  _mysqlPool = mysql.createPool({
    host: settings.host, port: settings.port,
    database: settings.database, user: settings.username,
    password: settings.password,
    waitForConnections: true, connectionLimit: 5, queueLimit: 0,
    connectTimeout: 5000
  })
  _poolSettings = key
  return _mysqlPool
}

async function queryDB(settings, sql, sqlPg, params) {
  if (!settings) throw new Error('ยังไม่ได้ตั้งค่าการเชื่อมต่อ')
  if (settings.type === 'mysql') {
    const pool = getMysqlPool(settings)
    const [rows] = await pool.execute(sql, params)
    return rows
  }
  const client = new PgClient({
    host: settings.host, port: settings.port,
    database: settings.database, user: settings.username,
    password: settings.password, connectionTimeoutMillis: 5000
  })
  await client.connect()
  try {
    const res = await client.query(sqlPg, params)
    return res.rows
  } finally {
    await client.end()
  }
}

// ─── Express app ─────────────────────────────────────────────────────────────

const app = express()
app.use(cors())
app.use(express.json())

// Serve built frontend (supports env override for packaged Electron app)
const RENDERER_DIR = process.env.RENDERER_DIR || path.join(__dirname, '..', 'out', 'renderer')
if (fs.existsSync(RENDERER_DIR)) {
  app.use(express.static(RENDERER_DIR))
}

// Serve TTS audio cache
app.use('/tts-audio', express.static(TTS_CACHE_DIR))

// ─── Server-side TTS (Microsoft Edge Neural + SAPI fallback) ─────────────────

const { exec } = require('child_process')
const { MsEdgeTTS, OUTPUT_FORMAT, ProsodyOptions } = require('msedge-tts')

// Edge Neural TTS voices (requires internet, Microsoft Edge TTS service)
const EDGE_VOICES = [
  // ── Thai ──────────────────────────────────────────────────────────────────
  { name: 'th-TH-PremwadeeNeural',        label: '🇹🇭 เปรมวดี (ไทย หญิง) — Neural' },
  { name: 'th-TH-AcharaNeural',           label: '🇹🇭 อาจารา (ไทย หญิง) — Neural' },
  { name: 'th-TH-NiwatNeural',            label: '🇹🇭 นิวัตร (ไทย ชาย) — Neural' },
  // ── English (Female) ──────────────────────────────────────────────────────
  { name: 'en-US-JennyNeural',            label: '🇺🇸 Jenny (อังกฤษ หญิง) — Neural' },
  { name: 'en-US-AriaNeural',             label: '🇺🇸 Aria (อังกฤษ หญิง) — Neural' },
  { name: 'en-US-MichelleNeural',         label: '🇺🇸 Michelle (อังกฤษ หญิง) — Neural' },
  { name: 'en-GB-SoniaNeural',            label: '🇬🇧 Sonia (อังกฤษ UK หญิง) — Neural' },
  // ── English (Male) ────────────────────────────────────────────────────────
  { name: 'en-US-GuyNeural',              label: '🇺🇸 Guy (อังกฤษ ชาย) — Neural' },
]

function cleanTTSCache(exceptFile) {
  try {
    const now = Date.now()
    fs.readdirSync(TTS_CACHE_DIR).forEach(f => {
      if (f === exceptFile) return
      try {
        if (now - fs.statSync(path.join(TTS_CACHE_DIR, f)).mtimeMs > 8 * 60 * 60 * 1000)
          fs.unlinkSync(path.join(TTS_CACHE_DIR, f))
      } catch {}
    })
  } catch {}
}

// Edge Neural TTS generation (content-based cache: same text+voice+rate → instant return)
async function generateEdgeTTS(text, voiceName, rate) {
  const voice = voiceName || 'th-TH-AcharaNeural'
  const cacheKey = require('crypto').createHash('md5').update(`${voice}_${String(rate)}_${text}`).digest('hex')
  const filename = `tts_${cacheKey}.mp3`
  const filepath = path.join(TTS_CACHE_DIR, filename)

  if (fs.existsSync(filepath)) {
    console.log(`[EdgeTTS] cache hit → ${filename}`)
    return `/tts-audio/${filename}`
  }

  console.log(`[EdgeTTS] voice=${voice} rate=${rate} text="${text.slice(0, 40)}"`)
  const tts = new MsEdgeTTS()
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3)
  const prosody = new ProsodyOptions()
  prosody.rate = Number(rate)
  const { audioStream } = tts.toStream(text, prosody)

  await new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(filepath)
    audioStream.pipe(ws)
    ws.on('finish', () => { console.log(`[EdgeTTS] OK → ${filename}`); resolve() })
    ws.on('error', (e) => { console.error('[EdgeTTS] write error:', e.message); reject(e) })
    audioStream.on('error', (e) => { console.error('[EdgeTTS] stream error:', e.message); reject(e) })
  })
  cleanTTSCache(filename)
  return `/tts-audio/${filename}`
}

// SAPI fallback (Windows built-in voices)
function generateSAPITTS(text, voiceName, rate) {
  return new Promise((resolve, reject) => {
    const filename = `tts_${Date.now()}.wav`
    const filepath = path.join(TTS_CACHE_DIR, filename)
    const sapiRate = Math.max(-10, Math.min(10, Math.round((Number(rate) - 1) * 7)))
    const script = [
      'Add-Type -AssemblyName System.Speech',
      '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
      voiceName ? `$s.SelectVoice('${voiceName.replace(/'/g, "''")}')` : '',
      `$s.Rate = ${sapiRate}`,
      `$s.SetOutputToWaveFile('${filepath.replace(/\\/g, '\\\\')}')`,
      `$s.Speak('${text.replace(/'/g, "''")}')`,
      '$s.Dispose()'
    ].filter(Boolean).join('\n')
    const encoded = Buffer.from(script, 'utf16le').toString('base64')
    exec(`powershell -NoProfile -NonInteractive -EncodedCommand ${encoded}`,
      { timeout: 15000 },
      (err) => {
        if (err || !fs.existsSync(filepath)) return reject(err || new Error('WAV not created'))
        cleanTTSCache(filename)
        resolve(`/tts-audio/${filename}`)
      }
    )
  })
}

// Main TTS generator: Edge Neural first, SAPI as fallback
async function generateServerTTS(text, voiceName, rate) {
  const isEdgeVoice = EDGE_VOICES.some(v => v.name === voiceName) || !voiceName
  if (isEdgeVoice) {
    return generateEdgeTTS(text, voiceName || 'th-TH-AcharaNeural', rate)
  }
  return generateSAPITTS(text, voiceName, rate)
}

// Test Edge TTS connectivity — open in browser: /api/tts/test
app.get('/api/tts/test', async (req, res) => {
  const voice = req.query.voice || 'th-TH-PremwadeeNeural'
  const text = req.query.text || 'ทดสอบเสียงเปรมวดี'
  try {
    const url = await generateEdgeTTS(String(text), String(voice), 0.8)
    res.json({ success: true, url, voice, text })
  } catch (e) {
    res.json({ success: false, error: e.message, voice, text })
  }
})

// Pre-warm TTS cache for upcoming queues — respond immediately, generate in background
app.post('/api/tts/prewarm', (req, res) => {
  res.json({ success: true })
  const { queues = [], servicePoint = '', displayConfigId = '' } = req.body || {}
  try {
    const qdFile = displayConfigId ? qdConfigFile(displayConfigId) : QD_DEFAULT_FILE
    const qdCfg = fs.existsSync(qdFile)
      ? JSON.parse(fs.readFileSync(qdFile, 'utf-8'))
      : (fs.existsSync(QD_DEFAULT_FILE) ? JSON.parse(fs.readFileSync(QD_DEFAULT_FILE, 'utf-8')) : null)
    if (!qdCfg || !qdCfg.ttsEnabled || qdCfg.ttsSource !== 'server') return
    const voiceName = qdCfg.ttsServerVoiceName || qdCfg.ttsVoiceName || ''
    for (const q of queues.slice(0, 5)) {
      const text = (qdCfg.ttsShowName === true) && q.name
        ? [qdCfg.ttsPrefix1, q.name, qdCfg.ttsMiddle, String(servicePoint), qdCfg.ttsSuffix].filter(Boolean).join(' ')
        : [qdCfg.ttsPrefix1, q.no, qdCfg.ttsMiddle, String(servicePoint), qdCfg.ttsSuffix].filter(Boolean).join(' ')
      generateServerTTS(text, voiceName, qdCfg.ttsRate ?? 1)
        .then(() => console.log(`[TTS prewarm] ${q.no}`))
        .catch(() => {})
    }
  } catch {}
})

// Preview TTS — generate audio and return URL for immediate playback
app.post('/api/tts/preview', async (req, res) => {
  try {
    const { text = 'ทดสอบเสียง ขอเชิญลำดับ A001 ที่ช่อง 1 ค่ะ', voiceName = '', rate = 1 } = req.body || {}
    const audioUrl = await generateServerTTS(text, voiceName, rate)
    res.json({ success: true, audioUrl })
  } catch (e) {
    res.json({ success: false, message: e.message })
  }
})

// Return combined voice list: Edge Neural + SAPI
app.get('/api/tts/voices', (req, res) => {
  const script = [
    'Add-Type -AssemblyName System.Speech',
    '(New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name }'
  ].join('\n')
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  exec(`powershell -NoProfile -NonInteractive -EncodedCommand ${encoded}`,
    { timeout: 10000 },
    (err, stdout) => {
      const sapiVoices = err ? [] : stdout.split('\n').map(v => v.trim()).filter(Boolean)
      // Edge voices first (Thai Neural), then SAPI voices
      const edgeList = EDGE_VOICES.map(v => v.name)
      const combined = [...edgeList, ...sapiVoices.filter(v => !edgeList.includes(v))]
      res.json(combined)
    }
  )
})

// ─── API: Settings ────────────────────────────────────────────────────────────

app.get('/api/settings', (req, res) => {
  res.json(loadSettings())
})

app.post('/api/settings', (req, res) => {
  saveSettings(req.body)
  res.json({ success: true })
})

// ─── API: DB Test ─────────────────────────────────────────────────────────────

app.post('/api/db/test', async (req, res) => {
  try {
    const s = req.body
    if (s.type === 'mysql') {
      const conn = await mysql.createConnection({
        host: s.host, port: s.port, database: s.database,
        user: s.username, password: s.password, connectTimeout: 5000
      })
      await conn.ping()
      await conn.end()
    } else {
      const client = new PgClient({
        host: s.host, port: s.port, database: s.database,
        user: s.username, password: s.password, connectionTimeoutMillis: 5000
      })
      await client.connect()
      await client.end()
    }
    res.json({ success: true, message: 'เชื่อมต่อสำเร็จ' })
  } catch (e) {
    res.json({ success: false, message: e.message })
  }
})

// ─── API: Auth ────────────────────────────────────────────────────────────────

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body
  const settings = loadSettings()
  if (!settings) return res.json({ success: false, message: 'ยังไม่ได้ตั้งค่าการเชื่อมต่อ' })

  const hashed = md5(password).toLowerCase()

  try {
    const rows = await queryDB(
      settings,
      'SELECT officer_login_name, officer_login_password_md5 FROM officer WHERE officer_login_name = ? LIMIT 1',
      'SELECT officer_login_name, officer_login_password_md5 FROM officer WHERE officer_login_name = $1 LIMIT 1',
      [username]
    )
    if (!rows || rows.length === 0) return res.json({ success: false, message: 'ไม่พบชื่อผู้ใช้งาน' })
    const row = rows[0]
    if ((row.officer_login_password_md5 || '').toLowerCase() === hashed) {
      return res.json({ success: true, username: row.officer_login_name })
    }
    res.json({ success: false, message: 'รหัสผ่านไม่ถูกต้อง' })
  } catch (e) {
    res.json({ success: false, message: e.message })
  }
})

// ─── Queue status (today's calls, file-based) ─────────────────────────────────

const QUEUE_CALLS_FILE = path.join(DATA_DIR, 'queue-calls-today.json')
const SP_FILE = path.join(DATA_DIR, 'service-points.json')

function loadServicePoints() {
  try {
    if (fs.existsSync(SP_FILE)) {
      const data = JSON.parse(fs.readFileSync(SP_FILE, 'utf-8'))
      if (Array.isArray(data) && data.length > 0) return data
    }
  } catch {}
  return ['1','2','3','4','5','6'].map(n => ({ id: n, name: `ช่อง ${n}` }))
}
function saveServicePoints(data) {
  fs.writeFileSync(SP_FILE, JSON.stringify(data, null, 2))
}

function getTodayCalls() {
  const today = new Date().toISOString().split('T')[0]
  try {
    if (fs.existsSync(QUEUE_CALLS_FILE)) {
      const d = JSON.parse(fs.readFileSync(QUEUE_CALLS_FILE, 'utf-8'))
      if (d.date === today) return d.calls
    }
  } catch {}
  return {}
}

function saveTodayCalls(calls) {
  const today = new Date().toISOString().split('T')[0]
  fs.writeFileSync(QUEUE_CALLS_FILE, JSON.stringify({ date: today, calls }, null, 2))
}

// ─── HOSxP queue SQL (Slot mode — opd_qs_slot) ───────────────────────────────

const HOSXP_SQL_MYSQL = `
SELECT ov.vstdate, ov.vsttime,
    oq.opd_qs_room_name AS queue_type,
    os.queue_slot_number AS queue_slot,
    ov.oqueue AS queue_no,
    ov.vn,
    ov.hn,
    CONCAT(pt.fname, ' ', pt.lname) AS queue_name,
    p.name AS insurance,
    k.department,
    CASE
        WHEN EXISTS (SELECT 1 FROM oapp oa WHERE oa.visit_vn = ov.vn)
        THEN 'นัดมา' ELSE 'walkin'
    END AS visit_type
FROM opd_qs_slot os
LEFT JOIN ovst ov ON ov.vn = os.vn
LEFT JOIN patient pt ON pt.hn = ov.hn
LEFT JOIN pttype p ON p.pttype = ov.pttype
LEFT JOIN kskdepartment k ON k.depcode = ov.main_dep
LEFT JOIN opd_qs_room oq ON oq.opd_qs_room_id = os.opd_qs_room_id
WHERE ov.vstdate = ? AND ov.vn IS NOT NULL
ORDER BY k.department, os.queue_slot_number`

const HOSXP_SQL_PG = `
SELECT ov.vstdate, ov.vsttime,
    oq.opd_qs_room_name AS queue_type,
    os.queue_slot_number AS queue_slot,
    ov.oqueue AS queue_no,
    ov.vn,
    ov.hn,
    CONCAT(pt.fname, ' ', pt.lname) AS queue_name,
    p.name AS insurance,
    k.department,
    CASE
        WHEN EXISTS (SELECT 1 FROM oapp oa WHERE oa.visit_vn = ov.vn)
        THEN 'นัดมา' ELSE 'walkin'
    END AS visit_type
FROM opd_qs_slot os
LEFT JOIN ovst ov ON ov.vn = os.vn
LEFT JOIN patient pt ON pt.hn = ov.hn
LEFT JOIN pttype p ON p.pttype = ov.pttype
LEFT JOIN kskdepartment k ON k.depcode = ov.main_dep
LEFT JOIN opd_qs_room oq ON oq.opd_qs_room_id = os.opd_qs_room_id
WHERE ov.vstdate = $1 AND ov.vn IS NOT NULL
ORDER BY k.department, os.queue_slot_number`

// ─── HOSxP Queue + cur_dep (slot_cur mode) ────────────────────────────────────

const SLOT_CUR_SQL_MYSQL = `
SELECT ov.vstdate, ov.vsttime,
    oq.opd_qs_room_name AS queue_type,
    os.queue_slot_number AS queue_slot,
    ov.oqueue AS queue_no,
    ov.vn,
    ov.hn,
    CONCAT(pt.fname, ' ', pt.lname) AS queue_name,
    p.name AS insurance,
    k.department,
    CASE
        WHEN EXISTS (SELECT 1 FROM oapp oa WHERE oa.visit_vn = ov.vn)
        THEN 'นัดมา' ELSE 'walkin'
    END AS visit_type
FROM opd_qs_slot os
LEFT JOIN ovst ov ON ov.vn = os.vn
LEFT JOIN patient pt ON pt.hn = ov.hn
LEFT JOIN pttype p ON p.pttype = ov.pttype
LEFT JOIN kskdepartment k ON k.depcode = ov.cur_dep
LEFT JOIN opd_qs_room oq ON oq.opd_qs_room_id = os.opd_qs_room_id
WHERE os.schedule_date = ? AND ov.vn IS NOT NULL
ORDER BY k.department, os.queue_slot_number`

const SLOT_CUR_SQL_PG = `
SELECT ov.vstdate, ov.vsttime,
    oq.opd_qs_room_name AS queue_type,
    os.queue_slot_number AS queue_slot,
    ov.oqueue AS queue_no,
    ov.vn,
    ov.hn,
    CONCAT(pt.fname, ' ', pt.lname) AS queue_name,
    p.name AS insurance,
    k.department,
    CASE
        WHEN EXISTS (SELECT 1 FROM oapp oa WHERE oa.visit_vn = ov.vn)
        THEN 'นัดมา' ELSE 'walkin'
    END AS visit_type
FROM opd_qs_slot os
LEFT JOIN ovst ov ON ov.vn = os.vn
LEFT JOIN patient pt ON pt.hn = ov.hn
LEFT JOIN pttype p ON p.pttype = ov.pttype
LEFT JOIN kskdepartment k ON k.depcode = ov.cur_dep
LEFT JOIN opd_qs_room oq ON oq.opd_qs_room_id = os.opd_qs_room_id
WHERE os.schedule_date = $1 AND ov.vn IS NOT NULL
ORDER BY k.department, os.queue_slot_number`

// ─── OPD Visit SQL (OPD mode — ovst) ─────────────────────────────────────────

const OPD_SQL_MYSQL = `
SELECT ov.vstdate, ov.vsttime,
    ov.oqueue AS queue_no,
    ov.vn,
    ov.hn,
    CONCAT(pt.fname, ' ', pt.lname) AS queue_name,
    p.name AS insurance,
    k.department,
    CASE
        WHEN EXISTS (SELECT 1 FROM oapp oa WHERE oa.visit_vn = ov.vn)
        THEN 'นัดมา' ELSE 'walkin'
    END AS visit_type
FROM ovst ov
LEFT JOIN patient pt ON pt.hn = ov.hn
LEFT JOIN pttype p ON p.pttype = ov.pttype
LEFT JOIN kskdepartment k ON k.depcode = ov.main_dep
WHERE ov.vstdate = ?
ORDER BY k.department, ov.oqueue`

const OPD_SQL_PG = `
SELECT ov.vstdate, ov.vsttime,
    ov.oqueue AS queue_no,
    ov.vn,
    ov.hn,
    CONCAT(pt.fname, ' ', pt.lname) AS queue_name,
    p.name AS insurance,
    k.department,
    CASE
        WHEN EXISTS (SELECT 1 FROM oapp oa WHERE oa.visit_vn = ov.vn)
        THEN 'นัดมา' ELSE 'walkin'
    END AS visit_type
FROM ovst ov
LEFT JOIN patient pt ON pt.hn = ov.hn
LEFT JOIN pttype p ON p.pttype = ov.pttype
LEFT JOIN kskdepartment k ON k.depcode = ov.main_dep
WHERE ov.vstdate = $1
ORDER BY k.department, ov.oqueue`

// ─── Current Department SQL (cur_dep mode — ห้องตรวจปัจจุบัน) ────────────────

const CUR_DEP_SQL_MYSQL = `
SELECT ov.vstdate, ov.vsttime,
    ov.oqueue AS queue_no,
    ov.vn,
    ov.hn,
    CONCAT(pt.fname, ' ', pt.lname) AS queue_name,
    p.name AS insurance,
    k.department,
    CASE
        WHEN EXISTS (SELECT 1 FROM oapp oa WHERE oa.visit_vn = ov.vn)
        THEN 'นัดมา' ELSE 'walkin'
    END AS visit_type
FROM ovst ov
LEFT JOIN patient pt ON pt.hn = ov.hn
LEFT JOIN pttype p ON p.pttype = ov.pttype
LEFT JOIN kskdepartment k ON k.depcode = ov.cur_dep
WHERE ov.vstdate = ?
ORDER BY k.department, ov.oqueue`

const CUR_DEP_SQL_PG = `
SELECT ov.vstdate, ov.vsttime,
    ov.oqueue AS queue_no,
    ov.vn,
    ov.hn,
    CONCAT(pt.fname, ' ', pt.lname) AS queue_name,
    p.name AS insurance,
    k.department,
    CASE
        WHEN EXISTS (SELECT 1 FROM oapp oa WHERE oa.visit_vn = ov.vn)
        THEN 'นัดมา' ELSE 'walkin'
    END AS visit_type
FROM ovst ov
LEFT JOIN patient pt ON pt.hn = ov.hn
LEFT JOIN pttype p ON p.pttype = ov.pttype
LEFT JOIN kskdepartment k ON k.depcode = ov.cur_dep
WHERE ov.vstdate = $1
ORDER BY k.department, ov.oqueue`

function getSQLByMode(mode) {
  if (mode === 'opd')      return { mysql: OPD_SQL_MYSQL,      pg: OPD_SQL_PG }
  if (mode === 'cur_dep')  return { mysql: CUR_DEP_SQL_MYSQL,  pg: CUR_DEP_SQL_PG }
  if (mode === 'slot_cur') return { mysql: SLOT_CUR_SQL_MYSQL, pg: SLOT_CUR_SQL_PG }
  return { mysql: HOSXP_SQL_MYSQL, pg: HOSXP_SQL_PG }
}

function getTodayDate() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function toLocalDateStr(val) {
  if (!val) return null
  const d = new Date(val)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ─── Lab / X-ray status SQL (loaded separately after queue list) ─────────────

const LAB_XRAY_SQL_MYSQL = `
SELECT ov.vn,
    (SELECT MAX(lab_receive) FROM lab_head WHERE vn = ov.vn) AS lab_receive,
    (SELECT MAX(confirm_report) FROM lab_head WHERE vn = ov.vn) AS confirm_report,
    (SELECT MAX(confirm) FROM xray_report WHERE vn = ov.vn) AS xray_confirm,
    (SELECT MAX(confirm_radiology) FROM xray_report WHERE vn = ov.vn) AS xray_confirm_radiology
FROM ovst ov
WHERE ov.vstdate = ?`

const LAB_XRAY_SQL_PG = `
SELECT ov.vn,
    (SELECT MAX(lab_receive) FROM lab_head WHERE vn = ov.vn) AS lab_receive,
    (SELECT MAX(confirm_report) FROM lab_head WHERE vn = ov.vn) AS confirm_report,
    (SELECT MAX(confirm) FROM xray_report WHERE vn = ov.vn) AS xray_confirm,
    (SELECT MAX(confirm_radiology) FROM xray_report WHERE vn = ov.vn) AS xray_confirm_radiology
FROM ovst ov
WHERE ov.vstdate = $1`

// ─── API: Queue ───────────────────────────────────────────────────────────────

app.get('/api/queue/list', async (req, res) => {
  const settings = loadSettings()
  if (!settings) return res.json({ success: false, data: [] })
  try {
    const mode = ['opd', 'cur_dep', 'slot_cur'].includes(req.query.mode) ? req.query.mode : 'slot'
    const { mysql, pg } = getSQLByMode(mode)
    const today = getTodayDate()
    const rows = await queryDB(settings, mysql, pg, [today])
    const calls = getTodayCalls()
    const data = rows.map(r => {
      const call = calls[r.vn]
      // cur_dep / slot_cur modes: only show status from calls made via the same mode
      const isCurMode = mode === 'cur_dep' || mode === 'slot_cur'
      const effectiveStatus = (isCurMode && call && call.mode !== mode)
        ? 'waiting'
        : (call?.status || 'waiting')
      const effectiveSP = (isCurMode && call && call.mode !== mode)
        ? ''
        : (call?.servicePoint || '')
      return {
        ...r,
        vstdate: toLocalDateStr(r.vstdate),
        queue_slot: r.queue_slot != null ? String(r.queue_slot) : null,
        queue_no: r.queue_no != null ? String(r.queue_no) : '',
        status: effectiveStatus,
        service_point: effectiveSP
      }
    })
    res.json({ success: true, data })
  } catch (e) {
    res.json({ success: false, data: [], message: e.message })
  }
})

// Lab & X-ray status — separate slow endpoint, loaded in background after queue list
app.get('/api/queue/lab-xray', async (req, res) => {
  const settings = loadSettings()
  if (!settings) return res.json({ success: false, data: {} })
  try {
    const today = getTodayDate()
    const rows = await queryDB(settings, LAB_XRAY_SQL_MYSQL, LAB_XRAY_SQL_PG, [today])
    // Return as { vn: { lab_receive, confirm_report, xray_confirm, xray_confirm_radiology } }
    const data = {}
    for (const r of rows) {
      if (r.lab_receive || r.confirm_report || r.xray_confirm || r.xray_confirm_radiology) {
        data[r.vn] = {
          lab_receive: r.lab_receive || null,
          confirm_report: r.confirm_report || null,
          xray_confirm: r.xray_confirm || null,
          xray_confirm_radiology: r.xray_confirm_radiology || null,
        }
      }
    }
    res.json({ success: true, data })
  } catch (e) {
    res.json({ success: false, data: {}, message: e.message })
  }
})

app.post('/api/queue/call', async (req, res) => {
  const { identifier, servicePoint, mode, displayConfigId } = req.body
  const settings = loadSettings()
  if (!settings) return res.json({ success: false, message: 'ไม่มีการตั้งค่า' })
  try {
    const qMode = ['opd', 'cur_dep', 'slot_cur'].includes(mode) ? mode : 'slot'
    const { mysql, pg } = getSQLByMode(qMode)
    const today = getTodayDate()
    const rows = await queryDB(settings, mysql, pg, [today])
    const id = String(identifier).trim()
    const found = rows.find(r =>
      String(r.vn) === id ||
      String(r.queue_no || '') === id ||
      String(r.queue_slot || '') === id ||
      String(r.hn || '') === id
    )
    if (!found) return res.json({ success: false, message: `ไม่พบคิว: ${identifier}` })

    const displayNo = found.queue_slot || (found.queue_no != null ? String(found.queue_no) : '')
    const calls = getTodayCalls()
    const department = found.department || ''
    calls[found.vn] = {
      status: 'calling',
      servicePoint: String(servicePoint),
      calledAt: new Date().toLocaleTimeString('th-TH'),
      queueNo: displayNo,
      mode: qMode,
      department
    }
    saveTodayCalls(calls)

    const queueName = found.queue_name || ''

    // Respond and broadcast queue number immediately — don't wait for TTS
    broadcast({ type: 'queue:called', data: { queueNo: displayNo, servicePoint: String(servicePoint), audioUrl: null, displayConfigId: displayConfigId || null, queueName, department } })
    res.json({ success: true, queueNo: displayNo, queueSlot: found.queue_slot })

    // Generate TTS async in background, broadcast audio when ready
    try {
      const qdFile = displayConfigId ? qdConfigFile(displayConfigId) : QD_DEFAULT_FILE
      const qdCfg = fs.existsSync(qdFile)
        ? JSON.parse(fs.readFileSync(qdFile, 'utf-8'))
        : (fs.existsSync(QD_DEFAULT_FILE) ? JSON.parse(fs.readFileSync(QD_DEFAULT_FILE, 'utf-8')) : null)
      if (qdCfg && qdCfg.ttsEnabled && qdCfg.ttsSource === 'server') {
        // เมื่อเปิดประกาศชื่อ: อ่านชื่อเต็ม (fname + lname) ตามที่ตั้งค่าในจอแสดงผล
        const ttsName = queueName || ''
        const text = (qdCfg.ttsShowName === true) && ttsName
          ? [qdCfg.ttsPrefix1, ttsName, qdCfg.ttsMiddle, String(servicePoint), qdCfg.ttsSuffix].filter(Boolean).join(' ')
          : [qdCfg.ttsPrefix1, displayNo, qdCfg.ttsMiddle, String(servicePoint), qdCfg.ttsSuffix].filter(Boolean).join(' ')
        const voiceName = qdCfg.ttsServerVoiceName || qdCfg.ttsVoiceName || ''
        generateServerTTS(text, voiceName, qdCfg.ttsRate ?? 1).then(audioUrl => {
          broadcast({ type: 'queue:audio', data: { audioUrl, displayConfigId: displayConfigId || null, department } })
          // Pre-warm TTS cache for next 3 waiting queues so they play instantly
          try {
            const currentCalls = getTodayCalls()
            const waitingNext = rows
              .filter(r => r.vn !== found.vn && (!currentCalls[r.vn] || currentCalls[r.vn].status === 'waiting'))
              .slice(0, 3)
            for (const next of waitingNext) {
              const nextNo = next.queue_slot || (next.queue_no != null ? String(next.queue_no) : '')
              const nextName = next.queue_name || ''
              const nextText = (qdCfg.ttsShowName === true) && nextName
                ? [qdCfg.ttsPrefix1, nextName, qdCfg.ttsMiddle, String(servicePoint), qdCfg.ttsSuffix].filter(Boolean).join(' ')
                : [qdCfg.ttsPrefix1, nextNo, qdCfg.ttsMiddle, String(servicePoint), qdCfg.ttsSuffix].filter(Boolean).join(' ')
              generateServerTTS(nextText, voiceName, qdCfg.ttsRate ?? 1)
                .then(() => console.log(`[TTS prewarm] ${nextNo}`))
                .catch(() => {})
            }
          } catch {}
        }).catch(err => console.error('[TTS async]', err.message))
      }
    } catch (ttsErr) {
      console.error('[TTS config]', ttsErr.message)
    }
  } catch (e) {
    res.json({ success: false, message: e.message })
  }
})

// Returns queue entries filtered by status and optionally by mode
app.get('/api/queue/calls-today', (req, res) => {
  const calls = getTodayCalls()
  const modeFilter = req.query.mode || null
  const result = Object.entries(calls)
    .filter(([, v]) => {
      if (!v.calledAt) return false
      if (modeFilter === 'cur_dep') return v.mode === 'cur_dep'
      if (modeFilter === 'slot_cur') return v.mode === 'slot_cur'
      if (modeFilter) return !v.mode || (v.mode !== 'cur_dep' && v.mode !== 'slot_cur')
      return true
    })
    .map(([vn, v]) => ({ vn, ...v }))
  res.json(result)
})

app.post('/api/queue/status', (req, res) => {
  // Update status manually (done / skip / waiting / noshow)
  const { vn, status } = req.body
  if (!vn || !status) return res.json({ success: false })
  const calls = getTodayCalls()
  calls[vn] = { ...(calls[vn] || {}), status }
  saveTodayCalls(calls)
  broadcast({ type: 'queue:status', data: { vn, status, ...(calls[vn] || {}) } })
  res.json({ success: true })
})

// ─── API: Display config broadcast ───────────────────────────────────────────

app.post('/api/display/config', (req, res) => {
  broadcast({ type: 'display:config', data: req.body })
  res.json({ success: true })
})

// ─── API: Clear display queues ────────────────────────────────────────────────

app.post('/api/display/clear', (req, res) => {
  const { displayConfigId } = req.body
  broadcast({ type: 'queue:clear', data: { displayConfigId: displayConfigId || null } })
  res.json({ success: true })
})

// ─── QD default config (persisted system default) ────────────────────────────

const QD_DEFAULT_FILE = path.join(DATA_DIR, 'qd-default-config.json')

app.get('/api/display/qd-default', (req, res) => {
  try {
    if (fs.existsSync(QD_DEFAULT_FILE))
      return res.json(JSON.parse(fs.readFileSync(QD_DEFAULT_FILE, 'utf-8')))
  } catch {}
  res.json(null)
})

app.post('/api/display/qd-default', (req, res) => {
  try {
    fs.writeFileSync(QD_DEFAULT_FILE, JSON.stringify(req.body, null, 2), 'utf-8')
    res.json({ success: true })
  } catch (e) {
    res.json({ success: false, message: e.message })
  }
})

// ─── Per-display QD config (isolated per display ID) ─────────────────────────

function qdConfigFile(id) {
  return path.join(DATA_DIR, `qd-config-${id}.json`)
}

app.get('/api/display/qd-config/:id', (req, res) => {
  try {
    const f = qdConfigFile(req.params.id)
    if (fs.existsSync(f)) return res.json(JSON.parse(fs.readFileSync(f, 'utf-8')))
    // Fall back to global default if no per-display config yet
    if (fs.existsSync(QD_DEFAULT_FILE))
      return res.json(JSON.parse(fs.readFileSync(QD_DEFAULT_FILE, 'utf-8')))
  } catch {}
  res.json(null)
})

app.post('/api/display/qd-config/:id', (req, res) => {
  try {
    fs.writeFileSync(qdConfigFile(req.params.id), JSON.stringify(req.body, null, 2), 'utf-8')
    res.json({ success: true })
  } catch (e) {
    res.json({ success: false, message: e.message })
  }
})

// ─── API: Display configs CRUD ────────────────────────────────────────────────

app.get('/api/display/configs', (req, res) => {
  res.json(loadDisplayConfigs())
})

app.get('/api/display/configs/:id', (req, res) => {
  const cfg = loadDisplayConfigs().find(c => c.id === req.params.id)
  if (!cfg) return res.status(404).json({ error: 'Not found' })
  res.json(cfg)
})

app.post('/api/display/configs', (req, res) => {
  const configs = loadDisplayConfigs()
  const item = { ...req.body, id: Date.now().toString() }
  configs.push(item)
  saveDisplayConfigs(configs)
  res.json({ success: true, data: item })
})

app.put('/api/display/configs/:id', (req, res) => {
  const configs = loadDisplayConfigs()
  const idx = configs.findIndex(c => c.id === req.params.id)
  if (idx === -1) return res.json({ success: false, message: 'ไม่พบข้อมูล' })
  configs[idx] = { ...req.body, id: req.params.id }
  saveDisplayConfigs(configs)
  res.json({ success: true })
})

app.delete('/api/display/configs/:id', (req, res) => {
  const configs = loadDisplayConfigs().filter(c => c.id !== req.params.id)
  saveDisplayConfigs(configs)
  res.json({ success: true })
})

// ─── API: System fonts ────────────────────────────────────────────────────────

app.get('/api/system/fonts', (req, res) => {
  const { exec } = require('child_process')
  exec(
    `powershell -NoProfile -Command "[System.Reflection.Assembly]::LoadWithPartialName('System.Drawing') | Out-Null; [System.Drawing.FontFamily]::Families | ForEach-Object { $_.Name }"`,
    { timeout: 10000 },
    (err, stdout) => {
      if (err) {
        return res.json(['Arial', 'Tahoma', 'Sarabun', 'Prompt', 'Kanit', 'Angsana New', 'CordiaNew', 'TH SarabunPSK'])
      }
      const fonts = stdout.split('\n').map(f => f.trim()).filter(Boolean)
      res.json(fonts)
    }
  )
})

// ─── Service Points CRUD ──────────────────────────────────────────────────────

app.get('/api/service-points', (req, res) => {
  res.json(loadServicePoints())
})

app.post('/api/service-points', (req, res) => {
  const { name } = req.body
  if (!name?.trim()) return res.json({ success: false, message: 'กรุณาระบุชื่อช่องบริการ' })
  const data = loadServicePoints()
  const id = Date.now().toString()
  data.push({ id, name: name.trim() })
  saveServicePoints(data)
  res.json({ success: true, data: { id, name: name.trim() } })
})

app.put('/api/service-points/:id', (req, res) => {
  const { name } = req.body
  if (!name?.trim()) return res.json({ success: false, message: 'กรุณาระบุชื่อ' })
  const data = loadServicePoints()
  const idx = data.findIndex(sp => sp.id === req.params.id)
  if (idx === -1) return res.json({ success: false, message: 'ไม่พบช่องบริการ' })
  data[idx].name = name.trim()
  saveServicePoints(data)
  res.json({ success: true })
})

app.delete('/api/service-points/:id', (req, res) => {
  const data = loadServicePoints().filter(sp => sp.id !== req.params.id)
  saveServicePoints(data)
  res.json({ success: true })
})

// ─── Shortcut: download .url file ────────────────────────────────────────────
app.get('/api/shortcut/download', (req, res) => {
  try {
    const { name, url } = req.query
    if (!name || !url) return res.status(400).send('name and url required')
    const filename = `${name}.url`
    const content = `[InternetShortcut]\r\nURL=${url}\r\n`
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
    res.send(content)
  } catch (e) {
    res.status(500).send(e.message)
  }
})

// ─── Shortcut: บันทึก .url ลง Desktop ของ HOST ──────────────────────────────
app.post('/api/shortcut/desktop', (req, res) => {
  try {
    const { name, url } = req.body
    if (!name || !url) return res.json({ success: false, message: 'name and url required' })
    const os = require('os')
    const desktop = path.join(os.homedir(), 'Desktop')
    const filename = `${name}.url`
    const content = `[InternetShortcut]\r\nURL=${url}\r\n`
    fs.writeFileSync(path.join(desktop, filename), content, 'utf-8')
    res.json({ success: true, filename })
  } catch (e) {
    res.json({ success: false, message: e.message })
  }
})

// ─── Server IP ───────────────────────────────────────────────────────────────
app.get('/api/server-ip', (req, res) => {
  const os = require('os')
  const nets = os.networkInterfaces()
  let ip = null
  for (const iface of Object.values(nets)) {
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) { ip = addr.address; break }
    }
    if (ip) break
  }
  res.json({ ip: ip || 'localhost', port: PORT })
})

// Fallback: serve index.html for SPA routing (Express 4 & 5 compatible)
app.use((req, res) => {
  const indexFile = path.join(RENDERER_DIR, 'index.html')
  if (fs.existsSync(indexFile)) {
    res.sendFile(indexFile)
  } else {
    res.status(404).send('Build the renderer first: npm run build')
  }
})

// ─── WebSocket ────────────────────────────────────────────────────────────────

const server = http.createServer(app)
const wss = new WebSocketServer({ server })

const clients = new Set()

wss.on('connection', (ws) => {
  clients.add(ws)
  ws.on('close', () => clients.delete(ws))
  ws.on('error', () => clients.delete(ws))
})

function broadcast(data) {
  const msg = JSON.stringify(data)
  for (const client of clients) {
    if (client.readyState === 1) { // OPEN
      client.send(msg)
    }
  }
}

// ─── Midnight reset ───────────────────────────────────────────────────────────

function scheduleMidnightReset() {
  const now = new Date()
  const nextMidnight = new Date(now)
  nextMidnight.setHours(24, 0, 0, 0)
  const delay = nextMidnight - now

  setTimeout(() => {
    try {
      saveTodayCalls({})
      console.log(`[Midnight Reset] ${new Date().toLocaleString('th-TH')} — cleared queue-calls-today.json`)
    } catch (e) {
      console.error('[Midnight Reset] Error:', e.message)
    }
    scheduleMidnightReset()
  }, delay)

  console.log(`[Midnight Reset] Scheduled in ${Math.round(delay / 1000)}s (${nextMidnight.toLocaleString('th-TH')})`)
}

// ─── Start ────────────────────────────────────────────────────────────────────

function startServer() {
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`\n  Port ${PORT} ถูกใช้งานอยู่แล้ว กรุณาปิดโปรแกรมอื่นหรือเปลี่ยน PORT\n`)
    } else {
      console.error('Server error:', e.message)
    }
    process.exit(1)
  })

  server.listen(PORT, () => {
    console.log(`\n  Queue OPD Server`)
    console.log(`  ─────────────────────────────────`)
    console.log(`  ➜  Local:   http://localhost:${PORT}`)
    console.log(`  ─────────────────────────────────\n`)
    scheduleMidnightReset()
  })

  return server
}

if (require.main === module) {
  startServer()
  // Auto-open browser only in standalone (non-Electron) mode
  const open = { win32: 'start', darwin: 'open', linux: 'xdg-open' }[process.platform] || 'start'
  exec(`${open} http://localhost:${PORT}`)
}

module.exports = { startServer }
