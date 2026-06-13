'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  openDisplay: (cfg) => ipcRenderer.invoke('open-display', cfg),
})
