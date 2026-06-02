import { useState, useEffect, useCallback } from 'react'
import { getQueueList, callQueue, onQueueCalled, updateQueueStatus, getServicePoints } from '../lib/api'
import './FloatingMini.css'

type QueueStatus = 'waiting' | 'calling' | 'done' | 'skip'
type QueueRow = QueueItem & { status: QueueStatus }

export default function FloatingMini() {
  const [state, setState] = useState<'hidden' | 'mini' | 'open'>('hidden')
  const [queues, setQueues] = useState<QueueRow[]>([])
  const [servicePoints, setServicePoints] = useState<ServicePoint[]>([])
  const [servicePointId, setServicePointId] = useState('')
  const [currentCalled, setCurrentCalled] = useState<{ queueNo: string; servicePoint: string } | null>(null)
  const [callingId, setCallingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [clock, setClock] = useState(new Date())
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const currentSp = servicePoints.find(sp => sp.id === servicePointId)
  const currentSpName = currentSp?.name || ''
  const waiting = queues.filter(q => q.status === 'waiting').length
  const hasCalling = queues.some(q => q.status === 'calling')
  const hasWaiting = queues.some(q => q.status === 'waiting')
  const prefix = currentCalled?.queueNo?.match(/^[A-Za-z]/)?.[0] || ''

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const handler = () => setState(s => s === 'hidden' ? 'open' : 'hidden')
    window.addEventListener('toggle-mini', handler)
    return () => window.removeEventListener('toggle-mini', handler)
  }, [])

  const loadSP = useCallback(async () => {
    try {
      const data = await getServicePoints()
      setServicePoints(data)
      setServicePointId(prev => (!prev && data.length > 0) ? data[0].id : prev)
    } catch {}
  }, [])

  const loadQueues = useCallback(async () => {
    try {
      const res = await getQueueList()
      if (res.success) setQueues(res.data as QueueRow[])
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (state === 'hidden') return
    loadSP()
    loadQueues()
  }, [state, loadSP, loadQueues])

  useEffect(() => {
    if (state === 'hidden') return
    const t = setInterval(loadQueues, 15000)
    return () => clearInterval(t)
  }, [state, loadQueues])

  useEffect(() => {
    const off = onQueueCalled(data => { setCurrentCalled(data); loadQueues() })
    return off
  }, [loadQueues])

  const flash = (ok: boolean, text: string) => {
    setMsg({ ok, text })
    setTimeout(() => setMsg(null), 3000)
  }

  const doCall = async (queue: QueueRow) => {
    setCallingId(queue.vn)
    try {
      const res = await callQueue(queue.vn, currentSpName)
      if (res.success) {
        setCurrentCalled({ queueNo: res.queueNo || queue.queue_no, servicePoint: currentSpName })
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

  const handleCallNext = async () => {
    const next = queues.find(q => q.status === 'waiting')
    if (next) await doCall(next)
  }

  const handleRecall = async () => {
    const cur = queues.find(q => q.status === 'calling')
    if (cur) await doCall(cur)
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

  if (state === 'hidden') return null

  // ── Minimized bubble ──────────────────────────────────────────────────────
  if (state === 'mini') {
    return (
      <button className="fm-bubble" onClick={() => setState('open')} title="เปิดหน้า Mini เรียกคิว">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="2" />
          <path d="M8 12h8M8 8h5M8 16h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        {waiting > 0 && <span className="fm-badge">{waiting}</span>}
      </button>
    )
  }

  // ── Full panel ────────────────────────────────────────────────────────────
  return (
    <div className="fm-panel">
      {/* Header */}
      <div className="fm-header">
        <div className="fm-header-left">
          <div className="fm-logo">Q</div>
          <span className="fm-title">เรียกคิว</span>
        </div>
        <div className="fm-header-right">
          {servicePoints.length > 0 ? (
            <select className="fm-sp-select" value={servicePointId} onChange={e => setServicePointId(e.target.value)}>
              {servicePoints.map(sp => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
            </select>
          ) : null}
          <span className="fm-clock">
            {clock.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
          </span>
          <button className="fm-ctrl" onClick={() => setState('mini')} title="ย่อ">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </button>
          <button className="fm-ctrl close" onClick={() => setState('hidden')} title="ปิด">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Serve card */}
      <div className="fm-serve-card">
        <div className="fm-serve-label">กำลังให้บริการ · {currentSpName || '—'}</div>
        {currentCalled ? (
          <div className="fm-serve-row">
            {prefix && <div className="fm-prefix">{prefix}</div>}
            <div className="fm-serve-no">{currentCalled.queueNo}</div>
          </div>
        ) : (
          <div className="fm-serve-empty">—</div>
        )}
      </div>

      {/* Buttons */}
      <div className="fm-actions">
        <button className="fm-btn fm-btn-next" onClick={handleCallNext}
          disabled={!!callingId || (!loading && !hasWaiting)}>
          {loading || callingId ? <span className="fm-spinner" /> : <span>▶</span>}
          {loading ? 'โหลด...' : !hasWaiting ? 'ไม่มีคิว' : 'เรียกถัดไป'}
        </button>
        <div className="fm-btn-row">
          <button className="fm-btn fm-btn-recall" onClick={handleRecall} disabled={!!callingId || !hasCalling}>
            ↻ ซ้ำ
          </button>
          <button className="fm-btn fm-btn-noshow" onClick={handleNoShow} disabled={!!callingId || !hasCalling}>
            ✕ ไม่มา
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="fm-stats">
        <div className="fm-stat waiting"><span>{queues.filter(q => q.status === 'waiting').length}</span><label>รอ</label></div>
        <div className="fm-stat done"><span>{queues.filter(q => q.status === 'done').length}</span><label>แล้ว</label></div>
        <div className="fm-stat skip"><span>{queues.filter(q => q.status === 'skip').length}</span><label>ไม่มา</label></div>
      </div>

      {msg && <div className={`fm-toast ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
    </div>
  )
}
