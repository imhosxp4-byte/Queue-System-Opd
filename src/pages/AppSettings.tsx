import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getServicePoints, createServicePoint, updateServicePoint, deleteServicePoint
} from '../lib/api'
import './AppSettings.css'

export default function AppSettingsPage() {
  const navigate = useNavigate()
  const [servicePoints, setServicePoints] = useState<ServicePoint[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)

  const loadSP = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getServicePoints()
      setServicePoints(data)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { loadSP() }, [loadSP])

  const handleAdd = async () => {
    const name = newName.trim()
    if (!name) return
    setSaving(true)
    try {
      await createServicePoint(name)
      setNewName('')
      await loadSP()
    } catch {}
    setSaving(false)
  }

  const handleUpdate = async () => {
    if (!editingId || !editingName.trim()) return
    setSaving(true)
    try {
      await updateServicePoint(editingId, editingName.trim())
      setEditingId(null)
      await loadSP()
    } catch {}
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    setSaving(true)
    try {
      await deleteServicePoint(id)
      await loadSP()
    } catch {}
    setSaving(false)
  }

  return (
    <div className="aps-bg">
      <div className="aps-bg-deco" />

      <main className="aps-main">

        {/* ── ช่องบริการ ── */}
        <div className="aps-card">
          <div className="aps-card-hd">
            <div className="aps-card-icon sp">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="2" />
                <path d="M8 12h8M8 8h5M8 16h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <h2 className="aps-card-title">ช่องบริการ</h2>
              <p className="aps-card-sub">จัดการจุดให้บริการสำหรับเรียกคิว</p>
            </div>
            <span className="aps-badge">{servicePoints.length} ช่อง</span>
          </div>

          <div className="aps-sp-list">
            {loading ? (
              <div className="aps-sp-loading"><div className="aps-loader" /></div>
            ) : servicePoints.length === 0 ? (
              <div className="aps-sp-empty">ยังไม่มีช่องบริการ กรุณาเพิ่มด้านล่าง</div>
            ) : servicePoints.map((sp, i) => (
              <div key={sp.id} className="aps-sp-item">
                <span className="aps-sp-num">{i + 1}</span>
                {editingId === sp.id ? (
                  <div className="aps-sp-edit">
                    <input
                      className="input aps-sp-input"
                      value={editingName}
                      onChange={e => setEditingName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleUpdate(); if (e.key === 'Escape') setEditingId(null) }}
                      autoFocus
                    />
                    <button className="btn btn-primary aps-sp-save" onClick={handleUpdate} disabled={saving || !editingName.trim()}>
                      บันทึก
                    </button>
                    <button className="btn btn-ghost aps-sp-cancel" onClick={() => setEditingId(null)}>
                      ยกเลิก
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="aps-sp-name">{sp.name}</span>
                    <div className="aps-sp-acts">
                      <button className="aps-icon-btn edit"
                        onClick={() => { setEditingId(sp.id); setEditingName(sp.name) }}
                        title="แก้ไข">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                      <button className="aps-icon-btn del"
                        onClick={() => handleDelete(sp.id)} disabled={saving}
                        title="ลบ">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <polyline points="3,6 5,6 21,6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          <div className="aps-sp-add">
            <input
              className="input aps-sp-input"
              placeholder="ชื่อช่องบริการใหม่ เช่น ช่อง 7 หรือ เคาน์เตอร์หน้า"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
              disabled={saving}
            />
            <button className="btn btn-primary" onClick={handleAdd} disabled={saving || !newName.trim()}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
              เพิ่ม
            </button>
          </div>
        </div>

        {/* ── Bottom row ── */}
        <div className="aps-row">

          {/* Display Configs */}
          <div className="aps-card aps-card-link" onClick={() => navigate('/display-configs')}>
            <div className="aps-card-hd">
              <div className="aps-card-icon display">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <rect x="2" y="4" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
                  <path d="M8 20h8M12 18v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M7 11h2l1.5-4 2 7 1.5-3H17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <h2 className="aps-card-title">หน้าจอแสดงคิว</h2>
                <p className="aps-card-sub">ตั้งค่ารูปแบบการแสดงผล</p>
              </div>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="aps-arrow">
                <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>

          {/* DB Connection */}
          <div className="aps-card aps-card-link" onClick={() => navigate('/settings')}>
            <div className="aps-card-hd">
              <div className="aps-card-icon db">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <ellipse cx="12" cy="5" rx="9" ry="3" stroke="currentColor" strokeWidth="2" />
                  <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" stroke="currentColor" strokeWidth="2" />
                  <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" stroke="currentColor" strokeWidth="2" />
                </svg>
              </div>
              <div>
                <h2 className="aps-card-title">การเชื่อมต่อฐานข้อมูล</h2>
                <p className="aps-card-sub">ตั้งค่า MySQL / PostgreSQL</p>
              </div>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="aps-arrow">
                <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>

        </div>
      </main>
    </div>
  )
}
