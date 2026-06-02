/// <reference types="vite/client" />

interface DbSettings {
  type: 'mysql' | 'postgresql'
  host: string
  port: number
  database: string
  username: string
  password: string
}

interface QueueItem {
  vn: string
  hn: string
  queue_no: string
  queue_slot: string | null
  queue_name: string
  queue_type?: string
  insurance: string
  department: string
  visit_type: string
  vstdate: string
  vsttime: string
  service_point: string
  status: string
}

interface ServicePoint {
  id: string
  name: string
}

interface DisplayConfig {
  bgColor: string
  textColor: string
  queueColor: string
  font: string
  fontSize: number
  title: string
  showClock: boolean
  subTitle?: string
  queueBgColor?: string
  showHistory?: boolean
  animationType?: 'fade' | 'slide' | 'scale' | 'bounce'
  soundEnabled?: boolean
}

interface DisplayConfigItem extends DisplayConfig {
  id: string
  name: string
}

interface Window {
  electronAPI: {
    loadSettings: () => Promise<DbSettings | null>
    saveSettings: (s: DbSettings) => Promise<{ success: boolean }>
    testConnection: (s: DbSettings) => Promise<{ success: boolean; message: string }>
    login: (u: string, p: string) => Promise<{ success: boolean; message?: string; username?: string }>
    getQueueList: () => Promise<{ success: boolean; data: QueueItem[]; message?: string }>
    callQueue: (identifier: string, servicePoint: string) => Promise<{ success: boolean; message?: string; queueNo?: string; queueSlot?: number }>
    updateQueueStatus: (vn: string, status: string) => Promise<{ success: boolean }>
    onQueueCalled: (cb: (d: { queueNo: string; servicePoint: string }) => void) => () => void
    openDisplay: (config: DisplayConfig) => Promise<void>
    updateDisplayConfig: (config: DisplayConfig) => Promise<void>
    onDisplayConfig: (cb: (config: unknown) => void) => () => void
    getSystemFonts: () => Promise<string[]>
    getDisplayConfigs: () => Promise<DisplayConfigItem[]>
    createDisplayConfig: (cfg: Omit<DisplayConfigItem, 'id'>) => Promise<{ success: boolean; data?: DisplayConfigItem }>
    updateDisplayConfigItem: (id: string, cfg: DisplayConfigItem) => Promise<{ success: boolean }>
    deleteDisplayConfig: (id: string) => Promise<{ success: boolean }>
  }
}
