import { useState, useEffect, useCallback, useRef } from 'react'
import { getQueueList, callQueue, onQueueCalled, onQueueAudio, updateQueueStatus, getDisplayConfigs, getDisplayQDConfig, getCallsToday, prewarmTTS } from '../lib/api'
import './QueueMini.css'

type QueueStatus = 'waiting' | 'calling' | 'done' | 'skip'
type QueueRow = QueueItem & { status: QueueStatus }
type QueueMode = 'slot' | 'opd' | 'slot_cur' | 'cur_dep'

export default function QueueMiniPage() {
  const [queues, setQueues] = useState<QueueRow[]>([])
  const [displayConfigs, setDisplayConfigs] = useState<DisplayConfigItem[]>([])
  // On open: always sync from main page (qc_active_*). User can change manually after opening.
  const [selectedDisplayId, setSelectedDisplayId] = useState<string>(
    () => localStorage.getItem('qc_active_display') || ''
  )
  const [selectedChannel, setSelectedChannel] = useState<string>(
    () => localStorage.getItem('qc_active_sp') || ''
  )
  const [mode, setMode] = useState<QueueMode>(
    () => (localStorage.getItem('qc_mode') as QueueMode) || 'slot'
  )
  const [currentCalled, setCurrentCalled] = useState<{ queueNo: string; servicePoint: string } | null>(null)
  const [callingId, setCallingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [clock, setClock] = useState(new Date())
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [manualVal, setManualVal] = useState('')
  const [manualLoading, setManualLoading] = useState(false)
  const [qdFilterDepts, setQdFilterDepts] = useState<string[]>([])
  const lastCalledVnRef = useRef<string | null>(null)
  const currentSpNameRef = useRef<string>('')
  const selectedDisplayIdRef = useRef<string>('')
  const callNextBtnRef = useRef<HTMLButtonElement>(null)
  const manualRef = useRef<HTMLInputElement>(null)
  const keepFocusRef = useRef(false)
  const keepFocusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const selectedDisplay = displayConfigs.find(d => d.id === selectedDisplayId)
  const displayChannels: string[] = selectedDisplay?.channels || []
  const currentSpName = selectedChannel || displayChannels[0] || ''

  useEffect(() => { const t = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(t) }, [])

  const loadDisplays = useCallback(async () => {
    try {
      const data = await getDisplayConfigs()
      setDisplayConfigs(data)
      setSelectedDisplayId(prev => {
        if (prev && data.find(d => d.id === prev)) return prev
        const active = localStorage.getItem('qc_active_display') || ''
        return active && data.find(d => d.id === active) ? active : (data[0]?.id || prev)
      })
      // Set channel from main page if not yet set
      setSelectedChannel(prev => {
        if (prev) return prev
        return localStorage.getItem('qc_active_sp') || ''
      })
    } catch {}
  }, [])

  const loadQueues = useCallback(async () => {
    try {
      const [res, calls] = await Promise.all([getQueueList(mode), getCallsToday(mode)])
      if (res.success) {
        const rows = res.data as QueueRow[]
        setQueues(rows)
        const sp = currentSpNameRef.current
        const did = selectedDisplayIdRef.current
        if (sp && did) {
          const waiting = rows
            .filter(r => !calls.find((c: { vn: string; status?: string }) => c.vn === r.vn) ||
                         calls.find((c: { vn: string; status?: string }) => c.vn === r.vn)?.status === 'waiting')
            .slice(0, 5)
            .map(r => ({ no: String(r.queue_slot || r.queue_no || ''), name: r.queue_name || '' }))
          if (waiting.length) prewarmTTS(waiting, sp, did)
        }
        setCurrentCalled(prev => {
          if (prev) return prev
          const callingRows = rows.filter(r => r.status === 'calling')
          if (!callingRows.length) return null
          const latest = callingRows.reduce((best, r) => {
            const t = calls.find((c: { vn: string; calledAt?: string }) => c.vn === r.vn)?.calledAt || ''
            const bestT = calls.find((c: { vn: string; calledAt?: string }) => c.vn === best.vn)?.calledAt || ''
            return t > bestT ? r : best
          })
          if (!lastCalledVnRef.current) lastCalledVnRef.current = latest.vn
          return { queueNo: String(latest.queue_slot || latest.queue_no || ''), servicePoint: latest.service_point || '' }
        })
      }
    } catch {}
    finally { setLoading(false) }
  }, [mode])

  useEffect(() => {
    currentSpNameRef.current = currentSpName
    selectedDisplayIdRef.current = selectedDisplayId
  }, [currentSpName, selectedDisplayId])

  useEffect(() => { loadDisplays() }, [loadDisplays])
  useEffect(() => { loadQueues() }, [loadQueues])
  useEffect(() => { const t = setInterval(loadQueues, 15000); return () => clearInterval(t) }, [loadQueues])

  useEffect(() => {
    const off = onQueueCalled(data => { setCurrentCalled(data); loadQueues() })
    return off
  }, [loadQueues])

  useEffect(() => {
    if (!selectedDisplayId) { setQdFilterDepts([]); return }
    getDisplayQDConfig(selectedDisplayId).then(cfg => {
      const depts = cfg?.filterDepts
      setQdFilterDepts(Array.isArray(depts) ? (depts as string[]) : [])
    })
  }, [selectedDisplayId])


  // Sync mode changes from main page
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === 'qc_mode' && e.newValue) setMode(e.newValue as QueueMode)
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  const flash = (ok: boolean, text: string) => {
    setMsg({ ok, text })
    setTimeout(() => setMsg(null), 3000)
  }

  const doCall = async (vn: string, queueNo?: string) => {
    window.focus()
    // Schedule focus retries after call — using moveBy(0,0) which Edge allows for popups
    // Covers the ~3s window when display audio starts playing and Edge might push mini behind
    keepFocusRef.current = true
    if (keepFocusTimerRef.current) clearTimeout(keepFocusTimerRef.current)
    keepFocusTimerRef.current = setTimeout(() => { keepFocusRef.current = false }, 8000)
    ;[500, 1500, 2500, 3500, 4500, 5500].forEach(t =>
      setTimeout(() => {
        if (!keepFocusRef.current) return
        try { window.focus() } catch {}
        try { window.moveBy(0, 0) } catch {}
      }, t)
    )
    setCallingId(vn)
    try {
      const res = await callQueue(vn, currentSpName, mode, selectedDisplayId || undefined)
      if (res.success) {
        lastCalledVnRef.current = vn
        const calledNo = res.queueNo || queueNo || vn
        setCurrentCalled({ queueNo: calledNo, servicePoint: currentSpName })
        flash(true, `เรียก ${calledNo} สำเร็จ`)
        window.focus()
        loadQueues()
      } else {
        flash(false, res.message || 'ไม่สำเร็จ')
      }
    } catch { flash(false, 'เกิดข้อผิดพลาด') }
    finally { setCallingId(null) }
  }

  const handleCallNext = () => {
    // Use same dept filter as main page (qc_filter_depts) — prevents calling wrong dept queue
    let activeDepts: string[] = qdFilterDepts
    try {
      const mainDepts: string[] = JSON.parse(localStorage.getItem('qc_filter_depts') || '[]')
      if (mainDepts.length > 0) activeDepts = mainDepts
    } catch {}
    const byDept = (q: QueueRow) => !activeDepts.length || activeDepts.includes(q.department || '')
    const next = queues.find(q => q.status === 'waiting' && byDept(q))
    if (next) doCall(next.vn, String(next.queue_slot || next.queue_no || ''))
  }

  const handleRecall = () => {
    if (!currentCalled) return
    const identifier = lastCalledVnRef.current ?? String(currentCalled.queueNo)
    doCall(identifier, String(currentCalled.queueNo))
  }

  const handleNoShow = async () => {
    const cur = queues.find(q => q.status === 'calling')
    if (!cur) return
    try { await updateQueueStatus(cur.vn, 'skip'); setCurrentCalled(null); loadQueues() } catch {}
  }

  const handleManualCall = async (e: React.FormEvent) => {
    e.preventDefault()
    const val = manualVal.trim()
    if (!val) return
    setManualLoading(true)
    try {
      const res = await callQueue(val, currentSpName, mode, selectedDisplayId || undefined)
      if (res.success) {
        setCurrentCalled({ queueNo: res.queueNo || val, servicePoint: currentSpName })
        setManualVal('')
        flash(true, `เรียกคิว ${res.queueNo || val} สำเร็จ`)
        loadQueues()
      } else { flash(false, res.message || 'ไม่พบคิว') }
    } catch { flash(false, 'เกิดข้อผิดพลาด') }
    finally { setManualLoading(false); manualRef.current?.focus() }
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F2') { e.preventDefault(); window.focus(); handleCallNext() }
      if (e.key === 'F3') { e.preventDefault(); window.focus(); handleRecall() }
      if (e.key === 'F4') { e.preventDefault(); handleNoShow() }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  })

  const waiting = queues.filter(q => q.status === 'waiting').length
  const hasCalling = queues.some(q => q.status === 'calling')

  return (
    <div className="qm-bg">
      <header className="qm-header">
        <div className="qm-header-left">
          <span className="qm-logo">Q</span>
          <span className="qm-title">เรียกคิว</span>
          <button
            className={`qm-mode-badge ${mode === 'opd' ? 'opd' : ''}`}
            onClick={() => { const n: QueueMode = mode === 'slot' ? 'opd' : 'slot'; setMode(n); localStorage.setItem('qc_mode', n); setQueues([]); setCurrentCalled(null) }}
            title={mode === 'slot' ? 'HOSxP Queue' : 'OPD Visit'}
          >{mode === 'slot' ? 'HQ' : 'OPD'}</button>
        </div>
        <span className="qm-clock">{clock.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
      </header>

      {/* Display & channel selectors */}
      <div className="qm-serve-card">
        <div className="qm-serve-card-top">
          <span className="qm-serve-label">กำลังให้บริการ</span>
          <div className="qm-serve-selectors">
            <select className="qm-serve-display-select" value={selectedDisplayId}
              onChange={e => { const id = e.target.value; setSelectedDisplayId(id); const disp = displayConfigs.find(d => d.id === id); const ch = disp?.channels?.[0] || ''; setSelectedChannel(ch) }}>
              {displayConfigs.length === 0
                ? <option value="">ไม่มีจอ</option>
                : displayConfigs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            {displayChannels.length > 0 && (
              <select className="qm-serve-sp-select" value={selectedChannel || displayChannels[0]}
                onChange={e => setSelectedChannel(e.target.value)}>
                {displayChannels.map(ch => <option key={ch} value={ch}>ช่อง {ch}</option>)}
              </select>
            )}
          </div>
        </div>
        {currentCalled
          ? <div className="qm-serve-no">{currentCalled.queueNo}</div>
          : <div className="qm-serve-empty">—</div>}
      </div>

      {/* Action buttons */}
      <div className="qm-actions">
        <button ref={callNextBtnRef} className="qm-btn qm-btn-next" onClick={handleCallNext}
          disabled={!!callingId || (!loading && !waiting)}>
          {loading || callingId ? <span className="qm-spinner" /> : <span>▶</span>}
          {loading ? 'กำลังโหลด...' : !waiting ? 'ไม่มีคิวรอ' : 'เรียกถัดไป'}
          <kbd className="qm-kbd">F2</kbd>
        </button>
        <div className="qm-actions-row2">
          <button className="qm-btn qm-btn-recall" onClick={handleRecall} disabled={!!callingId || !currentCalled}>
            <span>↻</span> เรียกซ้ำ <kbd className="qm-kbd">F3</kbd>
          </button>
          <button className="qm-btn qm-btn-noshow" onClick={handleNoShow} disabled={!!callingId || !hasCalling}>
            <span>✕</span> ไม่มา <kbd className="qm-kbd">F4</kbd>
          </button>
        </div>
      </div>

      {/* Manual call */}
      <form className="qm-manual" onSubmit={handleManualCall}>
        <input ref={manualRef} className="qm-manual-input" type="text" placeholder="QN / HN / ยิงบาร์โค้ด..."
          value={manualVal} onChange={e => setManualVal(e.target.value)} disabled={manualLoading} autoFocus />
        <button className="qm-manual-btn" type="submit" disabled={manualLoading || !manualVal.trim()}>
          {manualLoading ? <span className="qm-spinner" /> : '📢'}
        </button>
      </form>

      {/* Stats */}
      <div className="qm-stats">
        <div className="qm-stat waiting"><span>{waiting}</span><label>รอเรียก</label></div>
        <div className="qm-stat done"><span>{queues.filter(q => q.status === 'done').length}</span><label>แล้ว</label></div>
        <div className="qm-stat skip"><span>{queues.filter(q => q.status === 'skip').length}</span><label>ไม่มา</label></div>
      </div>

      {msg && <div className={`qm-toast ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
    </div>
  )
}
