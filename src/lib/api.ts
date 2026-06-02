// Unified API layer — works in both Electron and Browser modes

const isElectron = () => typeof window !== 'undefined' && !!window.electronAPI

const BASE = '/api'

async function fetchJSON<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(err.message || res.statusText)
  }
  return res.json()
}

// ─── WebSocket (Browser mode) ─────────────────────────────────────────────────
let _ws: WebSocket | null = null
const _wsListeners: Set<(data: { queueNo: string; servicePoint: string }) => void> = new Set()
const _configListeners: Set<(config: unknown) => void> = new Set()
const _statusListeners: Set<(data: { vn: string; status: string; queueNo?: string; servicePoint?: string }) => void> = new Set()

function getWS(): WebSocket {
  if (_ws && _ws.readyState === WebSocket.OPEN) return _ws
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  _ws = new WebSocket(`${protocol}//${location.host}`)
  _ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data)
      if (msg.type === 'queue:called') {
        _wsListeners.forEach(cb => cb(msg.data))
      } else if (msg.type === 'display:config') {
        _configListeners.forEach(cb => cb(msg.data))
      } else if (msg.type === 'queue:status') {
        _statusListeners.forEach(cb => cb(msg.data))
      }
    } catch {}
  }
  _ws.onclose = () => { _ws = null }
  return _ws
}

// ─── Settings ────────────────────────────────────────────────────────────────

export async function loadSettings(): Promise<DbSettings | null> {
  if (isElectron()) return window.electronAPI.loadSettings()
  return fetchJSON<DbSettings | null>('/settings')
}

export async function saveSettings(s: DbSettings): Promise<{ success: boolean }> {
  if (isElectron()) return window.electronAPI.saveSettings(s)
  return fetchJSON('/settings', { method: 'POST', body: JSON.stringify(s) })
}

// ─── Database ────────────────────────────────────────────────────────────────

export async function testConnection(s: DbSettings): Promise<{ success: boolean; message: string }> {
  if (isElectron()) return window.electronAPI.testConnection(s)
  return fetchJSON('/db/test', { method: 'POST', body: JSON.stringify(s) })
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function login(
  u: string, p: string
): Promise<{ success: boolean; message?: string; username?: string }> {
  if (isElectron()) return window.electronAPI.login(u, p)
  return fetchJSON('/auth/login', { method: 'POST', body: JSON.stringify({ username: u, password: p }) })
}

// ─── Queue ────────────────────────────────────────────────────────────────────

export async function getQueueList(
  mode: 'slot' | 'opd' = 'slot'
): Promise<{ success: boolean; data: QueueItem[]; message?: string }> {
  if (isElectron()) return window.electronAPI.getQueueList()
  return fetchJSON(`/queue/list?mode=${mode}`)
}

export async function callQueue(
  identifier: string, servicePoint: string, mode: 'slot' | 'opd' = 'slot'
): Promise<{ success: boolean; message?: string; queueNo?: string; queueSlot?: number }> {
  if (isElectron()) return window.electronAPI.callQueue(identifier, servicePoint)
  return fetchJSON('/queue/call', { method: 'POST', body: JSON.stringify({ identifier, servicePoint, mode }) })
}

export async function updateQueueStatus(
  vn: string, status: string
): Promise<{ success: boolean }> {
  if (isElectron()) return window.electronAPI.updateQueueStatus(vn, status)
  return fetchJSON('/queue/status', { method: 'POST', body: JSON.stringify({ vn, status }) })
}

export interface CallEntry {
  vn: string
  status: string
  servicePoint: string
  calledAt: string
  queueNo: string
}

export async function getCallsToday(): Promise<CallEntry[]> {
  if (isElectron()) return []
  try {
    return await fetchJSON<CallEntry[]>('/queue/calls-today')
  } catch {
    return []
  }
}

export async function getQDDefaultConfig(): Promise<Record<string, unknown> | null> {
  try {
    return await fetchJSON<Record<string, unknown> | null>('/display/qd-default')
  } catch {
    return null
  }
}

export async function saveQDDefaultConfig(cfg: unknown): Promise<{ success: boolean }> {
  return fetchJSON('/display/qd-default', { method: 'POST', body: JSON.stringify(cfg) })
}

export function onQueueCalled(
  cb: (data: { queueNo: string; servicePoint: string }) => void
): () => void {
  if (isElectron()) return window.electronAPI.onQueueCalled(cb)
  if (typeof window !== 'undefined') getWS()
  _wsListeners.add(cb)
  return () => _wsListeners.delete(cb)
}

// ─── Service Points ───────────────────────────────────────────────────────────

export async function getServicePoints(): Promise<ServicePoint[]> {
  if (isElectron()) return (window.electronAPI as any).getServicePoints?.() ?? []
  return fetchJSON<ServicePoint[]>('/service-points')
}

export async function createServicePoint(name: string): Promise<{ success: boolean; data?: ServicePoint }> {
  if (isElectron()) return (window.electronAPI as any).createServicePoint?.(name) ?? { success: false }
  return fetchJSON('/service-points', { method: 'POST', body: JSON.stringify({ name }) })
}

export async function updateServicePoint(id: string, name: string): Promise<{ success: boolean }> {
  if (isElectron()) return (window.electronAPI as any).updateServicePoint?.(id, name) ?? { success: false }
  return fetchJSON(`/service-points/${id}`, { method: 'PUT', body: JSON.stringify({ name }) })
}

export async function deleteServicePoint(id: string): Promise<{ success: boolean }> {
  if (isElectron()) return (window.electronAPI as any).deleteServicePoint?.(id) ?? { success: false }
  return fetchJSON(`/service-points/${id}`, { method: 'DELETE' })
}

// ─── Display ──────────────────────────────────────────────────────────────────

export async function openDisplay(config: DisplayConfig): Promise<void> {
  if (isElectron()) return window.electronAPI.openDisplay(config)
  // Browser: open display in new tab (settings loaded from localStorage)
  window.open('/#/display', '_blank', 'noopener')
}

export async function updateDisplayConfig(config: DisplayConfig): Promise<void> {
  if (isElectron()) return window.electronAPI.updateDisplayConfig(config)
  return fetchJSON('/display/config', { method: 'POST', body: JSON.stringify(config) })
}

export function onDisplayConfig(cb: (config: unknown) => void): () => void {
  if (isElectron()) return window.electronAPI.onDisplayConfig(cb)
  if (typeof window !== 'undefined') getWS()
  _configListeners.add(cb)
  return () => _configListeners.delete(cb)
}

export function onQueueStatusChanged(
  cb: (data: { vn: string; status: string; queueNo?: string; servicePoint?: string }) => void
): () => void {
  if (isElectron()) return () => {}
  if (typeof window !== 'undefined') getWS()
  _statusListeners.add(cb)
  return () => _statusListeners.delete(cb)
}

// ─── Fonts ────────────────────────────────────────────────────────────────────

export async function getSystemFonts(): Promise<string[]> {
  if (isElectron()) return window.electronAPI.getSystemFonts()
  return fetchJSON<string[]>('/system/fonts')
}

// ─── Display configs CRUD ─────────────────────────────────────────────────────

export async function getDisplayConfigs(): Promise<DisplayConfigItem[]> {
  if (isElectron()) return window.electronAPI.getDisplayConfigs()
  return fetchJSON<DisplayConfigItem[]>('/display/configs')
}

export async function createDisplayConfig(
  cfg: Omit<DisplayConfigItem, 'id'>
): Promise<{ success: boolean; data?: DisplayConfigItem }> {
  if (isElectron()) return window.electronAPI.createDisplayConfig(cfg)
  return fetchJSON('/display/configs', { method: 'POST', body: JSON.stringify(cfg) })
}

export async function updateDisplayConfigItem(
  id: string, cfg: DisplayConfigItem
): Promise<{ success: boolean }> {
  if (isElectron()) return window.electronAPI.updateDisplayConfigItem(id, cfg)
  return fetchJSON(`/display/configs/${id}`, { method: 'PUT', body: JSON.stringify(cfg) })
}

export async function deleteDisplayConfig(id: string): Promise<{ success: boolean }> {
  if (isElectron()) return window.electronAPI.deleteDisplayConfig(id)
  return fetchJSON(`/display/configs/${id}`, { method: 'DELETE' })
}
