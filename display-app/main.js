'use strict'

const { app, BrowserWindow, ipcMain, screen, Menu, Tray, nativeImage } = require('electron')
const path = require('path')
const fs = require('fs')

const CONFIG_FILE = path.join(app.getPath('userData'), 'queue-display-config.json')

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'))
  } catch {}
  return null
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8')
}

let mainWindow = null
let configWindow = null
let tray = null

function openDisplay(cfg) {
  if (mainWindow) { mainWindow.focus(); return }

  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  mainWindow = new BrowserWindow({
    width,
    height,
    fullscreen: true,
    frame: false,
    show: false,
    backgroundColor: '#0d1b2a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  const url = `${cfg.serverUrl.replace(/\/$/, '')}/#/display?id=${cfg.displayId}`
  mainWindow.loadURL(url)

  // Show window after first load to prevent white flash
  mainWindow.webContents.once('did-finish-load', () => {
    if (mainWindow) mainWindow.show()
  })

  // Auto-retry when server is unreachable
  mainWindow.webContents.on('did-fail-load', (_e, _code, _desc, _validatedURL, isMainFrame) => {
    if (!isMainFrame || !mainWindow) return
    setTimeout(() => { if (mainWindow) mainWindow.loadURL(url) }, 5000)
  })

  // Auto-recover from renderer crash instead of closing the window
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    if (details.reason === 'killed' || !mainWindow) return
    setTimeout(() => { if (mainWindow) mainWindow.loadURL(url) }, 1000)
  })

  mainWindow.webContents.on('before-input-event', (_e, input) => {
    if (input.key === 'Escape' && input.type === 'keyDown') {
      mainWindow.close()
      openConfig()
    }
    // F11 toggle fullscreen
    if (input.key === 'F11' && input.type === 'keyDown') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen())
    }
  })

  mainWindow.on('closed', () => { mainWindow = null })

  setupTray(cfg)
}

function setupTray(cfg) {
  if (tray) return
  try {
    const iconPath = path.join(__dirname, 'build', 'icon.ico')
    const icon = fs.existsSync(iconPath)
      ? nativeImage.createFromPath(iconPath)
      : nativeImage.createEmpty()
    tray = new Tray(icon)
    tray.setToolTip(`Queue Display — ${cfg.displayName || cfg.displayId}`)
    const menu = Menu.buildFromTemplate([
      { label: `จอ: ${cfg.displayName || cfg.displayId}`, enabled: false },
      { label: `Server: ${cfg.serverUrl}`, enabled: false },
      { type: 'separator' },
      { label: 'ตั้งค่า / เปลี่ยนจอ', click: () => { if (mainWindow) mainWindow.close(); openConfig() } },
      { label: 'ออกจากโปรแกรม', click: () => app.quit() },
    ])
    tray.setContextMenu(menu)
    tray.on('double-click', () => { if (mainWindow) mainWindow.focus() })
  } catch {}
}

function openConfig() {
  if (configWindow) { configWindow.focus(); return }

  configWindow = new BrowserWindow({
    width: 520,
    height: 600,
    resizable: false,
    center: true,
    title: 'Queue Display — ตั้งค่า',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  configWindow.loadFile(path.join(__dirname, 'config.html'))
  configWindow.setMenuBarVisibility(false)
  configWindow.on('closed', () => {
    configWindow = null
    // ถ้าปิด config โดยไม่ได้เปิดจอ → ออกโปรแกรม
    if (!mainWindow) app.quit()
  })
}

app.whenReady().then(() => {
  const cfg = loadConfig()
  if (cfg && cfg.serverUrl && cfg.displayId) {
    openDisplay(cfg)
  } else {
    openConfig()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ─── IPC ─────────────────────────────────────────────────────────────────────

ipcMain.handle('get-config', () => loadConfig())

ipcMain.handle('open-display', (_e, cfg) => {
  saveConfig(cfg)
  if (configWindow) configWindow.close()
  openDisplay(cfg)
})
