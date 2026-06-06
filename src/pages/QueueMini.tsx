import { useState, useEffect, useCallback, useRef } from 'react'
import { getQueueList, callQueue, onQueueCalled, updateQueueStatus, getDisplayConfigs, getDisplayQDConfig } from '../lib/api'
import './QueueMini.css'

type QueueStatus = 'waiting' | 'calling' | 'done' | 'skip'
type QueueRow = QueueItem & { status: QueueStatus }
type QueueMode = 'slot' | 'opd'
type View = 'main' | 'waiting' | 'done' | 'skip'

export default function QueueMiniPage() {
  const [queues, setQueues] = useState<QueueRow[]>([])
  const [displayConfigs, setDisplayConfigs] = useState<DisplayConfigItem[]>([])
  const [selectedDisplayId, setSelectedDisplayId] = useState(() => localStorage.getItem('qm_display_id') || '')
  const [selectedChannel, setSelectedChannel] = useState(() => localStorage.getItem('qm_channel') || '')
  const [currentCalled, setCurrentCalled] = useState<{ queueNo: string; servicePoint: string } | null>(null)
  const [callingId, setCallingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [minimized, setMinimized] = useState(false)
  const [confirmEnabled, setConfirmEnabled] = useState(() => localStorage.getItem('qc_confirm') === 'true')
  const [pendingCall, setPendingCall] = useState<QueueRow | null>(null)
  const [manualVal, setManualVal] = useState('')
  const [manualLoading, setManualLoading] = useState(false)
  const [clock, setClock] = useState(new Date())
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [checkDisplayPopup, setCheckDisplayPopup] = useState<{ queueNo: string; px: number; py: number } | null>(null)
  const [deptMismatchWarning, setDeptMismatchWarning] = useState<{ queueNo: string; dept: string; displayName: string; px: number; py: number } | null>(null)
  const [qdFilterDepts, setQdFilterDepts] = useState<string[]>([])
  const callNextBtnRef = useRef<HTMLButtonElement>(null)
  const [mode, setMode] = useState<QueueMode>(() => (localStorage.getItem('qc_mode') as QueueMode) || 'slot')
  const [view, setView] = useState<View>('main')
  const manualRef = useRef<HTMLInputElement>(null)
  const [localDept, setLocalDept] = useState<string>(() => {
    // เริ่มต้นจาก main page filter (dept แรก) หรือค่าที่เคยเลือกไว้
    try {
      const mainDepts: string[] = JSON.parse(localStorage.getItem('qc_filter_depts') || '[]')
      return mainDepts[0] || localStorage.getItem('qm_local_dept') || ''
    } catch { return '' }
  })

  const W = 320, H = 580

  const handleMinimize = () => {
    window.resizeTo(80, 80)
    window.moveTo(window.screen.width - 96, window.screen.height - 96)
    setMinimized(true)
  }
  const handleExpand = () => {
    window.resizeTo(W, H)
    window.moveTo(window.screen.width - W - 20, window.screen.height - H - 60)
    setMinimized(false)
  }

  const selectedDisplay = displayConfigs.find(d => d.id === selectedDisplayId)
  const displayChannels: string[] = selectedDisplay?.channels || []
  const currentSpName = selectedChannel || displayChannels[0] || ''

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const loadDisplays = useCallback(async () => {
    try {
      const data = await getDisplayConfigs()
      setDisplayConfigs(data)
      setSelectedDisplayId(prev => {
        if (prev && data.find(d => d.id === prev)) return prev
        return data.length > 0 ? data[0].id : prev
      })
    } catch {}
  }, [])

  const loadQueues = useCallback(async () => {
    try {
      const res = await getQueueList(mode)
      if (res.success) {
        const rows = res.data as QueueRow[]
        setQueues(rows)
        setCurrentCalled(prev => {
          if (prev) return prev
          const calling = rows.find(r => r.status === 'calling')
          if (!calling) return null
          return { queueNo: calling.queue_slot || calling.queue_no || '', servicePoint: calling.service_point || '' }
        })
      }
    } catch {}
    finally { setLoading(false) }
  }, [mode])

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === 'qc_mode' && e.newValue) {
        setMode(e.newValue as QueueMode)
        setQueues([])
        setCurrentCalled(null)
      }
      if (e.key === 'qc_filter_depts' && e.newValue) {
        try {
          const depts: string[] = JSON.parse(e.newValue)
          // auto-sync localDept ให้ตรงกับ main เสมอ
          setLocalDept(depts[0] || '')
        } catch {}
      }
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  // Auto-focus manual input and redirect barcode scanner input here
  useEffect(() => {
    manualRef.current?.focus()
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName.toLowerCase()
      if (tag === 'input' || tag === 'select' || tag === 'textarea' || tag === 'button') return
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        manualRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => { loadDisplays() }, [loadDisplays])
  useEffect(() => { loadQueues() }, [loadQueues])
  useEffect(() => {
    const t = setInterval(loadQueues, 15000)
    return () => clearInterval(t)
  }, [loadQueues])

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

  const flash = (ok: boolean, text: string) => {
    setMsg({ ok, text })
    setTimeout(() => setMsg(null), 3000)
  }

  const doCall = async (queue: QueueRow) => {
    // ดึง filterDepts ล่าสุดก่อนเรียก
    let activeFilter = qdFilterDepts
    if (selectedDisplayId) {
      try {
        const cfg = await getDisplayQDConfig(selectedDisplayId)
        const depts = cfg?.filterDepts
        if (Array.isArray(depts)) { activeFilter = depts as string[]; setQdFilterDepts(activeFilter) }
      } catch {}
    }
    // ถ้าคนไข้ไม่ตรงกับ filter จอ → ห้ามเรียก
    if (activeFilter.length > 0 && queue.department && !activeFilter.includes(queue.department)) {
      const selDisplay = displayConfigs.find(d => d.id === selectedDisplayId)
      const r = callNextBtnRef.current?.getBoundingClientRect()
      setDeptMismatchWarning({
        queueNo: queue.queue_slot ?? queue.queue_no ?? '?',
        dept: queue.department,
        displayName: selDisplay?.name || '',
        px: r ? r.left + r.width / 2 : window.innerWidth / 2,
        py: r ? r.top - 8 : 200,
      })
      setTimeout(() => setDeptMismatchWarning(null), 5000)
      return
    }
    setCallingId(queue.vn)
    try {
      const res = await callQueue(queue.vn, currentSpName, mode)
      if (res.success) {
        const calledNo = res.queueNo || queue.queue_no
        setCurrentCalled({ queueNo: calledNo, servicePoint: currentSpName })
        if (!selectedDisplayId) {
          const r = callNextBtnRef.current?.getBoundingClientRect()
          setCheckDisplayPopup({ queueNo: calledNo, px: r ? r.left + r.width / 2 : window.innerWidth / 2, py: r ? r.top - 8 : 200 })
          setTimeout(() => setCheckDisplayPopup(null), 4000)
        }
        flash(true, `เรียก ${calledNo} สำเร็จ`)
        loadQueues()
      } else {
        flash(false, res.message || 'ไม่สำเร็จ')
      }
    } catch {
      flash(false, 'เกิดข้อผิดพลาด')
    } finally {
      setCallingId(null)
    }
  }

  const handleCall = (queue: QueueRow) => {
    if (confirmEnabled) { setPendingCall(queue); return }
    doCall(queue)
  }

  const handleConfirm = async () => {
    if (!pendingCall) return
    const q = pendingCall
    setPendingCall(null)
    await doCall(q)
  }

  const byDept = (q: QueueRow) => !localDept || q.department === localDept

  const handleCallNext = async () => {
    const next = queues.find(q => q.status === 'waiting' && byDept(q))
    if (next) handleCall(next)
  }

  const handleRecall = async () => {
    const cur = queues.find(q => q.status === 'calling')
    if (cur) handleCall(cur)
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

  const handleManualCall = async (e: React.FormEvent) => {
    e.preventDefault()
    const val = manualVal.trim()
    if (!val) return
    setManualLoading(true)
    try {
      const res = await callQueue(val, currentSpName, mode)
      if (res.success) {
        const calledNo = res.queueNo || val
        setCurrentCalled({ queueNo: calledNo, servicePoint: currentSpName })
        setManualVal('')
        if (!selectedDisplayId) {
          const r2 = callNextBtnRef.current?.getBoundingClientRect()
          setCheckDisplayPopup({ queueNo: calledNo, px: r2 ? r2.left + r2.width / 2 : window.innerWidth / 2, py: r2 ? r2.top - 8 : 200 })
          setTimeout(() => setCheckDisplayPopup(null), 4000)
        }
        flash(true, `เรียกคิว ${calledNo} สำเร็จ`)
        loadQueues()
      } else {
        flash(false, res.message || 'ไม่พบคิว')
      }
    } catch {
      flash(false, 'เกิดข้อผิดพลาด')
    } finally {
      setManualLoading(false)
      manualRef.current?.focus()
    }
  }

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName.toLowerCase()
      const inInput = tag === 'input' || tag === 'textarea' || tag === 'select'
      if (e.key === 'F1') { e.preventDefault(); handleConfirm(); return }
      if (e.key === 'F2') { e.preventDefault(); handleCallNext(); return }
      if (e.key === 'F3') { e.preventDefault(); handleRecall(); return }
      if (e.key === 'F4') { e.preventDefault(); handleNoShow(); return }
      if (e.key === 'Escape') { setPendingCall(null); return }
      // ตัวเลข/อักษร → focus manual input
      if (!inInput && e.key.length === 1 && !e.ctrlKey && !e.altKey) {
        manualRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  })

  const deptOptions = Array.from(new Set(queues.map(q => q.department).filter(Boolean))).sort()

  const waiting  = queues.filter(q => q.status === 'waiting' && byDept(q)).length
  const done     = queues.filter(q => q.status === 'done'    && byDept(q)).length
  const skip     = queues.filter(q => q.status === 'skip'    && byDept(q)).length
  const hasCalling = queues.some(q => q.status === 'calling')
  const hasWaiting = queues.some(q => q.status === 'waiting' && byDept(q))

  const viewQueues = view !== 'main' ? queues.filter(q => q.status === view && byDept(q)) : []
  const viewLabel: Record<string, string> = {
    waiting: 'รอเรียก', done: 'บริการแล้ว', skip: 'ไม่มา'
  }
  const viewCount: Record<string, number> = { waiting, done, skip }

  if (minimized) {
    return (
      <div className="qm-bubble-wrap" onClick={handleExpand} title="คลิกเพื่อขยาย">
        <div className="qm-bubble-face">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="2"/>
            <path d="M8 12h8M8 8h5M8 16h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          {waiting > 0 && <span className="qm-bubble-badge">{waiting}</span>}
        </div>
      </div>
    )
  }

  return (
    <div className="qm-bg">
      {/* ── Header ─────────────────────────────────── */}
      <header className="qm-header">
        <div className="qm-header-left">
          <span className="qm-logo">Q</span>
          {view !== 'main' ? (
            <button className="qm-back-btn" onClick={() => setView('main')}>
              ← {viewLabel[view]} ({viewCount[view]})
            </button>
          ) : (
            <>
              <span className="qm-title">เรียกคิว</span>
              <button
                className={`qm-mode-badge ${mode === 'opd' ? 'opd' : ''}`}
                onClick={() => {
                  const next: QueueMode = mode === 'slot' ? 'opd' : 'slot'
                  setMode(next)
                  localStorage.setItem('qc_mode', next)
                  setQueues([])
                  setCurrentCalled(null)
                }}
                title={mode === 'slot' ? 'HOSxP Queue' : 'OPD Visit'}
              >
                {mode === 'slot' ? 'HQ' : 'OPD'}
              </button>
              <label className={`qm-confirm-toggle ${confirmEnabled ? 'on' : ''}`} title="ยืนยันก่อนเรียกคิว">
                <input type="checkbox" checked={confirmEnabled} onChange={e => {
                  setConfirmEnabled(e.target.checked)
                  localStorage.setItem('qc_confirm', String(e.target.checked))
                }} />
                <span className="qm-confirm-track"><span className="qm-confirm-thumb" /></span>
                <span className="qm-confirm-label">ยืนยัน</span>
              </label>
            </>
          )}
        </div>
        <div className="qm-header-right">
          <span className="qm-clock">
            {clock.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          <button className="qm-minimize-btn" onClick={handleMinimize} title="ย่อ">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </header>

      {/* ── LIST VIEW ──────────────────────────────── */}
      {view !== 'main' ? (
        <div className="qm-list-wrap">
          {viewQueues.length === 0 ? (
            <div className="qm-list-empty">ไม่มีรายการ</div>
          ) : (
            viewQueues.map(q => {
              const qno = q.queue_slot ?? q.queue_no ?? '—'
              const canCall = view === 'waiting' || view === 'skip'
              return (
                <div key={q.vn} className={`qm-list-item qm-li-${view}`}>
                  <div className="qm-li-qno">{qno}</div>
                  <div className="qm-li-info">
                    <div className="qm-li-name">{q.queue_name || '—'}</div>
                    <div className="qm-li-meta">
                      {q.hn ? `HN ${q.hn}` : ''}{q.department ? ` · ${q.department}` : ''}
                    </div>
                  </div>
                  {canCall && (
                    <button
                      className={`qm-li-call-btn ${view === 'skip' ? 'recall' : ''}`}
                      onClick={() => handleCall(q)}
                      disabled={!!callingId}
                    >
                      {callingId === q.vn
                        ? <span className="qm-spinner" />
                        : view === 'skip' ? '🔁' : '📢'
                      }
                    </button>
                  )}
                  {view === 'done' && (
                    <span className="qm-li-done-badge">✓</span>
                  )}
                </div>
              )
            })
          )}
        </div>
      ) : (
        <>
          {/* ── MAIN VIEW ──────────────────────────── */}

          {/* Dept / ห้องตรวจ filter */}
          <div className="qm-dept-bar">
            <span className="qm-dept-label">ห้องตรวจ</span>
            <select
              className="qm-dept-select"
              value={localDept}
              onChange={e => {
                setLocalDept(e.target.value)
                try { localStorage.setItem('qm_local_dept', e.target.value) } catch {}
              }}
            >
              <option value="">ทุกห้อง ({queues.filter(q => q.status === 'waiting').length})</option>
              {deptOptions.map(d => (
                <option key={d} value={d}>
                  {d} ({queues.filter(q => q.status === 'waiting' && q.department === d).length})
                </option>
              ))}
            </select>
          </div>

          {/* Serve card */}
          <div className="qm-serve-card">
            <div className="qm-serve-card-top">
              <span className="qm-serve-label">กำลังให้บริการ</span>
              <div className="qm-serve-selectors">
                <select
                  className="qm-serve-display-select"
                  value={selectedDisplayId}
                  onChange={e => {
                    const id = e.target.value
                    setSelectedDisplayId(id)
                    localStorage.setItem('qm_display_id', id)
                    // reset channel เมื่อเปลี่ยนจอ
                    const disp = displayConfigs.find(d => d.id === id)
                    const firstCh = disp?.channels?.[0] || ''
                    setSelectedChannel(firstCh)
                    localStorage.setItem('qm_channel', firstCh)
                  }}
                >
                  {displayConfigs.length === 0
                    ? <option value="">ไม่มีจอ</option>
                    : displayConfigs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)
                  }
                </select>
                {displayChannels.length > 0 && (
                  <select
                    className="qm-serve-sp-select"
                    value={selectedChannel || displayChannels[0]}
                    onChange={e => {
                      setSelectedChannel(e.target.value)
                      localStorage.setItem('qm_channel', e.target.value)
                    }}
                  >
                    {displayChannels.map(ch => (
                      <option key={ch} value={ch}>ช่อง {ch}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
            {currentCalled ? (
              <div className="qm-serve-no">{currentCalled.queueNo}</div>
            ) : (
              <div className="qm-serve-empty">—</div>
            )}
          </div>

          {/* Action buttons */}
          <div className="qm-actions">
            <button ref={callNextBtnRef} className="qm-btn qm-btn-next" onClick={handleCallNext}
              disabled={!!callingId || (!loading && !hasWaiting)}>
              {loading ? <span className="qm-spinner" />
                : callingId ? <span className="qm-spinner" />
                : <span>▶</span>}
              {loading ? 'กำลังโหลด...' : !hasWaiting ? 'ไม่มีคิวรอ' : 'เรียกถัดไป'}
              <kbd className="qm-kbd">F2</kbd>
            </button>
            <div className="qm-actions-row2">
              <button className="qm-btn qm-btn-recall" onClick={handleRecall} disabled={!!callingId || !hasCalling}>
                <span>↻</span> เรียกซ้ำ <kbd className="qm-kbd">F3</kbd>
              </button>
              <button className="qm-btn qm-btn-noshow" onClick={handleNoShow} disabled={!!callingId || !hasCalling}>
                <span>✕</span> ไม่มา <kbd className="qm-kbd">F4</kbd>
              </button>
            </div>
          </div>

          {/* Manual call */}
          <form className="qm-manual" onSubmit={handleManualCall}>
            <input
              ref={manualRef}
              className="qm-manual-input"
              type="text"
              placeholder="QN / HN / ยิงบาร์โค้ด..."
              value={manualVal}
              onChange={e => setManualVal(e.target.value)}
              disabled={manualLoading}
              autoFocus
              onBlur={() => setTimeout(() => {
                const tag = document.activeElement?.tagName.toLowerCase()
                if (!tag || !['input','select','textarea','button'].includes(tag))
                  manualRef.current?.focus()
              }, 150)}
            />
            <button className="qm-manual-btn" type="submit" disabled={manualLoading || !manualVal.trim()}>
              {manualLoading ? <span className="qm-spinner" /> : '📢'}
            </button>
          </form>

          {/* Stats — clickable */}
          <div className="qm-stats">
            <button className="qm-stat waiting" onClick={() => setView('waiting')}>
              <span>{waiting}</span>
              <label>รอเรียก</label>
              <span className="qm-stat-arrow">›</span>
            </button>
            <button className="qm-stat done" onClick={() => setView('done')}>
              <span>{done}</span>
              <label>แล้ว</label>
              <span className="qm-stat-arrow">›</span>
            </button>
            <button className="qm-stat skip" onClick={() => setView('skip')}>
              <span>{skip}</span>
              <label>ไม่มา</label>
              <span className="qm-stat-arrow">›</span>
            </button>
          </div>
        </>
      )}

      {msg && <div className={`qm-toast ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}

      {deptMismatchWarning && (
        <div className="qm-dept-mismatch-popup"
          style={{ top: deptMismatchWarning.py, left: deptMismatchWarning.px }}
          onClick={() => setDeptMismatchWarning(null)}>
          <div className="qm-dept-mismatch-no">{deptMismatchWarning.queueNo}</div>
          <div className="qm-dept-mismatch-dept">{deptMismatchWarning.dept}</div>
          <div className="qm-dept-mismatch-msg">⚠️ ไม่ตรงกับจอ · {deptMismatchWarning.displayName}</div>
        </div>
      )}

      {checkDisplayPopup && (
        <div className="qm-check-display-popup"
          style={{ top: checkDisplayPopup.py, left: checkDisplayPopup.px }}
          onClick={() => setCheckDisplayPopup(null)}>
          <div className="qm-check-display-no">{checkDisplayPopup.queueNo}</div>
          <div className="qm-check-display-msg">🖥️ ตรวจสอบจุดแสดงคิว</div>
        </div>
      )}

      {/* Confirm modal */}
      {pendingCall && (
        <div className="qm-confirm-overlay" onClick={() => setPendingCall(null)}>
          <div className="qm-confirm-box" onClick={e => e.stopPropagation()}>
            <div className="qm-confirm-no">{pendingCall.queue_slot || pendingCall.queue_no || '—'}</div>
            <div className="qm-confirm-name">{pendingCall.queue_name || '—'}</div>
            <div className="qm-confirm-sp">ช่อง {currentSpName || '—'}</div>
            <div className="qm-confirm-btns">
              <button className="qm-cbtn cancel" onClick={() => setPendingCall(null)}>ยกเลิก <kbd className="qm-kbd" style={{color:'rgba(0,0,0,0.4)',background:'rgba(0,0,0,0.06)',borderColor:'rgba(0,0,0,0.15)'}}>Esc</kbd></button>
              <button className="qm-cbtn ok" onClick={handleConfirm} disabled={!!callingId}>
                {callingId ? <span className="qm-spinner" /> : '📢'} เรียก <kbd className="qm-kbd">F1</kbd>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
