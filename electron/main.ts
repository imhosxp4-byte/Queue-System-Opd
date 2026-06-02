import { app, BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'path'
import { exec } from 'child_process'
import * as fs from 'fs'
import * as mysql from 'mysql2/promise'
import { Client as PgClient } from 'pg'
import md5 from 'md5'

interface DbSettings {
  type: 'mysql' | 'postgresql'
  host: string
  port: number
  database: string
  username: string
  password: string
}

function getSettingsFile(): string {
  return join(app.getPath('userData'), 'db-settings.json')
}

function loadSettings(): DbSettings | null {
  try {
    const file = getSettingsFile()
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf-8')
      return JSON.parse(raw)
    }
  } catch {}
  return null
}

function saveSettings(settings: DbSettings): void {
  fs.writeFileSync(getSettingsFile(), JSON.stringify(settings, null, 2), 'utf-8')
}

let mainWindow: BrowserWindow | null = null
let displayWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: 'Queue OPD',
    titleBarStyle: 'default',
    show: false
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    displayWindow?.close()
  })
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ─── IPC: Settings ───────────────────────────────────────────────────────────

ipcMain.handle('settings:load', () => loadSettings())

ipcMain.handle('settings:save', (_e, settings: DbSettings) => {
  saveSettings(settings)
  return { success: true }
})

// ─── IPC: Database test ───────────────────────────────────────────────────────

ipcMain.handle('db:test', async (_e, settings: DbSettings) => {
  try {
    if (settings.type === 'mysql') {
      const conn = await mysql.createConnection({
        host: settings.host,
        port: settings.port,
        database: settings.database,
        user: settings.username,
        password: settings.password,
        connectTimeout: 5000
      })
      await conn.ping()
      await conn.end()
    } else {
      const client = new PgClient({
        host: settings.host,
        port: settings.port,
        database: settings.database,
        user: settings.username,
        password: settings.password,
        connectionTimeoutMillis: 5000
      })
      await client.connect()
      await client.end()
    }
    return { success: true, message: 'เชื่อมต่อสำเร็จ' }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, message: msg }
  }
})

// ─── IPC: Login ───────────────────────────────────────────────────────────────

ipcMain.handle('auth:login', async (_e, username: string, password: string) => {
  const settings = loadSettings()
  if (!settings) return { success: false, message: 'ยังไม่ได้ตั้งค่าการเชื่อมต่อฐานข้อมูล' }

  const hashedInput = md5(password)

  try {
    let row: { officer_login_name: string; officer_login_password_md5: string } | undefined

    if (settings.type === 'mysql') {
      const conn = await mysql.createConnection({
        host: settings.host,
        port: settings.port,
        database: settings.database,
        user: settings.username,
        password: settings.password,
        connectTimeout: 5000
      })
      const [rows] = await conn.execute(
        'SELECT officer_login_name, officer_login_password_md5 FROM officer WHERE officer_login_name = ? LIMIT 1',
        [username]
      )
      await conn.end()
      const arr = rows as { officer_login_name: string; officer_login_password_md5: string }[]
      row = arr[0]
    } else {
      const client = new PgClient({
        host: settings.host,
        port: settings.port,
        database: settings.database,
        user: settings.username,
        password: settings.password,
        connectionTimeoutMillis: 5000
      })
      await client.connect()
      const res = await client.query(
        'SELECT officer_login_name, officer_login_password_md5 FROM officer WHERE officer_login_name = $1 LIMIT 1',
        [username]
      )
      await client.end()
      row = res.rows[0]
    }

    if (!row) return { success: false, message: 'ไม่พบชื่อผู้ใช้งาน' }

    const storedHash = row.officer_login_password_md5.toLowerCase()
    if (storedHash === hashedInput.toLowerCase()) {
      return { success: true, username: row.officer_login_name }
    }
    return { success: false, message: 'รหัสผ่านไม่ถูกต้อง' }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, message: `เกิดข้อผิดพลาด: ${msg}` }
  }
})

// ─── Queue status helpers (today's calls) ────────────────────────────────────

interface QueueCallEntry {
  status: string; servicePoint: string; calledAt: string; queueNo: string
}

function getQueueCallsFile(): string {
  return join(app.getPath('userData'), 'queue-calls-today.json')
}

function getTodayCalls(): Record<string, QueueCallEntry> {
  const today = new Date().toISOString().split('T')[0]
  try {
    const file = getQueueCallsFile()
    if (fs.existsSync(file)) {
      const d = JSON.parse(fs.readFileSync(file, 'utf-8'))
      if (d.date === today) return d.calls
    }
  } catch {}
  return {}
}

function saveTodayCalls(calls: Record<string, QueueCallEntry>): void {
  const today = new Date().toISOString().split('T')[0]
  fs.writeFileSync(getQueueCallsFile(), JSON.stringify({ date: today, calls }, null, 2))
}

const HOSXP_SQL = `
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
WHERE os.schedule_date = CURRENT_DATE AND ov.vn IS NOT NULL
ORDER BY k.department, os.queue_slot_number`

async function runHosxpQuery(settings: DbSettings): Promise<unknown[]> {
  if (settings.type === 'mysql') {
    const conn = await mysql.createConnection({
      host: settings.host, port: settings.port,
      database: settings.database, user: settings.username, password: settings.password
    })
    const [rows] = await conn.execute(HOSXP_SQL)
    await conn.end()
    return rows as unknown[]
  }
  const client = new PgClient({
    host: settings.host, port: settings.port,
    database: settings.database, user: settings.username, password: settings.password
  })
  await client.connect()
  const res = await client.query(HOSXP_SQL)
  await client.end()
  return res.rows
}

// ─── IPC: Queue data ──────────────────────────────────────────────────────────

ipcMain.handle('queue:getList', async () => {
  const settings = loadSettings()
  if (!settings) return { success: false, data: [] }
  try {
    const rawRows = await runHosxpQuery(settings)
    const calls = getTodayCalls()
    const data = (rawRows as Record<string, unknown>[]).map(r => ({
      ...r,
      queue_slot: r['queue_slot'] != null ? String(r['queue_slot']) : null,
      queue_no: r['queue_no'] != null ? String(r['queue_no']) : (r['queue_slot'] != null ? String(r['queue_slot']) : ''),
      status: calls[r['vn'] as string]?.status || 'waiting',
      service_point: calls[r['vn'] as string]?.servicePoint || ''
    }))
    return { success: true, data }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, data: [], message: msg }
  }
})

ipcMain.handle('queue:call', async (_e, identifier: string, servicePoint: string) => {
  const settings = loadSettings()
  if (!settings) return { success: false }
  try {
    const rawRows = await runHosxpQuery(settings) as Record<string, unknown>[]
    const id = String(identifier).trim()
    const found = rawRows.find(r =>
      String(r['vn']) === id ||
      String(r['queue_no'] || '') === id ||
      String(r['queue_slot']) === id
    )
    if (!found) return { success: false, message: `ไม่พบคิว: ${identifier}` }

    const calls = getTodayCalls()
    const displayNo = String(found['queue_no'] || found['queue_slot'])
    calls[found['vn'] as string] = {
      status: 'calling',
      servicePoint: String(servicePoint),
      calledAt: new Date().toLocaleTimeString('th-TH'),
      queueNo: displayNo
    }
    saveTodayCalls(calls)

    mainWindow?.webContents.send('queue:called', { queueNo: displayNo, servicePoint })
    displayWindow?.webContents.send('queue:called', { queueNo: displayNo, servicePoint })
    return { success: true, queueNo: displayNo, queueSlot: found['queue_slot'] }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, message: msg }
  }
})

ipcMain.handle('queue:status', (_e, vn: string, status: string) => {
  const calls = getTodayCalls()
  calls[vn] = { ...(calls[vn] || { servicePoint: '', calledAt: '', queueNo: '' }), status }
  saveTodayCalls(calls)
  return { success: true }
})

// ─── IPC: Display window ─────────────────────────────────────────────────────

ipcMain.handle('display:open', (_e, config: unknown) => {
  if (displayWindow && !displayWindow.isDestroyed()) {
    displayWindow.focus()
    return
  }
  const displays = screen.getAllDisplays()
  const targetDisplay = displays.length > 1 ? displays[1] : displays[0]
  const { bounds } = targetDisplay

  displayWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    fullscreen: displays.length > 1,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: 'Queue Display'
  })

  const url = process.env['ELECTRON_RENDERER_URL']
    ? `${process.env['ELECTRON_RENDERER_URL']}#/display`
    : `file://${join(__dirname, '../renderer/index.html')}#/display`

  displayWindow.loadURL(url)
  displayWindow.webContents.once('did-finish-load', () => {
    displayWindow?.webContents.send('display:config', config)
  })
  displayWindow.on('closed', () => { displayWindow = null })
})

ipcMain.handle('display:updateConfig', (_e, config: unknown) => {
  displayWindow?.webContents.send('display:config', config)
})

// ─── IPC: Display configs CRUD ───────────────────────────────────────────────

function getDisplayConfigsFile(): string {
  return join(app.getPath('userData'), 'display-configs.json')
}

function loadDisplayConfigs(): DisplayConfigItem[] {
  try {
    const file = getDisplayConfigsFile()
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch {}
  return []
}

function saveDisplayConfigsData(configs: DisplayConfigItem[]): void {
  fs.writeFileSync(getDisplayConfigsFile(), JSON.stringify(configs, null, 2), 'utf-8')
}

interface DisplayConfigItem {
  id: string; name: string; bgColor: string; textColor: string; queueColor: string
  font: string; fontSize: number; title: string; showClock: boolean
  subTitle?: string; queueBgColor?: string; showHistory?: boolean
  animationType?: string; soundEnabled?: boolean
}

ipcMain.handle('displayConfigs:get', () => loadDisplayConfigs())

ipcMain.handle('displayConfigs:create', (_e, cfg: Omit<DisplayConfigItem, 'id'>) => {
  const configs = loadDisplayConfigs()
  const item: DisplayConfigItem = { ...cfg, id: Date.now().toString() }
  configs.push(item)
  saveDisplayConfigsData(configs)
  return { success: true, data: item }
})

ipcMain.handle('displayConfigs:update', (_e, id: string, cfg: DisplayConfigItem) => {
  const configs = loadDisplayConfigs()
  const idx = configs.findIndex(c => c.id === id)
  if (idx === -1) return { success: false, message: 'ไม่พบข้อมูล' }
  configs[idx] = { ...cfg, id }
  saveDisplayConfigsData(configs)
  return { success: true }
})

ipcMain.handle('displayConfigs:delete', (_e, id: string) => {
  const configs = loadDisplayConfigs().filter(c => c.id !== id)
  saveDisplayConfigsData(configs)
  return { success: true }
})

// ─── IPC: System fonts ───────────────────────────────────────────────────────

ipcMain.handle('system:fonts', async () => {
  return new Promise<string[]>((resolve) => {
    // Query installed fonts via PowerShell
    exec(
      `powershell -NoProfile -Command "[System.Reflection.Assembly]::LoadWithPartialName('System.Drawing') | Out-Null; [System.Drawing.FontFamily]::Families | ForEach-Object { $_.Name }"`,
      { timeout: 10000 },
      (err, stdout) => {
        if (err) {
          resolve(['Arial', 'Tahoma', 'Sarabun', 'Prompt', 'Kanit'])
          return
        }
        const fonts = stdout.split('\n').map(f => f.trim()).filter(Boolean)
        resolve(fonts)
      }
    )
  })
})
