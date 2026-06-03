import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getQueueList, callQueue, onQueueCalled, updateQueueStatus,
  getServicePoints, getDisplayConfigs
} from '../lib/api'
import './QueueCall.css'

type QueueStatus = 'waiting' | 'calling' | 'done' | 'skip'
type QueueRow = QueueItem & { status: QueueStatus }
type QueueMode = 'slot' | 'opd' | 'cur_dep' | 'slot_cur'

function getPrefsKey() {
  const officer = sessionStorage.getItem('officer') || 'default'
  return `qc_prefs_${officer}`
}

function loadSavedPrefs() {
  try {
    return JSON.parse(localStorage.getItem(getPrefsKey()) || 'null') as
      { servicePointId?: string; filterDepts?: string[]; selectedDisplayId?: string } | null
  } catch { return null }
}

export default function QueueCallPage() {
  const navigate = useNavigate()
  const [queues, setQueues] = useState<QueueRow[]>([])
  const [loading, setLoading] = useState(false)
  const [callingId, setCallingId] = useState<string | null>(null)

  // Display configs
  const [displayConfigs, setDisplayConfigs] = useState<DisplayConfigItem[]>([])
  const [selectedDisplayId, setSelectedDisplayId] = useState<string>(() => loadSavedPrefs()?.selectedDisplayId || '')

  // Service points (global fallback)
  const [servicePoints, setServicePoints] = useState<ServicePoint[]>([])
  const [servicePointId, setServicePointId] = useState<string>(() => loadSavedPrefs()?.servicePointId || '')

  // Derived: channels from selected display (if any)
  const selectedDisplay = displayConfigs.find(d => d.id === selectedDisplayId)
  const displayChannels = selectedDisplay?.channels || []
  const useDisplayChannels = selectedDisplayId !== '' && displayChannels.length > 0

  // Active channel name
  const activeChannelName = useDisplayChannels
    ? (servicePointId || (displayChannels[0] ?? ''))
    : (servicePoints.find(sp => sp.id === servicePointId)?.name || '')

  const [mode, setMode] = useState<QueueMode>(() => (localStorage.getItem('qc_mode') as QueueMode) || 'slot')

  const [filterDepts, setFilterDepts] = useState<string[]>(() => loadSavedPrefs()?.filterDepts || [])
  const [savedPrefsMsg, setSavedPrefsMsg] = useState(false)
  const [showDeptMenu, setShowDeptMenu] = useState(false)
  const [deptSearch, setDeptSearch] = useState('')
  const deptSearchRef = useRef<HTMLInputElement>(null)
  const [filterStatus, setFilterStatus] = useState<'all' | 'waiting' | 'calling'>('all')
  const [currentCalled, setCurrentCalled] = useState<{ queueNo: string; servicePoint: string } | null>(null)
  const [clock, setClock] = useState(new Date())
  const [showSettingsMenu, setShowSettingsMenu] = useState(false)
  const [quickCall, setQuickCall] = useState('')
  const [quickCallMsg, setQuickCallMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [manualTab, setManualTab] = useState<'search' | 'scan'>('search')
  const [confirmEnabled, setConfirmEnabled] = useState(() => localStorage.getItem('qc_confirm') === 'true')
  const [pendingCall, setPendingCall] = useState<QueueRow | null>(null)

  const settingsRef = useRef<HTMLDivElement>(null)
  const quickCallRef = useRef<HTMLInputElement>(null)
  const deptMenuRef = useRef<HTMLDivElement>(null)
  const isModeFirstMount = useRef(true)

  const currentSp = servicePoints.find(sp => sp.id === servicePointId)
  const currentSpName = useDisplayChannels ? activeChannelName : (currentSp?.name || '')

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const loadSP = useCallback(async () => {
    try {
      const data = await getServicePoints()
      setServicePoints(data)
      setServicePointId(prev => {
        // Validate: saved ID still exists in the list
        if (prev && data.some(sp => sp.id === prev)) return prev
        // Fallback to first SP
        return data.length > 0 ? data[0].id : prev
      })
    } catch {}
  }, [])

  const savePrefs = () => {
    localStorage.setItem(getPrefsKey(), JSON.stringify({ servicePointId, filterDepts, selectedDisplayId }))
    setSavedPrefsMsg(true)
    setTimeout(() => setSavedPrefsMsg(false), 2500)
  }

  useEffect(() => { loadSP() }, [loadSP])
  useEffect(() => { getDisplayConfigs().then(setDisplayConfigs) }, [])

  const loadQueues = useCallback(async () => {
    setLoading(true)
    const res = await getQueueList(mode)
    setLoading(false)
    if (res.success) {
      const rows = res.data as QueueRow[]
      setQueues(rows)
      // restore currentCalled from a calling queue if state was lost (e.g. page reload)
      setCurrentCalled(prev => {
        if (prev) return prev
        const calling = rows.find(r => r.status === 'calling')
        if (!calling) return null
        const queueNo = calling.queue_slot || calling.queue_no || ''
        return { queueNo, servicePoint: calling.service_point || '' }
      })
    }
  }, [mode])

  useEffect(() => {
    setQueues([])
    // First mount: keep filterDepts restored from prefs; subsequent mode changes: clear
    if (isModeFirstMount.current) {
      isModeFirstMount.current = false
    } else {
      setFilterDepts([])
    }
    setCurrentCalled(null)
    loadQueues()
  }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setInterval(loadQueues, 15000)
    return () => clearInterval(t)
  }, [loadQueues])

  useEffect(() => {
    const off = onQueueCalled((data) => {
      setCurrentCalled(data)
      loadQueues()
    })
    return off
  }, [loadQueues])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node))
        setShowSettingsMenu(false)
    }
    if (showSettingsMenu) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showSettingsMenu])

  // Auto-focus quick-call input and redirect barcode scanner input here
  useEffect(() => {
    quickCallRef.current?.focus()
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName.toLowerCase()
      if (tag === 'input' || tag === 'select' || tag === 'textarea' || tag === 'button') return
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        quickCallRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (deptMenuRef.current && !deptMenuRef.current.contains(e.target as Node))
        setShowDeptMenu(false)
    }
    if (showDeptMenu) {
      document.addEventListener('mousedown', handler)
      setTimeout(() => deptSearchRef.current?.focus(), 60)
    } else {
      setDeptSearch('')
    }
    return () => document.removeEventListener('mousedown', handler)
  }, [showDeptMenu])

  // ── Queue handlers ──────────────────────────────────────────────────────────

  const handleCall = async (queue: QueueRow) => {
    if (confirmEnabled) { setPendingCall(queue); return }
    await doCall(queue)
  }

  const doCall = async (queue: QueueRow) => {
    setCallingId(queue.vn)
    try {
      const res = await callQueue(queue.vn, currentSpName, mode, selectedDisplayId || undefined)
      if (res.success) {
        setCurrentCalled({ queueNo: res.queueNo || queue.queue_no, servicePoint: currentSpName })
        loadQueues()
      } else {
        setQuickCallMsg({ ok: false, text: res.message || 'เรียกคิวไม่สำเร็จ' })
        setTimeout(() => setQuickCallMsg(null), 3000)
      }
    } catch {
      setQuickCallMsg({ ok: false, text: 'เกิดข้อผิดพลาด กรุณาลองใหม่' })
      setTimeout(() => setQuickCallMsg(null), 3000)
    } finally {
      setCallingId(null)
    }
  }

  const handleConfirm = async () => {
    if (!pendingCall) return
    const q = pendingCall
    setPendingCall(null)
    await doCall(q)
  }

  const handleCallNext = async () => {
    const next = queues.find(q =>
      q.status === 'waiting' &&
      (filterDepts.length === 0 || filterDepts.includes(q.department || ''))
    )
    if (next) await handleCall(next)
  }

  const handleRecall = async () => {
    const cur = queues.find(q => q.status === 'calling')
    if (cur) await handleCall(cur)
  }

  const handleNoShow = async () => {
    const cur = queues.find(q => q.status === 'calling')
    if (!cur) return
    try {
      await updateQueueStatus(cur.vn, 'skip')
      setCurrentCalled(null)
      loadQueues()
    } catch {}
  }

  const handleQuickCall = async (e: React.FormEvent) => {
    e.preventDefault()
    const val = quickCall.trim()
    if (!val) return
    setCallingId('__quick__')
    try {
      const res = await callQueue(val, currentSpName, mode, selectedDisplayId || undefined)
      if (res.success) {
        setCurrentCalled({ queueNo: res.queueNo || val, servicePoint: currentSpName })
        setQuickCall('')
        setQuickCallMsg({ ok: true, text: `เรียกคิว ${res.queueNo || val} สำเร็จ` })
        loadQueues()
      } else {
        setQuickCallMsg({ ok: false, text: res.message || 'ไม่พบคิว' })
      }
    } catch {
      setQuickCallMsg({ ok: false, text: 'เกิดข้อผิดพลาด กรุณาลองใหม่' })
    } finally {
      setCallingId(null)
      setTimeout(() => setQuickCallMsg(null), 3000)
      quickCallRef.current?.focus()
    }
  }

  const handleStatusChange = async (queue: QueueRow, status: QueueStatus) => {
    try { await updateQueueStatus(queue.vn, status); loadQueues() } catch {}
  }

  // ── Derived values ──────────────────────────────────────────────────────────

  const activeQueues = queues.filter(q => q.status === 'waiting' || q.status === 'calling')

  const deptOptions = Array.from(new Set(activeQueues.map(q => q.department).filter(Boolean))).sort()

  const toggleDept = (dept: string) =>
    setFilterDepts(prev => prev.includes(dept) ? prev.filter(d => d !== dept) : [...prev, dept])

  const filteredQueues = activeQueues.filter(q => {
    const matchDept = filterDepts.length === 0 || filterDepts.includes(q.department || '')
    const matchStatus = filterStatus === 'all'
      ? q.status !== 'skip' && q.status !== 'cleared'
      : q.status === filterStatus
    return matchDept && matchStatus
  })

  // Count by status — respect dept filter so summary reflects selected room/display
  const deptFilteredQueues = filterDepts.length === 0
    ? queues
    : queues.filter(q => filterDepts.includes(q.department || ''))
  const countByStatus = (s: string) => deptFilteredQueues.filter(q => q.status === s).length

  const statusLabel: Record<string, string> = {
    waiting: 'รอเรียก', calling: 'กำลังเรียก', done: 'เสร็จแล้ว', skip: 'ไม่มา'
  }
  const statusClass: Record<string, string> = {
    waiting: 'badge-waiting', calling: 'badge-calling', done: 'badge-done', skip: 'badge-skip'
  }

  const hasCallingQueue = queues.some(q => q.status === 'calling')
  const hasWaitingQueue = queues.some(q =>
    q.status === 'waiting' &&
    (filterDepts.length === 0 || filterDepts.includes(q.department || ''))
  )

  return (
    <div className="qc-bg">
      <div className="qc-bg-wave" />

      {/* ─── Top Bar ─── */}
      <header className="qc-topbar">
        <div className="qc-topbar-left">
          {/* ── จุดแสดงคิว selector ── */}
          <div className="qc-topbar-sp">
            <span className="qc-topbar-sp-label">จุดแสดงคิว</span>
            <select
              className="qc-topbar-sp-select"
              value={selectedDisplayId}
              onChange={e => {
                setSelectedDisplayId(e.target.value)
                setServicePointId('') // reset channel when display changes
              }}
            >
              <option value="">— ทั่วไป (ไม่ระบุจอ) —</option>
              {displayConfigs.map(d => (
                <option key={d.id} value={d.id}>
                  📺 {d.name}{d.channels?.length ? ` (${d.channels.length} ช่อง)` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* ── ช่องบริการ ── */}
          <div className="qc-topbar-sp">
            <span className="qc-topbar-sp-label">ช่องบริการ</span>
            {useDisplayChannels ? (
              <select
                className="qc-topbar-sp-select"
                value={servicePointId}
                onChange={e => setServicePointId(e.target.value)}
              >
                {displayChannels.map(ch => (
                  <option key={ch} value={ch}>{ch}</option>
                ))}
              </select>
            ) : servicePoints.length > 0 ? (
              <select
                className="qc-topbar-sp-select"
                value={servicePointId}
                onChange={e => setServicePointId(e.target.value)}
              >
                {servicePoints.map(sp => (
                  <option key={sp.id} value={sp.id}>{sp.name}</option>
                ))}
              </select>
            ) : (
              <span className="qc-topbar-sp-none">— ไม่มีช่องบริการ</span>
            )}
            <button
              className="qc-topbar-sp-manage"
              onClick={() => navigate('/app-settings')}
              title="จัดการช่องบริการ"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        <div className="qc-topbar-center">
          <div className="qc-mode-switch">
            {/* ── กลุ่ม 1: Queue Prefix (opd_qs_slot) ── */}
            <div className="qc-mode-group group-prefix">
              <button
                className={`qc-mode-btn prefix${mode === 'slot' ? ' active' : ''}`}
                onClick={() => { setMode('slot'); localStorage.setItem('qc_mode', 'slot') }}
                title="HOSxP Queue Slot (opd_qs_slot / main_dep)"
              >Queue_Prefix</button>
              <button
                className={`qc-mode-btn prefix${mode === 'slot_cur' ? ' active' : ''}`}
                onClick={() => { setMode('slot_cur'); localStorage.setItem('qc_mode', 'slot_cur') }}
                title="HOSxP Queue Slot ตามห้องตรวจปัจจุบัน (opd_qs_slot / cur_dep)"
              >Queue_Prefix_Room</button>
            </div>

            <div className="qc-mode-sep" />

            {/* ── กลุ่ม 2: Queue OPD (ovst) ── */}
            <div className="qc-mode-group group-opd">
              <button
                className={`qc-mode-btn opd${mode === 'opd' ? ' active' : ''}`}
                onClick={() => { setMode('opd'); localStorage.setItem('qc_mode', 'opd') }}
                title="OPD Visit (ovst / main_dep)"
              >Queue_OPD</button>
              <button
                className={`qc-mode-btn opd${mode === 'cur_dep' ? ' active' : ''}`}
                onClick={() => { setMode('cur_dep'); localStorage.setItem('qc_mode', 'cur_dep') }}
                title="OPD Visit ตามห้องตรวจปัจจุบัน (ovst / cur_dep)"
              >Queue_OPD_Room</button>
            </div>
          </div>
        </div>

        <div className="qc-topbar-right">
          <div className="qc-clock">
            {clock.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          <div className="qc-settings-wrap" ref={settingsRef}>
            <button className="qc-settings-btn" onClick={() => setShowSettingsMenu(v => !v)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              ตั้งค่า
            </button>
            {showSettingsMenu && (
              <div className="qc-settings-dropdown">
                <div className="qc-sd-header">ตั้งค่า</div>
                <button className="qc-sd-action" onClick={() => { navigate('/app-settings'); setShowSettingsMenu(false) }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="2" />
                    <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  จัดการช่องบริการ
                </button>
                <div className="qc-sd-divider" />
                <button className="qc-sd-action" onClick={() => { navigate('/queue-history'); setShowSettingsMenu(false) }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                    <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  ประวัติการเรียกคิว
                </button>
                <div className="qc-sd-divider" />
                <button className="qc-sd-action" onClick={() => { navigate('/display-configs'); setShowSettingsMenu(false) }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <rect x="2" y="4" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
                    <path d="M8 20h8M12 18v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  จัดการหน้าจอแสดงคิว
                </button>
                <div className="qc-sd-divider" />
                <button className="qc-sd-action" onClick={() => {
                  window.open('/#/queue-mini', '_blank', 'width=320,height=540,resizable=yes,menubar=no,toolbar=no,location=no')
                  setShowSettingsMenu(false)
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="2" />
                    <path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  เปิดหน้า Mini
                </button>
                <div className="qc-sd-divider" />
                <button className="qc-sd-action" onClick={() => { loadQueues(); setShowSettingsMenu(false) }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M1 4v6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  รีเฟรชคิว
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="qc-body">

        {/* ─── Left Panel ─── */}
        <aside className="qc-panel-left">
          <div className="qc-serve-card">
            <p className="qc-serve-label">กำลังให้บริการ &nbsp;·&nbsp; {currentSpName || '—'}</p>
            {currentCalled ? (
              <div className="qc-serve-no">{currentCalled.queueNo}</div>
            ) : (
              <div className="qc-serve-empty">—</div>
            )}
          </div>

          <button className="qc-btn-action qc-btn-next" onClick={handleCallNext}
            disabled={!!callingId || !hasWaitingQueue}>
            {callingId && callingId !== '__quick__'
              ? <span className="qc-btn-spinner" />
              : <span className="qc-btn-icon">▶</span>}
            เรียกคิวถัดไป
          </button>

          <button className="qc-btn-action qc-btn-recall" onClick={handleRecall}
            disabled={!!callingId || !hasCallingQueue}>
            <span className="qc-btn-icon">○</span>เรียกซ้ำ
          </button>

          <button className="qc-btn-action qc-btn-noshow" onClick={handleNoShow}
            disabled={!!callingId || !hasCallingQueue}>
            <span className="qc-btn-icon">✕</span>เรียกไม่มา
          </button>

          <div className="qc-manual-card">
            <div className="qc-manual-label">เรียกด้วย Q / HN</div>
            <form onSubmit={handleQuickCall} className="qc-manual-form">
              <input ref={quickCallRef} className="input qc-manual-input" type="text"
                placeholder="พิมพ์เลขคิว (Q) หรือ HN... / ยิงบาร์โค้ด"
                value={quickCall} onChange={e => setQuickCall(e.target.value)}
                autoFocus
                onBlur={() => setTimeout(() => {
                  const tag = document.activeElement?.tagName.toLowerCase()
                  if (!tag || !['input','select','textarea','button'].includes(tag))
                    quickCallRef.current?.focus()
                }, 150)} />
              <button className="qc-manual-btn" type="submit"
                disabled={callingId === '__quick__' || !quickCall.trim()}>
                {callingId === '__quick__' ? <span className="qc-btn-spinner" /> : '📢'}
              </button>
            </form>
            {quickCallMsg && (
              <p className={`qc-quick-msg ${quickCallMsg.ok ? 'ok' : 'err'}`}>{quickCallMsg.text}</p>
            )}
          </div>

          <div className="qc-stats-row">
            <div className="qc-stat-box stat-waiting"><span>{countByStatus('waiting')}</span><label>คิวรอ</label></div>
            <div className="qc-stat-box stat-done"><span>{countByStatus('done')}</span><label>ให้บริการแล้ว</label></div>
            <div className="qc-stat-box stat-skip"><span>{countByStatus('skip')}</span><label>ไม่มา</label></div>
          </div>

          <label className={`qc-autocall-toggle ${confirmEnabled ? 'on' : ''}`}>
            <div className="qc-autocall-left">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span>ยืนยันก่อนเรียกคิว</span>
            </div>
            <div className="qc-autocall-switch">
              <input type="checkbox" checked={confirmEnabled} onChange={e => {
                setConfirmEnabled(e.target.checked)
                localStorage.setItem('qc_confirm', String(e.target.checked))
              }} />
              <span className="qc-autocall-track">
                <span className="qc-autocall-thumb" />
              </span>
            </div>
          </label>
        </aside>

        {/* ─── Right Panel ─── */}
        <main className="qc-panel-right">
          <div className="qc-filters card">
            <div className="qc-dept-row">
            <span className="qc-dept-label">แผนก</span>
            <div className="qc-dept-dropdown" ref={deptMenuRef}>
              <button className={`qc-dept-trigger ${showDeptMenu ? 'open' : ''}`}
                onClick={() => setShowDeptMenu(v => !v)}>
                <span className="qc-dept-trigger-text">
                  {filterDepts.length === 0
                    ? 'None selected'
                    : filterDepts.length === 1
                      ? filterDepts[0]
                      : `เลือก ${filterDepts.length} แผนก`}
                </span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="qc-dept-caret">
                  <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {showDeptMenu && (
                <div className="qc-dept-menu">
                  <div className="qc-dept-search-wrap">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="qc-dept-search-icon">
                      <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
                      <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                    <input
                      ref={deptSearchRef}
                      className="qc-dept-search-input"
                      type="text"
                      placeholder="ค้นหาแผนก..."
                      value={deptSearch}
                      onChange={e => setDeptSearch(e.target.value)}
                      onKeyDown={e => e.stopPropagation()}
                    />
                    {deptSearch && (
                      <button className="qc-dept-search-clear" onClick={() => { setDeptSearch(''); deptSearchRef.current?.focus() }}>✕</button>
                    )}
                  </div>
                  <div className="qc-dept-list-scroll">
                    {!deptSearch && (
                      <>
                        <label className="qc-dept-item all-item">
                          <input type="checkbox" checked={filterDepts.length === 0} onChange={() => setFilterDepts([])} />
                          <span>ทุกแผนก</span>
                          <span className="qc-dept-item-cnt">{activeQueues.length}</span>
                        </label>
                        <div className="qc-dept-divider" />
                      </>
                    )}
                    {deptOptions
                      .filter(d => !deptSearch || d.toLowerCase().includes(deptSearch.toLowerCase()))
                      .map(dept => (
                        <label key={dept} className="qc-dept-item">
                          <input
                            type="checkbox"
                            checked={filterDepts.includes(dept)}
                            onChange={() => toggleDept(dept)}
                          />
                          <span>{dept}</span>
                          <span className="qc-dept-item-cnt">
                            {activeQueues.filter(q => q.department === dept).length}
                          </span>
                        </label>
                      ))
                    }
                    {deptSearch && deptOptions.filter(d => d.toLowerCase().includes(deptSearch.toLowerCase())).length === 0 && (
                      <div className="qc-dept-no-result">ไม่พบแผนก "{deptSearch}"</div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <button
              className={`qc-save-prefs-btn${savedPrefsMsg ? ' saved' : ''}`}
              onClick={savePrefs}
              title={`จำค่าช่องบริการ (${currentSpName}) และแผนกที่เลือก สำหรับ ${sessionStorage.getItem('officer') || 'user'}`}
            >
              {savedPrefsMsg ? '✓ บันทึกแล้ว' : '💾 จำค่า'}
            </button>
            </div>
            <div className="qc-filter-tabs">
              {(['all', 'waiting', 'calling'] as const).map(s => (
                <button key={s} className={`qc-tab ${filterStatus === s ? 'active' : ''}`} onClick={() => setFilterStatus(s)}>
                  {s === 'all' ? `ทั้งหมด (${deptFilteredQueues.length})` : `${statusLabel[s]} (${countByStatus(s)})`}
                </button>
              ))}
              <button className="qc-history-btn" onClick={() => navigate('/queue-history')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                  <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                ประวัติ
              </button>
            </div>
          </div>

          <div className="qc-table-wrap">
            {loading && queues.length === 0 ? (
              <div className="qc-empty"><div className="qc-loader" /><p>กำลังโหลด...</p></div>
            ) : filteredQueues.length === 0 ? (
              <div className="qc-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" opacity="0.2">
                  <rect x="3" y="3" width="18" height="18" rx="3" stroke="#fff" strokeWidth="1.5" />
                  <path d="M9 9h6M9 12h4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <p>ไม่พบข้อมูล</p>
              </div>
            ) : (
              <table className="qc-table">
                <thead><tr>
                  <th>วันที่</th>
                  {(mode === 'slot' || mode === 'slot_cur') && <th>Queue Dep</th>}
                  <th>{(mode === 'slot' || mode === 'slot_cur') ? 'oqueue' : 'คิว'}</th>
                  <th>HN</th>
                  <th>ชื่อ</th><th>สิทธิการรักษา</th><th>แผนก</th>
                  <th>ประเภท</th><th>สถานะ</th>
                  <th>
                    <div className="qc-th-action">
                      จัดการ
                      {queues.some(q => q.status === 'calling') && (
                        <button
                          className="qc-tick-all-btn"
                          onClick={async () => {
                            const calling = queues.filter(q => q.status === 'calling')
                            await Promise.all(calling.map(q => updateQueueStatus(q.vn, 'done')))
                            setCurrentCalled(null)
                            loadQueues()
                          }}
                          title="ติ๊ก done ทุก calling"
                        >
                          ✓ All
                        </button>
                      )}
                    </div>
                  </th>
                </tr></thead>
                <tbody>
                  {filteredQueues.map((q, i) => (
                    <tr key={`${q.vn}-${i}`}
                      className={`qc-tr ${q.status === 'calling' ? 'qc-tr-calling' : ''} ${q.status === 'done' ? 'qc-tr-done' : ''}`}>
                      <td className="qc-td-date">
                        <div>{q.vstdate ? String(q.vstdate).substring(0, 10) : '—'}</div>
                        {q.vsttime && <div className="qc-td-time">{String(q.vsttime).substring(0, 5)}</div>}
                      </td>
                      {(mode === 'slot' || mode === 'slot_cur') && <td className="qc-td-center"><span className="qc-slot-pill">{q.queue_slot ?? '—'}</span></td>}
                      <td className="qc-td-center"><span className="qc-qno-pill">{q.queue_no || '—'}</span></td>
                      <td className="qc-td-hn">{q.hn || '—'}</td>
                      <td className="qc-td-name">{q.queue_name || '—'}</td>
                      <td className="qc-td-ins">{q.insurance || '—'}</td>
                      <td className="qc-td-dep">{q.department || '—'}</td>
                      <td className="qc-td-center">
                        <span className={`qc-visit-badge ${q.visit_type === 'นัดมา' ? 'vb-appt' : 'vb-walk'}`}>
                          {q.visit_type || '—'}
                        </span>
                      </td>
                      <td className="qc-td-center">
                        <span className={`qc-badge ${statusClass[q.status] || 'badge-waiting'}`}>
                          {statusLabel[q.status] || q.status}
                        </span>
                      </td>
                      <td className="qc-td-action">
                        {q.status === 'waiting' && (
                          <button className="btn btn-primary qc-call-btn" onClick={() => handleCall(q)} disabled={!!callingId}>
                            {callingId === q.vn ? <span className="spinner" /> : '📢'} เรียก
                          </button>
                        )}
                        {q.status === 'calling' && (
                          <div className="qc-action-group">
                            <button className="btn btn-accent qc-recall-btn" onClick={() => handleCall(q)} disabled={!!callingId}>🔁</button>
                            <button className="btn btn-success qc-done-btn" onClick={() => handleStatusChange(q, 'done')}>✓</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </main>
      </div>

      {/* ─── Confirmation Modal ─── */}
      {pendingCall && (
        <div className="qc-confirm-overlay" onClick={() => setPendingCall(null)}>
          <div className="qc-confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="qc-confirm-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="#00BCD4" strokeWidth="2" />
                <path d="M12 8v4M12 16h.01" stroke="#00BCD4" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <h3 className="qc-confirm-title">ยืนยันการเรียกคิว</h3>
            <div className="qc-confirm-body">
              <div className="qc-confirm-no">{pendingCall.queue_slot || pendingCall.queue_no || '—'}</div>
              <p className="qc-confirm-name">{pendingCall.queue_name || '—'}</p>
              <p className="qc-confirm-meta">
                {pendingCall.department || '—'} &nbsp;·&nbsp; ช่อง <strong>{currentSpName}</strong>
              </p>
            </div>
            <div className="qc-confirm-actions">
              <button className="btn btn-ghost qc-confirm-cancel" onClick={() => setPendingCall(null)}>
                ยกเลิก
              </button>
              <button className="btn btn-primary qc-confirm-ok" onClick={handleConfirm} disabled={!!callingId}>
                {callingId ? <span className="spinner" /> : null}
                📢 ยืนยันเรียกคิว
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
