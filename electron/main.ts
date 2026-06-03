import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import type { Server } from 'http'

const PORT = process.env.PORT || 3200

let mainWindow: BrowserWindow | null = null
let httpServer: Server | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    },
    title: 'Queue System OPD',
    show: false
  })

  mainWindow.loadURL(`http://localhost:${PORT}`)

  // Open external links in browser instead of Electron window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(`http://localhost:${PORT}`)) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  // Writable data directory — userData survives reinstalls unless explicitly cleared
  process.env.QUEUE_DATA_DIR = app.getPath('userData')

  if (app.isPackaged) {
    // Renderer is unpacked from asar so Express can serve it as real filesystem files
    process.env.RENDERER_DIR = join(
      process.resourcesPath,
      'app.asar.unpacked',
      'out',
      'renderer'
    )
  }

  const serverPath = app.isPackaged
    ? join(app.getAppPath(), 'server', 'index.js')
    : join(__dirname, '../../server/index.js')

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { startServer } = require(serverPath) as { startServer: () => Server }
  httpServer = startServer()

  httpServer.once('listening', () => {
    createWindow()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    httpServer?.close()
    app.quit()
  }
})
