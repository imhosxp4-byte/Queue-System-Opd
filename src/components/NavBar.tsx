import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { getDisplayConfigs, openDisplay } from '../lib/api'
import './NavBar.css'

const NAV_LINKS = [
  {
    path: '/queue-call',
    label: 'เรียกคิว',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="2" />
        <path d="M8 12h8M8 8h5M8 16h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    )
  },
  {
    path: '/app-settings',
    label: 'ตั้งค่าระบบ',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
        <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    )
  }
]

const PAGES = [
  { label: 'หน้าจอแสดงคิว', path: '/#/display', icon: '🖥' },
  { label: 'เรียกคิว (Staff)', path: '/#/queue-call', icon: '📢' },
  { label: 'Mini (Popup)', path: '/#/queue-mini', icon: '🔲' },
  { label: 'ประวัติการเรียกคิว', path: '/#/queue-history', icon: '📋' },
]

export default function NavBar() {
  const navigate = useNavigate()
  const location = useLocation()
  const officer = sessionStorage.getItem('officer') || 'ผู้ใช้งาน'
  const [showLinks, setShowLinks] = useState(false)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const linkRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (linkRef.current && !linkRef.current.contains(e.target as Node))
        setShowLinks(false)
    }
    if (showLinks) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showLinks])

  const copyLink = (idx: number, path: string) => {
    const url = window.location.origin + path
    navigator.clipboard.writeText(url).then(() => {
      setCopiedIdx(idx)
      setTimeout(() => { setCopiedIdx(null); setShowLinks(false) }, 1800)
    })
  }

  const handleLogout = () => {
    sessionStorage.clear()
    navigate('/login')
  }

  const handleOpenDisplay = async () => {
    try {
      const configs = await getDisplayConfigs()
      if (configs.length > 0) {
        await openDisplay(configs[0])
      } else {
        navigate('/display-configs')
      }
    } catch {
      navigate('/display-configs')
    }
  }

  const isDisplayActive = location.pathname.startsWith('/display-configs')

  return (
    <nav className="app-nav">
      <button className="app-nav-brand" onClick={() => navigate('/main')}>
        <div className="app-nav-brand-icon">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <path d="M4 6h16M4 12h16M4 18h10" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </div>
        <span>QUEUE OPD</span>
      </button>

      <div className="app-nav-sep" />

      <div className="app-nav-links">
        {NAV_LINKS.map(link => {
          const active = location.pathname === link.path || location.pathname.startsWith(link.path + '/')
          return (
            <button
              key={link.path}
              className={`app-nav-link ${active ? 'active' : ''}`}
              onClick={() => navigate(link.path)}
            >
              {link.icon}
              {link.label}
              {active && <span className="app-nav-link-bar" />}
            </button>
          )
        })}

        {/* Display — opens display directly, right-click/manage goes to /display-configs */}
        <button
          className={`app-nav-link ${isDisplayActive ? 'active' : ''}`}
          onClick={handleOpenDisplay}
          onContextMenu={e => { e.preventDefault(); navigate('/display-configs') }}
          title="คลิก: เปิดจอแสดงคิว | คลิกขวา: จัดการหน้าจอ"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="4" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
            <path d="M8 20h8M12 18v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          หน้าจอแสดงคิว
          {isDisplayActive && <span className="app-nav-link-bar" />}
        </button>
        {/* Copy Link dropdown */}
        <div className="app-nav-copylink-wrap" ref={linkRef}>
          <button
            className={`app-nav-link${showLinks ? ' active' : ''}`}
            onClick={() => setShowLinks(v => !v)}
            title="คัดลอกลิ้งหน้าต่างๆ"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            ลิ้ง
            {showLinks && <span className="app-nav-link-bar" />}
          </button>

          {showLinks && (
            <div className="app-nav-copylink-menu">
              <div className="app-nav-copylink-header">คัดลอกลิ้งสำหรับส่ง</div>
              {PAGES.map((p, i) => {
                const url = window.location.origin + p.path
                const copied = copiedIdx === i
                return (
                  <div key={p.path} className="app-nav-copylink-item">
                    <span className="app-nav-copylink-icon">{p.icon}</span>
                    <div className="app-nav-copylink-info">
                      <div className="app-nav-copylink-label">{p.label}</div>
                      <div className="app-nav-copylink-url">{url}</div>
                    </div>
                    <button
                      className={`app-nav-copylink-btn${copied ? ' copied' : ''}`}
                      onClick={() => copyLink(i, p.path)}
                    >
                      {copied ? '✓ คัดลอกแล้ว' : 'คัดลอก'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <button
        className="app-nav-mini-btn"
        onClick={() => {
          const w = 320, h = 560
          const left = window.screen.width - w - 20
          const top = window.screen.height - h - 60
          window.open(
            '/#/queue-mini',
            'queue-mini',
            `width=${w},height=${h},left=${left},top=${top},resizable=yes,menubar=no,toolbar=no,location=no,status=no`
          )
        }}
        title="เปิดหน้า Mini เรียกคิว"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="2" />
          <path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        Mini
      </button>

      <div className="app-nav-right">
        <div className="app-nav-user">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
            <path d="M4 20c0-4 3.58-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span>{officer}</span>
        </div>
        <button className="app-nav-logout" onClick={handleLogout}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <polyline points="16,17 21,12 16,7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          ออกจากระบบ
        </button>
      </div>
    </nav>
  )
}
