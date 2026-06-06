import { useNavigate } from 'react-router-dom'
import './AppSettings.css'

export default function AppSettingsPage() {
  const navigate = useNavigate()

  return (
    <div className="aps-bg">
      <div className="aps-bg-deco" />

      <main className="aps-main">

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
