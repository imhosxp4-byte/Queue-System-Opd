import { useState, useEffect, useRef } from 'react'
import {
  onDisplayConfig, onQueueCalled, onQueueStatusChanged, onQueueAudio, updateDisplayConfig,
  getSystemFonts, getServicePoints, getCallsToday, getQueueList,
  getQDDefaultConfig, saveQDDefaultConfig, getTTSVoices, getDisplayConfigById,
  getDisplayQDConfig, saveDisplayQDConfig,
  type CallEntry
} from '../lib/api'
import './QueueDisplay.css'

interface QDConfig {
  title: string
  // Header
  headerBg: string
  headerTextColor: string
  showClock: boolean
  clockColor: string
  soundEnabled: boolean
  // Table columns
  colSpHeader: string
  colQueueHeader: string
  tableHeaderBg: string
  tableHeaderColor: string
  spColumnBg: string
  spColumnColor: string
  spHeaderBg: string
  spHeaderColor: string
  showNoShowPanel: boolean
  noShowItemHeight: number
  queueBg: string
  queueColor: string
  spDisplayNames: Record<string, string>
  spFontSize: number
  spColumnWidth: number
  spColumnVisible: boolean
  borderColor: string
  borderWidth: number
  footerHeight: number
  // Right panel
  rightPanelBg: string
  rightPanelHeaderBg: string
  rightPanelHeaderColor: string
  rightPanelLabel: string
  rightPanelQueueColor: string
  rightPanelWidth: number
  rightPanelFontSize: number
  rightPanelMaxItems: number
  // Font / animation
  font: string
  fontSize: number
  animationType: 'fade' | 'slide' | 'scale' | 'bounce'
  // Footer
  showFooter: boolean
  marqueeText: string
  footerBg: string
  footerTextColor: string
  footerFontSize: number
  footerScrollSpeed: number
  // Visibility & station config
  hiddenSPs: string[]
  displayStation: string
  filterDepts: string[]
  // Display identity (set from URL ?id=)
  displayConfigId: string
  displayConfigName: string
  displayChannels: string[]
  // TTS (Text-to-Speech)
  ttsEnabled: boolean
  ttsSource: 'browser' | 'server'
  ttsPrefix1: string
  ttsMiddle: string
  ttsSuffix: string
  ttsVoiceName: string       // browser voice
  ttsServerVoiceName: string // Windows SAPI voice (server mode)
  ttsRate: number
  ttsPitch: number
  ttsVolume: number
}

const DEFAULT: QDConfig = {
  title: 'ระบบคิวผู้ป่วยนอก',
  headerBg: '#1a237e',
  headerTextColor: '#ffffff',
  showClock: true,
  clockColor: '#ffd54f',
  soundEnabled: false,
  colSpHeader: 'ช่องบริการ',
  colQueueHeader: 'หมายเลขที่เรียกเข้าบริการ',
  tableHeaderBg: '#2e7d32',
  tableHeaderColor: '#ffffff',
  spColumnBg: '#f8f9fa',
  spColumnColor: '#1a1a2e',
  spHeaderBg: '#1a237e',
  spHeaderColor: '#ffffff',
  showNoShowPanel: true,
  noShowItemHeight: 80,
  queueBg: '#ffffff',
  queueColor: '#1565c0',
  spDisplayNames: {},
  spFontSize: 6,
  spColumnWidth: 220,
  spColumnVisible: true,
  borderColor: '#bbbbbb',
  borderWidth: 2,
  footerHeight: 46,
  rightPanelBg: '#1a0000',
  rightPanelHeaderBg: '#7f0000',
  rightPanelHeaderColor: '#ffffff',
  rightPanelLabel: 'เรียกแล้วไม่มา',
  rightPanelQueueColor: '#ff6b6b',
  rightPanelWidth: 260,
  rightPanelFontSize: 8,
  rightPanelMaxItems: 10,
  font: 'Sarabun',
  fontSize: 8,
  animationType: 'scale',
  showFooter: true,
  marqueeText: 'ยินดีต้อนรับสู่ระบบคิว | Welcome to Queue System | กรุณานั่งรอเรียกหมายเลขคิว',
  footerBg: '#1565c0',
  footerTextColor: '#ffffff',
  footerFontSize: 20,
  footerScrollSpeed: 30,
  hiddenSPs: [],
  displayStation: '',
  filterDepts: [],
  displayConfigId: '',
  displayConfigName: '',
  displayChannels: [],
  ttsEnabled: false,
  ttsSource: 'browser',
  ttsPrefix1: 'ขอเชิญลำดับ',
  ttsMiddle: 'ที่โต๊ะซักประวัติหมายเลข',
  ttsSuffix: 'ค่ะ',
  ttsVoiceName: '',
  ttsServerVoiceName: '',
  ttsRate: 0.9,
  ttsPitch: 1.1,
  ttsVolume: 1.0,
}

// Read display config ID from URL hash: /#/display?id=XXX
function getDisplayIdFromURL(): string {
  try {
    const hash = window.location.hash // e.g. "#/display?id=12345"
    const qIdx = hash.indexOf('?')
    if (qIdx === -1) return ''
    return new URLSearchParams(hash.slice(qIdx + 1)).get('id') || ''
  } catch { return '' }
}

const URL_DISPLAY_ID = getDisplayIdFromURL()
const STORAGE_KEY = URL_DISPLAY_ID ? `qd-config-${URL_DISPLAY_ID}` : 'qd-config'

function fixConfig(merged: Record<string, unknown>): QDConfig {
  const result = { ...DEFAULT, ...merged } as QDConfig
  if (result.fontSize > 20) result.fontSize = DEFAULT.fontSize
  if (!Array.isArray(result.hiddenSPs)) result.hiddenSPs = []
  if (typeof result.spDisplayNames !== 'object' || Array.isArray(result.spDisplayNames))
    result.spDisplayNames = {}
  return result
}

function extractBadge(queueNo: string): string | null {
  const m = queueNo.match(/^([A-Za-ก-ฮ]+)/)
  return m ? m[1].toUpperCase() : null
}

export default function QueueDisplayPage() {
  const [config, setConfig] = useState<QDConfig>(() => {
    // localStorage — always use saved settings
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) return fixConfig(JSON.parse(saved))
    } catch {}
    return { ...DEFAULT }
  })
  const [saveDefaultMsg, setSaveDefaultMsg] = useState<string | null>(null)

  const [servicePoints, setServicePoints] = useState<ServicePoint[]>([])
  const [spQueues, setSpQueues] = useState<Record<string, string>>({})
  const [rowAnimKeys, setRowAnimKeys] = useState<Record<string, number>>({})
  const [noShowQueues, setNoShowQueues] = useState<CallEntry[]>([])
  const [clock, setClock] = useState(new Date())
  const [showSettings, setShowSettings] = useState(false)
  const [systemFonts, setSystemFonts] = useState<string[]>([])
  const [availDepts, setAvailDepts] = useState<string[]>([])

  const audioCtx = useRef<AudioContext | null>(null)
  const isResizing = useRef(false)
  const configRef = useRef(config)
  const [ttsVoices, setTtsVoices] = useState<SpeechSynthesisVoice[]>([])
  const [serverTtsVoices, setServerTtsVoices] = useState<string[]>([])
  const [loadingVoices, setLoadingVoices] = useState(false)
  const resizeStartX = useRef(0)
  const resizeStartW = useRef(0)

  // Keep configRef in sync for use inside effects without re-registering
  useEffect(() => { configRef.current = config }, [config])

  // Auto-save config to localStorage on every change
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)) } catch {}
  }, [config])

  // Load config from server on startup
  // - Display with ?id= → load from per-display config (isolated)
  // - Display without id → load from global qd-default-config
  useEffect(() => {
    const loader = URL_DISPLAY_ID
      ? getDisplayQDConfig(URL_DISPLAY_ID)
      : getQDDefaultConfig()

    loader.then(serverCfg => {
      if (!serverCfg) {
        if (!localStorage.getItem(STORAGE_KEY)) setConfig({ ...DEFAULT })
        return
      }
      if (!localStorage.getItem(STORAGE_KEY)) {
        setConfig(fixConfig(serverCfg))
      } else {
        // Sync all settings from server (per-display config is authoritative)
        setConfig(c => ({ ...fixConfig(serverCfg), displayConfigId: c.displayConfigId, displayConfigName: c.displayConfigName, displayChannels: c.displayChannels }))
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Load channels + name from DisplayConfigItem when opened with ?id=
  useEffect(() => {
    if (!URL_DISPLAY_ID) return
    getDisplayConfigById(URL_DISPLAY_ID).then(dcfg => {
      if (!dcfg) return
      const channels = dcfg.channels || []
      setConfig(c => ({ ...c, displayConfigId: URL_DISPLAY_ID, displayConfigName: dcfg.name || '', displayChannels: channels }))
      if (dcfg.name) document.title = `จอ: ${dcfg.name} — Queue OPD`
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // When settings panel opens: re-sync TTS config from server + reload server voices
  const TTS_KEYS_CONST: (keyof QDConfig)[] = [
    'ttsEnabled', 'ttsSource', 'ttsPrefix1', 'ttsMiddle', 'ttsSuffix',
    'ttsVoiceName', 'ttsServerVoiceName', 'ttsRate', 'ttsPitch', 'ttsVolume', 'soundEnabled'
  ]
  useEffect(() => {
    if (!showSettings) return
    refreshServerVoices()
    const loader = URL_DISPLAY_ID ? getDisplayQDConfig(URL_DISPLAY_ID) : getQDDefaultConfig()
    loader.then(serverCfg => {
      if (!serverCfg) return
      setConfig(c => ({ ...fixConfig(serverCfg), displayConfigId: c.displayConfigId, displayConfigName: c.displayConfigName, displayChannels: c.displayChannels }))
    })
  }, [showSettings]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load TTS voices (Web Speech API)
  // Electron's voiceschanged event is unreliable — poll until voices are available
  useEffect(() => {
    const load = () => {
      const voices = window.speechSynthesis?.getVoices() ?? []
      if (voices.length > 0) setTtsVoices(voices)
    }
    load()
    window.speechSynthesis?.addEventListener('voiceschanged', load)
    const interval = setInterval(() => {
      const voices = window.speechSynthesis?.getVoices() ?? []
      if (voices.length > 0) {
        setTtsVoices(voices)
        clearInterval(interval)
      }
    }, 200)
    return () => {
      window.speechSynthesis?.removeEventListener('voiceschanged', load)
      clearInterval(interval)
    }
  }, [])

  // Load server TTS voices (Windows SAPI)
  const refreshServerVoices = () => {
    setLoadingVoices(true)
    getTTSVoices().then(v => { setServerTtsVoices(v); setLoadingVoices(false) }).catch(() => setLoadingVoices(false))
  }
  useEffect(() => { refreshServerVoices() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Load service points
  useEffect(() => {
    getServicePoints().then(setServicePoints)
  }, [])

  // Clock tick
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Poll no-show queues every 10s + load available depts
  useEffect(() => {
    const refresh = async () => {
      const [calls, queueRes] = await Promise.all([
        getCallsToday(),
        getQueueList().catch(() => ({ success: false, data: [] }))
      ])
      setNoShowQueues(calls)
      if (queueRes.success) {
        const depts = Array.from(new Set(queueRes.data.map((q: QueueItem) => q.department).filter(Boolean))).sort() as string[]
        setAvailDepts(depts)
      }
    }
    refresh()
    const t = setInterval(refresh, 15000)
    return () => clearInterval(t)
  }, [])

  // WebSocket: real-time queue call events
  useEffect(() => {
    const off = onQueueCalled(data => {
      const cfg = configRef.current
      // Filter: if this display has an ID, only accept calls for this display (or untagged calls)
      if (cfg.displayConfigId && data.displayConfigId && data.displayConfigId !== cfg.displayConfigId) return

      setSpQueues(prev => ({ ...prev, [data.servicePoint]: data.queueNo }))
      setRowAnimKeys(prev => ({ ...prev, [data.servicePoint]: (prev[data.servicePoint] || 0) + 1 }))
      if (cfg.ttsEnabled && cfg.ttsSource !== 'server') {
        playTTS(data.queueNo, data.servicePoint, cfg)
      } else if (cfg.soundEnabled) {
        playBeep()
      }
      setTimeout(() => getCallsToday().then(setNoShowQueues), 800)
    })
    return off
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // WebSocket: status changed (skip/done/waiting) — refresh no-show list immediately
  useEffect(() => {
    const off = onQueueStatusChanged(() => {
      getCallsToday().then(setNoShowQueues)
    })
    return off
  }, [])

  // WebSocket: async TTS audio ready — play when received
  useEffect(() => {
    const off = onQueueAudio(data => {
      const cfg = configRef.current
      if (cfg.displayConfigId && data.displayConfigId && data.displayConfigId !== cfg.displayConfigId) return
      const audio = new Audio(data.audioUrl)
      audio.volume = cfg.ttsVolume ?? 1
      audio.play().catch(() => {})
    })
    return off
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Display config broadcast (from admin panel)
  useEffect(() => {
    const off = onDisplayConfig(cfg => {
      setConfig(c => ({ ...c, ...(cfg as Partial<QDConfig>) }))
    })
    return off
  }, [])

  const playBeep = () => {
    try {
      if (!audioCtx.current) audioCtx.current = new AudioContext()
      const ctx = audioCtx.current
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.setValueAtTime(880, ctx.currentTime)
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1)
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.4)
    } catch {}
  }

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    resizeStartX.current = e.clientX
    resizeStartW.current = config.spColumnWidth

    const onMove = (ev: MouseEvent) => {
      if (!isResizing.current) return
      const delta = ev.clientX - resizeStartX.current
      const w = Math.max(60, Math.min(500, resizeStartW.current + delta))
      setConfig(c => ({ ...c, spColumnWidth: Math.round(w) }))
    }
    const onUp = () => {
      isResizing.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const playTTS = (queueNo: string, servicePoint: string, cfg: QDConfig) => {
    if (!window.speechSynthesis) return
    const text = [cfg.ttsPrefix1, queueNo, cfg.ttsMiddle, servicePoint, cfg.ttsSuffix]
      .filter(Boolean).join(' ')
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.lang = 'th-TH'
    utt.rate = cfg.ttsRate
    utt.pitch = cfg.ttsPitch
    utt.volume = cfg.ttsVolume
    const voices = window.speechSynthesis.getVoices()
    const picked = voices.find(v => v.name === cfg.ttsVoiceName)
      || voices.find(v => v.lang === 'th-TH')
      || voices.find(v => v.lang.startsWith('th'))
    if (picked) utt.voice = picked
    window.speechSynthesis.speak(utt)
  }

  const previewTTS = () => playTTS('A001', '1', config)

  const openSettings = () => {
    setShowSettings(true)
    getSystemFonts().then(setSystemFonts)
  }

  const saveConfig = async () => {
    if (URL_DISPLAY_ID) {
      await saveDisplayQDConfig(URL_DISPLAY_ID, config)
    } else {
      await updateDisplayConfig(config as unknown as DisplayConfig)
    }
    setShowSettings(false)
  }

  const saveAsDefault = async () => {
    if (URL_DISPLAY_ID) {
      await saveDisplayQDConfig(URL_DISPLAY_ID, config)
      setSaveDefaultMsg('บันทึกการตั้งค่าจอนี้สำเร็จ ✓')
    } else {
      await saveQDDefaultConfig(config)
      setSaveDefaultMsg('บันทึกเป็นค่าเริ่มต้นสำเร็จ ✓')
    }
    setTimeout(() => setSaveDefaultMsg(null), 2500)
  }

  // Derived: use display-specific channels if this display has an ID, otherwise global SPs
  const visibleSPs = config.displayConfigId && config.displayChannels.length > 0
    ? config.displayChannels.map(ch => ({ id: ch, name: ch }))
    : servicePoints.filter(sp => !config.hiddenSPs.includes(sp.id) && !config.hiddenSPs.includes(sp.name))

  const toggleFilterDept = (dept: string) =>
    setConfig(c => ({
      ...c,
      filterDepts: c.filterDepts.includes(dept)
        ? c.filterDepts.filter(d => d !== dept)
        : [...c.filterDepts, dept]
    }))

  const toggleSPVisibility = (sp: ServicePoint) => {
    const hidden = config.hiddenSPs.includes(sp.id) || config.hiddenSPs.includes(sp.name)
    setConfig(c => ({
      ...c,
      hiddenSPs: hidden
        ? c.hiddenSPs.filter(x => x !== sp.id && x !== sp.name)
        : [...c.hiddenSPs, sp.id]
    }))
  }

  const setSpDisplayName = (sp: ServicePoint, name: string) => {
    setConfig(c => ({
      ...c,
      spDisplayNames: { ...c.spDisplayNames, [sp.id]: name }
    }))
  }

  const filteredNoShow = config.filterDepts.length === 0
    ? noShowQueues
    : noShowQueues.filter(q => config.filterDepts.some(d => q.servicePoint?.includes(d) || true))

  const fontFace = `'${config.font}', 'Sarabun', 'Tahoma', sans-serif`
  const animClass = { fade: 'anim-fade', slide: 'anim-slide', scale: 'anim-scale', bounce: 'anim-bounce' }[config.animationType]
  const marqueeStyle = { animationDuration: `${config.footerScrollSpeed}s`, fontSize: config.footerFontSize }
  const border = `${config.borderWidth}px solid ${config.borderColor}`

  return (
    <div className="qd-root" style={{ fontFamily: fontFace }}>

      {/* ─── HEADER ──────────────────────────────────────────── */}
      <header className="qd-header" style={{ background: config.headerBg, color: config.headerTextColor }}>
        <span className="qd-title">
          {config.title}
          {config.displayStation && <span className="qd-station-tag">{config.displayStation}</span>}
          {config.displayConfigId && (
            <span className="qd-station-tag" style={{ background: 'rgba(0,188,212,0.3)', marginLeft: 8, fontSize: '0.85em', fontWeight: 700, letterSpacing: 0.5 }}>
              📺 {config.displayConfigName || config.displayConfigId}
              {config.displayChannels.length > 0 && <span style={{ opacity: 0.7, fontWeight: 400, marginLeft: 5 }}>({config.displayChannels.length} ช่อง)</span>}
            </span>
          )}
        </span>
        <div className="qd-controls">
          {config.showClock && (
            <span className="qd-clock" style={{ color: config.clockColor }}>
              {clock.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          <button
            className={`qd-hdr-btn qd-sound-btn${config.soundEnabled ? ' on' : ''}`}
            onClick={() => setConfig(c => ({ ...c, soundEnabled: !c.soundEnabled }))}
          >
            {config.soundEnabled ? '🔊' : '🔇'} เสียง
          </button>
          <div className="qd-fs-ctrl">
            <button onClick={() => setConfig(c => ({ ...c, fontSize: Math.max(2, +(c.fontSize - 0.5).toFixed(1)) }))}>−</button>
            <span>{config.fontSize.toFixed(1)}</span>
            <button onClick={() => setConfig(c => ({ ...c, fontSize: Math.min(20, +(c.fontSize + 0.5).toFixed(1)) }))}>+</button>
          </div>
          <button
            className={`qd-hdr-btn${config.showNoShowPanel ? ' on' : ''}`}
            onClick={() => setConfig(c => ({ ...c, showNoShowPanel: !c.showNoShowPanel }))}
            title={config.showNoShowPanel ? 'ซ่อนคิวไม่มา' : 'แสดงคิวไม่มา'}
            style={{ background: config.showNoShowPanel ? 'rgba(239,83,80,0.25)' : 'rgba(255,255,255,0.1)' }}
          >
            {config.showNoShowPanel ? '🔴' : '⚫'} ไม่มา
          </button>
          <button className="qd-hdr-btn" onClick={openSettings}>⚙ ตั้งค่าหน้าจอ</button>
        </div>
      </header>

      {/* ─── BODY ────────────────────────────────────────────── */}
      <div className="qd-body">

        {/* ── Main table ─────────────────────────────────────── */}
        <div className="qd-main" style={{ position: 'relative', borderRight: border }}>
          {/* Drag-to-resize handle */}
          {config.spColumnVisible && (
            <div
              className="qd-col-resizer"
              style={{ left: config.spColumnWidth }}
              onMouseDown={startResize}
              title="ลากเพื่อปรับความกว้าง"
            />
          )}

          <div className="qd-thead">
            {config.spColumnVisible && (
              <div
                className="qd-th qd-th-sp"
                style={{
                  width: config.spColumnWidth,
                  minWidth: config.spColumnWidth,
                  background: config.spHeaderBg,
                  color: config.spHeaderColor,
                  borderRight: border,
                  borderBottom: border,
                }}
              >
                <span className="qd-th-label">{config.colSpHeader}</span>
              </div>
            )}
            <div className="qd-th qd-th-queue" style={{ background: config.tableHeaderBg, color: config.tableHeaderColor, borderBottom: border }}>
              {config.colQueueHeader}
            </div>
          </div>

          <div className="qd-tbody">
            {servicePoints.length === 0 ? (
              <div className="qd-empty">กำลังโหลดช่องบริการ...</div>
            ) : visibleSPs.length === 0 ? (
              <div className="qd-empty">ไม่มีช่องบริการที่เปิดใช้งาน</div>
            ) : (
              visibleSPs.map(sp => {
                const displayName = config.spDisplayNames[sp.id] || config.spDisplayNames[sp.name] || sp.name
                const queueNo = spQueues[sp.name] || spQueues[sp.id] || ''
                const badge = queueNo ? extractBadge(queueNo) : null
                const rowKey = rowAnimKeys[sp.name] || rowAnimKeys[sp.id] || 0
                return (
                  <div key={sp.id} className="qd-row" style={{ borderBottom: border }}>
                    {config.spColumnVisible && (
                      <div
                        className="qd-td qd-td-sp"
                        style={{
                          width: config.spColumnWidth,
                          minWidth: config.spColumnWidth,
                          background: config.spColumnBg,
                          color: config.spColumnColor,
                          fontSize: `${config.spFontSize}vw`,
                          borderRight: border,
                        }}
                      >
                        {displayName}
                      </div>
                    )}
                    <div className="qd-td qd-td-queue" style={{ background: config.queueBg }}>
                      {queueNo ? (
                        <div key={rowKey} className={`qd-queue-cell ${animClass}`}>
                          {badge && <span className="qd-badge">{badge}</span>}
                          <span className="qd-queue-no" style={{ color: config.queueColor, fontSize: `${config.fontSize}vw` }}>
                            {queueNo}
                          </span>
                        </div>
                      ) : (
                        <span className="qd-dash">—</span>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* ── Right panel: เรียกแล้วไม่มา ──────────────────── */}
        {config.showNoShowPanel && <div
          className="qd-right"
          style={{ background: config.rightPanelBg, width: config.rightPanelWidth, minWidth: config.rightPanelWidth }}
        >
          <div className="qd-right-hd" style={{ background: config.rightPanelHeaderBg, color: config.rightPanelHeaderColor }}>
            {config.rightPanelLabel}
            {noShowQueues.length > 0 && (
              <span className="qd-right-count">{noShowQueues.length}</span>
            )}
          </div>
          <div className="qd-right-body">
            {noShowQueues.length === 0 ? (
              <span className="qd-right-empty">ไม่มีรายการ</span>
            ) : (
              <div className="qd-noshow-list">
                {noShowQueues.slice(0, config.rightPanelMaxItems).map((item, i) => {
                  const badge = extractBadge(item.queueNo)
                  const isFirst = i === 0
                  const fsize = isFirst
                    ? `${config.rightPanelFontSize}vw`
                    : `${Math.max(1.5, config.rightPanelFontSize * 0.58).toFixed(1)}vw`
                  return (
                    <div key={item.vn} className={`qd-noshow-item${isFirst ? ' qd-noshow-first' : ''}`}
                      style={{ height: config.noShowItemHeight, minHeight: config.noShowItemHeight }}>
                      <div className="qd-noshow-queue">
                        {badge && (
                          <span className={`qd-right-badge${isFirst ? ' large' : ''}`}>{badge}</span>
                        )}
                        <span className="qd-noshow-no" style={{ color: config.rightPanelQueueColor, fontSize: fsize }}>
                          {item.queueNo}
                        </span>
                      </div>
                      <div className="qd-noshow-sp">
                        ช่อง {item.servicePoint} · {item.calledAt}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>}
      </div>

      {/* ─── FOOTER ──────────────────────────────────────────── */}
      {config.showFooter && (
        <footer className="qd-footer" style={{ background: config.footerBg, color: config.footerTextColor, height: config.footerHeight }}>
          <div className="qd-marquee" style={marqueeStyle}><span>{config.marqueeText}</span></div>
        </footer>
      )}

      {/* ─── SETTINGS PANEL ──────────────────────────────────── */}
      {showSettings && (
        <div className="qd-overlay">
          <div className="qd-panel" onClick={e => e.stopPropagation()} style={{ fontFamily: fontFace }}>
            <div className="qd-panel-hd">
              <h3>⚙ ตั้งค่าการแสดงผล</h3>
              <button className="qd-panel-close" onClick={() => setShowSettings(false)}>✕</button>
            </div>
            <div className="qd-panel-body">

              {/* ── ทั่วไป ── */}
              <SSec>ข้อมูลจุดบริการ (แสดงบนจอนี้)</SSec>
              <SRow label="ชื่อระบบ">
                <input className="input" value={config.title}
                  onChange={e => setConfig(c => ({ ...c, title: e.target.value }))} />
              </SRow>
              <SRow label="ชื่อจุดบริการ / ห้อง">
                <input className="input" value={config.displayStation}
                  placeholder="เช่น ซักประวัติ ทั่วไป, อายุรกรรม"
                  onChange={e => setConfig(c => ({ ...c, displayStation: e.target.value }))} />
              </SRow>
              <SRow label="กรองแผนกที่แสดง">
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                  {config.filterDepts.length === 0 ? 'ทุกแผนก' : `${config.filterDepts.length} แผนก`}
                </span>
              </SRow>
              {availDepts.length > 0 ? (
                <div className="qd-dept-checks">
                  {availDepts.map(d => (
                    <label key={d} className="qd-dept-check-item">
                      <input type="checkbox"
                        checked={config.filterDepts.includes(d)}
                        onChange={() => toggleFilterDept(d)} />
                      <span>{d}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', padding: '4px 0' }}>
                  (โหลดรายการแผนกจากฐานข้อมูล...)
                </div>
              )}

              {/* ── Header ── */}
              <SSec>ส่วนหัว (Header)</SSec>
              <SRow label="สีพื้นหลัง Header">
                <CInput value={config.headerBg} onChange={v => setConfig(c => ({ ...c, headerBg: v }))} />
              </SRow>
              <SRow label="สีข้อความ Header">
                <CInput value={config.headerTextColor} onChange={v => setConfig(c => ({ ...c, headerTextColor: v }))} />
              </SRow>
              <SRow label="สีนาฬิกา">
                <CInput value={config.clockColor} onChange={v => setConfig(c => ({ ...c, clockColor: v }))} />
              </SRow>
              <SRow label="แสดงนาฬิกา">
                <Tog checked={config.showClock} onChange={v => setConfig(c => ({ ...c, showClock: v }))} />
              </SRow>
              <SRow label="เสียงแจ้งเตือน">
                <Tog checked={config.soundEnabled} onChange={v => setConfig(c => ({ ...c, soundEnabled: v }))} />
              </SRow>

              {/* ── ตาราง ── */}
              <SSec>ตาราง (หัวคอลัมน์และสี)</SSec>
              <SRow label="หัวคอลัมน์ช่องเรียก">
                <input className="input" value={config.colSpHeader}
                  onChange={e => setConfig(c => ({ ...c, colSpHeader: e.target.value }))} />
              </SRow>
              <SRow label="หัวคอลัมน์แสดงคิว">
                <input className="input" value={config.colQueueHeader}
                  onChange={e => setConfig(c => ({ ...c, colQueueHeader: e.target.value }))} />
              </SRow>
              <SRow label="สีพื้นหัวตาราง (คิว)">
                <CInput value={config.tableHeaderBg} onChange={v => setConfig(c => ({ ...c, tableHeaderBg: v }))} />
              </SRow>
              <SRow label="สีข้อความหัวตาราง">
                <CInput value={config.tableHeaderColor} onChange={v => setConfig(c => ({ ...c, tableHeaderColor: v }))} />
              </SRow>
              <SRow label="สีพื้นหัวคอลัมน์ช่องบริการ">
                <CInput value={config.spHeaderBg} onChange={v => setConfig(c => ({ ...c, spHeaderBg: v }))} />
              </SRow>
              <SRow label="สีตัวอักษรหัวคอลัมน์ช่องบริการ">
                <CInput value={config.spHeaderColor} onChange={v => setConfig(c => ({ ...c, spHeaderColor: v }))} />
              </SRow>
              <SRow label="สีพื้นคอลัมน์ช่องเรียก (แถวข้อมูล)">
                <CInput value={config.spColumnBg} onChange={v => setConfig(c => ({ ...c, spColumnBg: v }))} />
              </SRow>
              <SRow label="สีตัวอักษรช่องเรียก (แถวข้อมูล)">
                <CInput value={config.spColumnColor} onChange={v => setConfig(c => ({ ...c, spColumnColor: v }))} />
              </SRow>
              <SRow label="สีพื้นช่องแสดงคิว">
                <CInput value={config.queueBg} onChange={v => setConfig(c => ({ ...c, queueBg: v }))} />
              </SRow>
              <SRow label="สีตัวเลขคิว">
                <CInput value={config.queueColor} onChange={v => setConfig(c => ({ ...c, queueColor: v }))} />
              </SRow>
              <SSec>เส้นขอบตาราง</SSec>
              <SRow label="สีเส้นขอบ">
                <CInput value={config.borderColor} onChange={v => setConfig(c => ({ ...c, borderColor: v }))} />
              </SRow>
              <SRow label={`ความหนาเส้นขอบ: ${config.borderWidth}px`}>
                <input type="range" min="0" max="10" step="1" value={config.borderWidth}
                  onChange={e => setConfig(c => ({ ...c, borderWidth: Number(e.target.value) }))}
                  className="qd-slider" />
              </SRow>

              <SSec>คอลัมน์ช่องบริการ</SSec>
              <SRow label="แสดงคอลัมน์ช่องบริการ">
                <Tog checked={config.spColumnVisible !== false} onChange={v => setConfig(c => ({ ...c, spColumnVisible: v }))} />
              </SRow>
              <SRow label={`ความกว้างคอลัมน์: ${config.spColumnWidth}px`}>
                <input type="range" min="60" max="500" step="5" value={config.spColumnWidth}
                  onChange={e => setConfig(c => ({ ...c, spColumnWidth: Number(e.target.value) }))}
                  className="qd-slider" />
              </SRow>
              <SRow label={`ขนาดตัวอักษร ช่องเรียก: ${config.spFontSize}vw`}>
                <input type="range" min="1" max="20" step="0.5" value={config.spFontSize}
                  onChange={e => setConfig(c => ({ ...c, spFontSize: Number(e.target.value) }))}
                  className="qd-slider" />
              </SRow>
              <SRow label={`ขนาดตัวอักษร ช่องแสดงคิว: ${config.fontSize}vw`}>
                <input type="range" min="1" max="20" step="0.5" value={config.fontSize}
                  onChange={e => setConfig(c => ({ ...c, fontSize: Number(e.target.value) }))}
                  className="qd-slider" />
              </SRow>

              {/* ── ช่องบริการ ── */}
              <SSec>ช่องบริการ (เปิด/ปิด + ชื่อที่แสดง)</SSec>
              {servicePoints.length === 0 ? (
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', padding: '4px 0' }}>ยังไม่มีช่องบริการ</div>
              ) : (
                servicePoints.map(sp => {
                  const isVisible = !config.hiddenSPs.includes(sp.id) && !config.hiddenSPs.includes(sp.name)
                  const displayName = config.spDisplayNames[sp.id] || ''
                  return (
                    <div key={sp.id} className="qd-sp-row">
                      <Tog checked={isVisible} onChange={() => toggleSPVisibility(sp)} />
                      <span className="qd-sp-sys-name">{sp.name}</span>
                      <input
                        className="input qd-sp-name-input"
                        placeholder={`ชื่อบนจอ (ค่าเริ่ม: ${sp.name})`}
                        value={displayName}
                        onChange={e => setSpDisplayName(sp, e.target.value)}
                      />
                    </div>
                  )
                })
              )}

              {/* ── แผงขวา ── */}
              <SSec>แผงเรียกแล้วไม่มา (ด้านขวา)</SSec>
              <SRow label="ป้ายกำกับ">
                <input className="input" value={config.rightPanelLabel}
                  onChange={e => setConfig(c => ({ ...c, rightPanelLabel: e.target.value }))} />
              </SRow>
              <SRow label={`ความกว้างแผง: ${config.rightPanelWidth}px`}>
                <input type="range" min="120" max="600" step="10" value={config.rightPanelWidth}
                  onChange={e => setConfig(c => ({ ...c, rightPanelWidth: Number(e.target.value) }))}
                  className="qd-slider" />
              </SRow>
              <SRow label={`ขนาดตัวเลขหลัก: ${config.rightPanelFontSize}vw`}>
                <input type="range" min="2" max="20" step="0.5" value={config.rightPanelFontSize}
                  onChange={e => setConfig(c => ({ ...c, rightPanelFontSize: Number(e.target.value) }))}
                  className="qd-slider" />
              </SRow>
              <SRow label={`จำนวนแสดงสูงสุด: ${config.rightPanelMaxItems} รายการ`}>
                <input type="range" min="1" max="20" step="1" value={config.rightPanelMaxItems}
                  onChange={e => setConfig(c => ({ ...c, rightPanelMaxItems: Number(e.target.value) }))}
                  className="qd-slider" />
              </SRow>
              <SRow label={`ความสูงต่อรายการ: ${config.noShowItemHeight}px`}>
                <input type="range" min="40" max="200" step="4" value={config.noShowItemHeight}
                  onChange={e => setConfig(c => ({ ...c, noShowItemHeight: Number(e.target.value) }))}
                  className="qd-slider" />
              </SRow>
              <SRow label="สีพื้นหลัง">
                <CInput value={config.rightPanelBg} onChange={v => setConfig(c => ({ ...c, rightPanelBg: v }))} />
              </SRow>
              <SRow label="สีพื้นหัว">
                <CInput value={config.rightPanelHeaderBg} onChange={v => setConfig(c => ({ ...c, rightPanelHeaderBg: v }))} />
              </SRow>
              <SRow label="สีข้อความหัว">
                <CInput value={config.rightPanelHeaderColor} onChange={v => setConfig(c => ({ ...c, rightPanelHeaderColor: v }))} />
              </SRow>
              <SRow label="สีตัวเลขคิว">
                <CInput value={config.rightPanelQueueColor} onChange={v => setConfig(c => ({ ...c, rightPanelQueueColor: v }))} />
              </SRow>

              {/* ── ฟ้อนต์/แอนิเมชัน ── */}
              <SSec>ฟ้อนต์และแอนิเมชัน</SSec>
              <SRow label="ฟ้อนต์">
                <select className="input" value={config.font}
                  onChange={e => setConfig(c => ({ ...c, font: e.target.value }))}>
                  {(systemFonts.length > 0
                    ? systemFonts
                    : ['Sarabun', 'Prompt', 'Kanit', 'Tahoma', 'Arial', 'Angsana New', 'CordiaNew', 'TH SarabunPSK']
                  ).map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </SRow>
              <SRow label={`ขนาดตัวเลขคิว: ${config.fontSize}vw`}>
                <input type="range" min="2" max="20" step="0.5" value={config.fontSize}
                  onChange={e => setConfig(c => ({ ...c, fontSize: Number(e.target.value) }))}
                  className="qd-slider" />
              </SRow>
              <SRow label="แอนิเมชัน">
                <div className="qd-radio-group">
                  {(['fade', 'slide', 'scale', 'bounce'] as const).map(a => (
                    <label key={a} className="qd-radio-label">
                      <input type="radio" name="qd-anim" value={a}
                        checked={config.animationType === a}
                        onChange={() => setConfig(c => ({ ...c, animationType: a }))} />
                      {a}
                    </label>
                  ))}
                </div>
              </SRow>

              {/* ── เสียงประกาศ TTS ── */}
              <SSec>เสียงประกาศ (Text-to-Speech)</SSec>
              <SRow label="เปิดใช้เสียงประกาศ">
                <Tog checked={config.ttsEnabled} onChange={v => setConfig(c => ({ ...c, ttsEnabled: v }))} />
              </SRow>

              {config.ttsEnabled && <>
                <SRow label="แหล่งเสียง">
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className={`qd-tts-src-btn${config.ttsSource !== 'server' ? ' active' : ''}`}
                      onClick={() => setConfig(c => ({ ...c, ttsSource: 'browser' }))}
                    >🌐 Browser (เครื่องนี้)</button>
                    <button
                      className={`qd-tts-src-btn${config.ttsSource === 'server' ? ' active' : ''}`}
                      onClick={() => setConfig(c => ({ ...c, ttsSource: 'server' }))}
                    >🖥 Server (Host)</button>
                  </div>
                </SRow>

                {config.ttsSource === 'server' && (
                  <div className="qd-tts-warn" style={{ background: 'rgba(0,188,100,0.12)', borderLeft: '3px solid #00c864' }}>
                    ✅ เสียงจะสังเคราะห์บนเครื่อง Host แล้วส่งไปทุกเครื่อง
                    {serverTtsVoices.length === 0 && <><br/><small>⚠ ไม่พบเสียง SAPI บน Host — ติดตั้ง Thai Language Pack</small></>}
                  </div>
                )}

                <div className="qd-tts-preview-wrap">
                  <div className="qd-tts-template">
                    <span className="qd-tts-seg edit">{config.ttsPrefix1 || '…'}</span>
                    <span className="qd-tts-seg var">A001</span>
                    <span className="qd-tts-seg edit">{config.ttsMiddle || '…'}</span>
                    <span className="qd-tts-seg var">1</span>
                    <span className="qd-tts-seg edit">{config.ttsSuffix || '…'}</span>
                  </div>
                  <button className="qd-tts-play-btn" onClick={previewTTS}>▶ ทดสอบเสียง</button>
                </div>

                <SRow label="ข้อความก่อนเลขคิว">
                  <input className="input" value={config.ttsPrefix1}
                    onChange={e => setConfig(c => ({ ...c, ttsPrefix1: e.target.value }))} />
                </SRow>
                <SRow label="ข้อความก่อนเลขช่อง">
                  <input className="input" value={config.ttsMiddle}
                    onChange={e => setConfig(c => ({ ...c, ttsMiddle: e.target.value }))} />
                </SRow>
                <SRow label="ข้อความปิดท้าย">
                  <input className="input" value={config.ttsSuffix}
                    onChange={e => setConfig(c => ({ ...c, ttsSuffix: e.target.value }))} />
                </SRow>

                <SRow label="เสียง (Voice)">
                  {config.ttsSource === 'server' ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <select className="input" value={config.ttsServerVoiceName}
                        onChange={e => setConfig(c => ({ ...c, ttsServerVoiceName: e.target.value }))}
                        disabled={loadingVoices}>
                        <option value="">{loadingVoices ? 'กำลังโหลด…' : serverTtsVoices.length === 0 ? 'ไม่พบเสียง' : 'อัตโนมัติ (อาจารา ไทย)'}</option>
                        {serverTtsVoices.map(v => {
                          const labels: Record<string, string> = {
                            'th-TH-AcharaNeural':    '🇹🇭 อาจารา (ไทย หญิง) — Neural',
                            'th-TH-NiwatNeural':     '🇹🇭 นิวัตร (ไทย ชาย) — Neural',
                            'th-TH-PremwadeeNeural': '🇹🇭 เปรมวดี (ไทย หญิง) — Neural',
                          }
                          return <option key={v} value={v}>{labels[v] ?? v}</option>
                        })}
                      </select>
                      <button className="qd-tts-play-btn" onClick={refreshServerVoices} disabled={loadingVoices}
                        title="โหลดรายการเสียงใหม่" style={{ padding: '7px 10px', flexShrink: 0 }}>
                        {loadingVoices ? '⟳' : '🔄'}
                      </button>
                    </div>
                  ) : (
                  <select className="input" value={config.ttsVoiceName}
                    onChange={e => setConfig(c => ({ ...c, ttsVoiceName: e.target.value }))}>
                    <option value="">อัตโนมัติ (ไทย)</option>
                    {ttsVoices
                      .filter(v => v.lang.startsWith('th') || v.lang.startsWith('TH'))
                      .map(v => (
                        <option key={v.name} value={v.name}>
                          {v.name} {v.localService ? '' : '(online)'}
                        </option>
                      ))
                    }
                    {ttsVoices.filter(v => !v.lang.startsWith('th') && !v.lang.startsWith('TH')).length > 0 && (
                      <optgroup label="─── เสียงอื่น ───">
                        {ttsVoices
                          .filter(v => !v.lang.startsWith('th') && !v.lang.startsWith('TH'))
                          .map(v => (
                            <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
                          ))
                        }
                      </optgroup>
                    )}
                  </select>
                  )}
                </SRow>

                <SRow label={`ความเร็ว: ${config.ttsRate.toFixed(1)}x`}>
                  <input type="range" min="0.5" max="2" step="0.1" value={config.ttsRate}
                    onChange={e => setConfig(c => ({ ...c, ttsRate: Number(e.target.value) }))}
                    className="qd-slider" />
                </SRow>
                <SRow label={`ระดับเสียง: ${Math.round(config.ttsPitch * 100)}%`}>
                  <input type="range" min="0.5" max="2" step="0.1" value={config.ttsPitch}
                    onChange={e => setConfig(c => ({ ...c, ttsPitch: Number(e.target.value) }))}
                    className="qd-slider" />
                </SRow>
                <SRow label={`ความดัง: ${Math.round(config.ttsVolume * 100)}%`}>
                  <input type="range" min="0" max="1" step="0.05" value={config.ttsVolume}
                    onChange={e => setConfig(c => ({ ...c, ttsVolume: Number(e.target.value) }))}
                    className="qd-slider" />
                </SRow>

                {ttsVoices.filter(v => v.lang.startsWith('th')).length === 0 && (
                  <div className="qd-tts-warn">
                    ⚠ ไม่พบเสียงภาษาไทย — กรุณาติดตั้ง Thai Language Pack บน Windows<br/>
                    <small>Settings → Time &amp; Language → Language → Add Thai → Speech</small>
                  </div>
                )}
              </>}

              {/* ── ประกาศด้านล่าง (Footer) ── */}
              <SSec>ประกาศด้านล่าง (Footer)</SSec>
              <SRow label={`ความสูงแถบประกาศ: ${config.footerHeight}px`}>
                <input type="range" min="24" max="120" step="2" value={config.footerHeight}
                  onChange={e => setConfig(c => ({ ...c, footerHeight: Number(e.target.value) }))}
                  className="qd-slider" />
              </SRow>
              <SRow label="แสดงแถบประกาศ">
                <Tog checked={config.showFooter} onChange={v => setConfig(c => ({ ...c, showFooter: v }))} />
              </SRow>
              <SRow label="ข้อความประกาศ">
                <input className="input" value={config.marqueeText}
                  onChange={e => setConfig(c => ({ ...c, marqueeText: e.target.value }))} />
              </SRow>
              <SRow label={`ขนาดตัวอักษร: ${config.footerFontSize}px`}>
                <input type="range" min="12" max="48" step="1" value={config.footerFontSize}
                  onChange={e => setConfig(c => ({ ...c, footerFontSize: Number(e.target.value) }))}
                  className="qd-slider" />
              </SRow>
              <SRow label={`ความเร็ว: ${config.footerScrollSpeed}s`}>
                <input type="range" min="5" max="120" step="5" value={config.footerScrollSpeed}
                  onChange={e => setConfig(c => ({ ...c, footerScrollSpeed: Number(e.target.value) }))}
                  className="qd-slider" />
              </SRow>
              <SRow label="สีพื้นหลัง Footer">
                <CInput value={config.footerBg} onChange={v => setConfig(c => ({ ...c, footerBg: v }))} />
              </SRow>
              <SRow label="สีข้อความ Footer">
                <CInput value={config.footerTextColor} onChange={v => setConfig(c => ({ ...c, footerTextColor: v }))} />
              </SRow>
            </div>
            <div className="qd-panel-ft">
              {saveDefaultMsg && <span className="qd-default-msg">{saveDefaultMsg}</span>}
              <button className="btn btn-ghost" onClick={() => setShowSettings(false)}>ยกเลิก</button>
              <button className="btn qd-btn-default" onClick={saveAsDefault}
                title={URL_DISPLAY_ID ? `บันทึกการตั้งค่าเฉพาะจอนี้ (${config.displayConfigName || URL_DISPLAY_ID})` : 'บันทึกเป็นค่าเริ่มต้นของระบบ (ทุกเครื่อง)'}>
                {URL_DISPLAY_ID ? '💾 บันทึกการตั้งค่าจอนี้' : '📌 ตั้งเป็นค่าเริ่มต้น'}
              </button>
              <button className="btn btn-primary" onClick={saveConfig}>💾 บันทึกและปิด</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="qd-setting-row">
      <label>{label}</label>
      {children}
    </div>
  )
}

function SSec({ children }: { children: React.ReactNode }) {
  return <div className="qd-section-label">{children}</div>
}

function CInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="color-row">
      <input type="color" value={value} onChange={e => onChange(e.target.value)} />
      <input className="input" value={value} onChange={e => onChange(e.target.value)} style={{ flex: 1 }} />
    </div>
  )
}

function Tog({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="qd-toggle">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="toggle-track" />
    </label>
  )
}
