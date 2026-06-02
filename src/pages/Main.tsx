import { useNavigate } from 'react-router-dom'
import './Main.css'

export default function MainPage() {
  const navigate = useNavigate()
  const officer = sessionStorage.getItem('officer') || 'ผู้ใช้งาน'

  const menuItems = [
    {
      id: 'queue-call',
      icon: (
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="2" />
          <path d="M8 12h8M8 8h5M8 16h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ),
      label: 'เรียกคิว',
      desc: 'เรียกคิวผู้ป่วยเข้ารับบริการ',
      color: '#1976D2',
      glow: 'rgba(25,118,210,0.45)',
      onClick: () => navigate('/queue-call')
    },
    {
      id: 'queue-display',
      icon: (
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
          <rect x="2" y="4" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
          <path d="M8 20h8M12 18v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M7 11h2l1.5-4 2 7 1.5-3H17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      label: 'หน้าจอแสดงคิว',
      desc: 'จัดการและเปิดหน้าจอแสดงผลคิว',
      color: '#00838F',
      glow: 'rgba(0,131,143,0.45)',
      onClick: () => navigate('/display-configs')
    },
    {
      id: 'settings',
      icon: (
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
          <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      ),
      label: 'ตั้งค่าระบบ',
      desc: 'จัดการช่องบริการ หน้าจอ และการเชื่อมต่อ',
      color: '#7B1FA2',
      glow: 'rgba(123,31,162,0.4)',
      onClick: () => navigate('/app-settings')
    }
  ]

  return (
    <div className="main-bg">
      <div className="main-bg-circle c1" />
      <div className="main-bg-circle c2" />
      <div className="main-bg-grid" />

      <main className="main-content">
        <div className="main-welcome animate-fade">
          <h2 className="welcome-title">ยินดีต้อนรับ, <span className="welcome-name">{officer}</span></h2>
          <p className="welcome-sub">เลือกเมนูที่ต้องการใช้งาน</p>
        </div>

        <div className="menu-grid">
          {menuItems.map((item, i) => (
            <button
              key={item.id}
              className="menu-card"
              onClick={item.onClick}
              style={{ '--card-color': item.color, '--card-glow': item.glow, animationDelay: `${i * 0.1}s` } as React.CSSProperties}
            >
              <div className="menu-card-icon" style={{ color: item.color }}>{item.icon}</div>
              <div className="menu-card-body">
                <span className="menu-card-label">{item.label}</span>
                <span className="menu-card-desc">{item.desc}</span>
              </div>
              <div className="menu-card-arrow">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </button>
          ))}
        </div>

        <div className="main-status card animate-fade">
          <div className="status-dot online" />
          <span className="status-text">ระบบพร้อมใช้งาน</span>
          <span className="status-time">{new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
        </div>
      </main>
    </div>
  )
}
