import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // Settings
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings: unknown) => ipcRenderer.invoke('settings:save', settings),

  // Database
  testConnection: (settings: unknown) => ipcRenderer.invoke('db:test', settings),

  // Auth
  login: (username: string, password: string) => ipcRenderer.invoke('auth:login', username, password),

  // Queue
  getQueueList: () => ipcRenderer.invoke('queue:getList'),
  callQueue: (identifier: string, servicePoint: string) => ipcRenderer.invoke('queue:call', identifier, servicePoint),
  updateQueueStatus: (vn: string, status: string) => ipcRenderer.invoke('queue:status', vn, status),
  onQueueCalled: (cb: (data: { queueNo: string; servicePoint: string }) => void) => {
    ipcRenderer.on('queue:called', (_e, data) => cb(data))
    return () => ipcRenderer.removeAllListeners('queue:called')
  },

  // Display window
  openDisplay: (config: unknown) => ipcRenderer.invoke('display:open', config),
  updateDisplayConfig: (config: unknown) => ipcRenderer.invoke('display:updateConfig', config),
  onDisplayConfig: (cb: (config: unknown) => void) => {
    ipcRenderer.on('display:config', (_e, config) => cb(config))
    return () => ipcRenderer.removeAllListeners('display:config')
  },

  // Fonts
  getSystemFonts: () => ipcRenderer.invoke('system:fonts'),

  // Display configs CRUD
  getDisplayConfigs: () => ipcRenderer.invoke('displayConfigs:get'),
  createDisplayConfig: (cfg: unknown) => ipcRenderer.invoke('displayConfigs:create', cfg),
  updateDisplayConfigItem: (id: string, cfg: unknown) => ipcRenderer.invoke('displayConfigs:update', id, cfg),
  deleteDisplayConfig: (id: string) => ipcRenderer.invoke('displayConfigs:delete', id)
})
