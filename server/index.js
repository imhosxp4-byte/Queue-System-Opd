// Queue OPD — Express + WebSocket server (Browser mode)
'use strict'

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
const DATA_DIR = path.join(__dirname, '..', 'data')
const SETTINGS_FILE = path.join(DATA_DIR, 'db-settings.json')
const DISPLAY_CONFIGS_FILE = path.join(DATA_DIR, 'display-configs.json')

// Ensure data dir exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

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

async function getConnection(settings) {
  if (!settings) throw new Error('ยังไม่ได้ตั้งค่าการเชื่อมต่อ')
  if (settings.type === 'mysql') {
    const conn = await mysql.createConnection({
      host: settings.host, port: settings.port,
      database: settings.database, user: settings.username,
      password: settings.password, connectTimeout: 5000
    })
    return { type: 'mysql', conn }
  }
  const client = new PgClient({
    host: settings.host, port: settings.port,
    database: settings.database, user: settings.username,
    password: settings.password, connectionTimeoutMillis: 5000
  })
  await client.connect()
  return { type: 'pg', conn: client }
}

async function queryDB(settings, sql, sqlPg, params) {
  const { type, conn } = await getConnection(settings)
  try {
    if (type === 'mysql') {
      const [rows] = await conn.execute(sql, params)
      await conn.end()
      return rows
    }
    const res = await conn.query(sqlPg, params)
    await conn.end()
    return res.rows
  } catch (e) {
    try { await conn.end() } catch {}
    throw e
  }
}

// ─── Express app ─────────────────────────────────────────────────────────────

const app = express()
app.use(cors())
app.use(express.json())

// Serve built frontend
const RENDERER_DIR = path.join(__dirname, '..', 'out', 'renderer')
if (fs.existsSync(RENDERER_DIR)) {
  app.use(express.static(RENDERER_DIR))
}

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
    if (fs.existsSync(SP_FILE)) return JSON.parse(fs.readFileSync(SP_FILE, 'utf-8'))
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
    CONCAT(pt.pname, pt.fname, ' ', pt.lname) AS queue_name,
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
    CONCAT(pt.pname, pt.fname, ' ', pt.lname) AS queue_name,
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

// ─── OPD Visit SQL (OPD mode — ovst) ─────────────────────────────────────────

const OPD_SQL_MYSQL = `
SELECT ov.vstdate, ov.vsttime,
    ov.oqueue AS queue_no,
    ov.vn,
    ov.hn,
    CONCAT(pt.pname, pt.fname, ' ', pt.lname) AS queue_name,
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
    CONCAT(pt.pname, pt.fname, ' ', pt.lname) AS queue_name,
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

function getSQLByMode(mode) {
  return mode === 'opd'
    ? { mysql: OPD_SQL_MYSQL, pg: OPD_SQL_PG }
    : { mysql: HOSXP_SQL_MYSQL, pg: HOSXP_SQL_PG }
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

// ─── API: Queue ───────────────────────────────────────────────────────────────

app.get('/api/queue/list', async (req, res) => {
  const settings = loadSettings()
  if (!settings) return res.json({ success: false, data: [] })
  try {
    const mode = req.query.mode === 'opd' ? 'opd' : 'slot'
    const { mysql, pg } = getSQLByMode(mode)
    const today = getTodayDate()
    const rows = await queryDB(settings, mysql, pg, [today])
    const calls = getTodayCalls()
    const data = rows.map(r => ({
      ...r,
      vstdate: toLocalDateStr(r.vstdate),
      queue_slot: r.queue_slot != null ? String(r.queue_slot) : null,
      queue_no: r.queue_no != null ? String(r.queue_no) : '',
      status: calls[r.vn]?.status || 'waiting',
      service_point: calls[r.vn]?.servicePoint || ''
    }))
    res.json({ success: true, data })
  } catch (e) {
    res.json({ success: false, data: [], message: e.message })
  }
})

app.post('/api/queue/call', async (req, res) => {
  const { identifier, servicePoint, mode } = req.body
  const settings = loadSettings()
  if (!settings) return res.json({ success: false, message: 'ไม่มีการตั้งค่า' })
  try {
    const qMode = mode === 'opd' ? 'opd' : 'slot'
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
    calls[found.vn] = {
      status: 'calling',
      servicePoint: String(servicePoint),
      calledAt: new Date().toLocaleTimeString('th-TH'),
      queueNo: displayNo
    }
    saveTodayCalls(calls)

    broadcast({ type: 'queue:called', data: { queueNo: displayNo, servicePoint: String(servicePoint) } })
    res.json({ success: true, queueNo: displayNo, queueSlot: found.queue_slot })
  } catch (e) {
    res.json({ success: false, message: e.message })
  }
})

// Returns queue entries with status='skip' (เรียกแล้วไม่มา panel)
app.get('/api/queue/calls-today', (req, res) => {
  const calls = getTodayCalls()
  const result = Object.entries(calls)
    .filter(([, v]) => v.status === 'skip')
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

// ─── API: Display configs CRUD ────────────────────────────────────────────────

app.get('/api/display/configs', (req, res) => {
  res.json(loadDisplayConfigs())
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

server.listen(PORT, () => {
  console.log(`\n  Queue OPD Server`)
  console.log(`  ─────────────────────────────────`)
  console.log(`  ➜  Local:   http://localhost:${PORT}`)
  console.log(`  ─────────────────────────────────`)
  console.log(`  เปิด Chrome/Edge แล้วไปที่ http://localhost:${PORT}\n`)

  // Auto-open browser
  const open = { win32: 'start', darwin: 'open', linux: 'xdg-open' }[process.platform] || 'start'
  const { exec } = require('child_process')
  exec(`${open} http://localhost:${PORT}`)

  scheduleMidnightReset()
})

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} ถูกใช้งานอยู่แล้ว กรุณาปิดโปรแกรมอื่นหรือเปลี่ยน PORT\n`)
  } else {
    console.error('Server error:', e.message)
  }
  process.exit(1)
})
