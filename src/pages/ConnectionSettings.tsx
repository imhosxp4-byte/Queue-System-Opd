import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadSettings, saveSettings, testConnection } from '../lib/api'
import './ConnectionSettings.css'

const DEFAULT: DbSettings = {
  type: 'mysql',
  host: '192.168.1.1',
  port: 3306,
  database: '',
  username: 'root',
  password: ''
}

function LoginGate({ onPass }: { onPass: () => void }) {
  const navigate = useNavigate()
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [error, setError] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [editable, setEditable] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setEditable(true), 100)
    return () => clearTimeout(t)
  }, [])

  const handleLogin = () => {
    if (user === 'admin' && pass === 'adminqueue') {
      onPass()
    } else {
      setError(true)
      setPass('')
      setTimeout(() => setError(false), 3000)
    }
  }

  return (
    <div className="settings-bg">
      <div className="bg-circle c1" />
      <div className="bg-circle c2" />
      <div className="settings-container animate-fade" style={{ justifyContent: 'center', minHeight: '80vh' }}>
        <div className="settings-card card animate-scale" style={{ maxWidth: 400, margin: '0 auto', width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div className="settings-icon" style={{ margin: '0 auto 12px' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="11" width="18" height="11" rx="2" stroke="#00BCD4" strokeWidth="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="#00BCD4" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <h2 className="settings-title" style={{ fontSize: 20 }}>เข้าสู่ระบบ</h2>
            <p className="settings-subtitle">ยืนยันตัวตนเพื่อแก้ไขการตั้งค่าการเชื่อมต่อ</p>
          </div>

          <div className="settings-grid">
            <div className="form-group full">
              <label className="form-label">ชื่อผู้ใช้</label>
              <input
                className={`input${error ? ' input-error' : ''}`}
                type="text"
                placeholder="Username"
                value={user}
                onChange={e => { setUser(e.target.value); setError(false) }}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                autoComplete="new-password"
                readOnly={!editable}
                autoFocus
              />
            </div>
            <div className="form-group full">
              <label className="form-label">รหัสผ่าน</label>
              <div style={{ position: 'relative' }}>
                <input
                  className={`input${error ? ' input-error' : ''}`}
                  type={showPass ? 'text' : 'password'}
                  placeholder="Password"
                  value={pass}
                  onChange={e => { setPass(e.target.value); setError(false) }}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  style={{ paddingRight: 40 }}
                  autoComplete="new-password"
                  readOnly={!editable}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#90caf9', fontSize: 16 }}
                  tabIndex={-1}
                >
                  {showPass ? '🙈' : '👁'}
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div className="alert alert-error animate-fade">✗ ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง</div>
          )}

          <div className="settings-actions" style={{ marginTop: 20 }}>
            <button className="btn btn-ghost" onClick={() => navigate(-1)}>ยกเลิก</button>
            <button className="btn btn-primary" onClick={handleLogin} style={{ flex: 1 }}>🔓 เข้าสู่ระบบ</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ConnectionSettingsPage() {
  const navigate = useNavigate()
  const [authed, setAuthed] = useState(false)
  const [form, setForm] = useState<DbSettings>(DEFAULT)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    loadSettings().then(s => { if (s) setForm(s) })
  }, [])

  const setField = <K extends keyof DbSettings>(key: K, val: DbSettings[K]) => {
    setForm(f => ({ ...f, [key]: val }))
    setTestResult(null)
    setSaved(false)
  }

  const handleTypeChange = (type: 'mysql' | 'postgresql') => {
    setForm(f => ({ ...f, type, port: type === 'mysql' ? 3306 : 5432 }))
    setTestResult(null)
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    const res = await testConnection(form)
    setTesting(false)
    setTestResult(res)
  }

  const handleSave = async () => {
    setSaving(true)
    await saveSettings(form)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const handleSaveAndLogin = async () => {
    setSaving(true)
    await saveSettings(form)
    setSaving(false)
    navigate('/login')
  }

  if (!authed) return <LoginGate onPass={() => setAuthed(true)} />

  return (
    <div className="settings-bg">
      <div className="bg-circle c1" />
      <div className="bg-circle c2" />

      <div className="settings-container animate-fade">
        <div className="settings-header">
          <button className="btn btn-ghost back-btn" onClick={() => navigate(-1)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M19 12H5M5 12l7-7M5 12l7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            ย้อนกลับ
          </button>
          <div className="settings-title-wrap">
            <div className="settings-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="3" stroke="#00BCD4" strokeWidth="2" />
                <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="#00BCD4" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <h1 className="settings-title">ตั้งค่าการเชื่อมต่อ</h1>
              <p className="settings-subtitle">กำหนดค่าการเชื่อมต่อฐานข้อมูล</p>
            </div>
          </div>
        </div>

        <div className="settings-card card animate-scale">
          <div className="section-label">ประเภทฐานข้อมูล</div>
          <div className="db-type-toggle">
            <button className={`db-type-btn ${form.type === 'mysql' ? 'active' : ''}`} onClick={() => handleTypeChange('mysql')}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><ellipse cx="12" cy="6" rx="8" ry="3" stroke="#00758F" strokeWidth="2"/><path d="M4 6v12c0 1.66 3.58 3 8 3s8-1.34 8-3V6" stroke="#00758F" strokeWidth="2"/><line x1="4" y1="12" x2="20" y2="12" stroke="#00758F" strokeWidth="1.5"/></svg>
              MySQL
            </button>
            <button className={`db-type-btn ${form.type === 'postgresql' ? 'active' : ''}`} onClick={() => handleTypeChange('postgresql')}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><ellipse cx="12" cy="8" rx="7" ry="5" stroke="#336791" strokeWidth="2"/><path d="M5 8v8c0 2.76 3.13 5 7 5s7-2.24 7-5V8" stroke="#336791" strokeWidth="2"/><line x1="5" y1="12" x2="19" y2="12" stroke="#336791" strokeWidth="1.5"/></svg>
              PostgreSQL
            </button>
          </div>

          <div className="settings-grid">
            <div className="form-group full">
              <label className="form-label">IP Server / Hostname</label>
              <input className="input" type="text" placeholder="เช่น 192.168.1.100 หรือ localhost"
                value={form.host} onChange={e => setField('host', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Port</label>
              <input className="input" type="number" placeholder={form.type === 'mysql' ? '3306' : '5432'}
                value={form.port} onChange={e => setField('port', Number(e.target.value))} />
            </div>
            <div className="form-group">
              <label className="form-label">Database</label>
              <input className="input" type="text" placeholder="ชื่อฐานข้อมูล"
                value={form.database} onChange={e => setField('database', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Username</label>
              <input className="input" type="text" placeholder="ชื่อผู้ใช้ฐานข้อมูล"
                value={form.username} onChange={e => setField('username', e.target.value)} autoComplete="off" />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input className="input" type="password" placeholder="รหัสผ่านฐานข้อมูล"
                value={form.password} onChange={e => setField('password', e.target.value)} autoComplete="off" />
            </div>
          </div>

          {testResult && (
            <div className={`alert ${testResult.success ? 'alert-success' : 'alert-error'} animate-fade`}>
              {testResult.success ? '✓ ' : '✗ '}{testResult.message}
            </div>
          )}
          {saved && <div className="alert alert-success animate-fade">✓ บันทึกการตั้งค่าเรียบร้อยแล้ว</div>}

          <div className="settings-actions">
            <button className="btn btn-ghost" onClick={handleTest} disabled={testing || !form.host || !form.database}>
              {testing ? <><span className="spinner" /> กำลังทดสอบ...</> : <>🔌 ทดสอบการเชื่อมต่อ</>}
            </button>
            <button className="btn btn-accent" onClick={handleSave} disabled={saving}>
              {saving ? <><span className="spinner" /> บันทึก...</> : <>💾 บันทึกการเชื่อมต่อ</>}
            </button>
            <button className="btn btn-primary" onClick={() => navigate('/main')}>🏠 เปิดหน้าหลัก</button>
            <button className="btn btn-success save-login-btn" onClick={handleSaveAndLogin} disabled={saving}>
              {saving ? <><span className="spinner" /> กำลังบันทึก...</> : <>✅ บันทึกและกลับหน้า Login</>}
            </button>
          </div>
        </div>

        <div className="settings-info card">
          <p className="info-title">📋 หมายเหตุการเชื่อมต่อ</p>
          <ul className="info-list">
            <li>ข้อมูลการเชื่อมต่อจะถูกเก็บไว้ในไฟล์ <code>data/db-settings.json</code></li>
            <li>การ login จะใช้ตาราง <code>officer</code> ในฐานข้อมูลที่เชื่อมต่อ</li>
            <li>รหัสผ่านใน officer_login_password_md5 ต้องเป็น MD5 hash</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
