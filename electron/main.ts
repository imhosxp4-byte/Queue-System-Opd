import { app, Tray, Menu, nativeImage, shell } from 'electron'
import { join } from 'path'
import type { Server } from 'http'

const PORT = process.env.PORT || 3200
let tray: Tray | null = null
let httpServer: Server | null = null

// Single instance — second launch just opens browser
if (!app.requestSingleInstanceLock()) {
  app.quit()
}

app.on('second-instance', () => {
  shell.openExternal(`http://localhost:${PORT}`)
})

app.whenReady().then(() => {
  app.setAppUserModelId('Queue System OPD')

  // Writable data dir (survives reinstall)
  process.env.QUEUE_DATA_DIR = app.getPath('userData')

  if (app.isPackaged) {
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
    shell.openExternal(`http://localhost:${PORT}`)
  })

  // System tray
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'icon.ico')
    : join(__dirname, '../../build/icon.ico')

  const icon = nativeImage.createFromPath(iconPath)
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon)
  tray.setToolTip('Queue System OPD — กำลังทำงาน')

  const menu = Menu.buildFromTemplate([
    {
      label: 'เปิด Queue System OPD',
      click: () => shell.openExternal(`http://localhost:${PORT}`)
    },
    { type: 'separator' },
    {
      label: 'ออกจากโปรแกรม',
      click: () => {
        httpServer?.close()
        tray?.destroy()
        app.quit()
      }
    }
  ])

  tray.setContextMenu(menu)
  tray.on('click', () => shell.openExternal(`http://localhost:${PORT}`))
})

// Keep running when all browser windows close
app.on('window-all-closed', () => { /* stay in tray */ })
