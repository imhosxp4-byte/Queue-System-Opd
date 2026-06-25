import { useState, useEffect } from 'react'

export default function QueueMiniPanel() {
  const [open, setOpen] = useState(false)
  const [gone, setGone] = useState(false) // fully closed — no bubble shown

  useEffect(() => {
    const handler = () => { setGone(false); setOpen(s => !s) }
    window.addEventListener('toggle-mini', handler)
    return () => window.removeEventListener('toggle-mini', handler)
  }, [])

  return (
    <>
      {open && (
        <div style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          width: 400,
          height: 660,
          zIndex: 9999,
          borderRadius: 14,
          overflow: 'hidden',
          boxShadow: '0 8px 40px rgba(0,0,0,0.45)',
          border: '1px solid rgba(255,255,255,0.2)',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* panel titlebar */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'linear-gradient(135deg,#0D47A1,#0097A7)',
            padding: '5px 8px', flexShrink: 0,
          }}>
            <span style={{ color: '#fff', fontSize: 13, fontWeight: 600, paddingLeft: 4 }}>Mini เรียกคิว</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {/* fold to bubble */}
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 5,
                  color: '#fff', cursor: 'pointer', fontSize: 16, lineHeight: 1,
                  width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700,
                }}
                title="พับ (แสดงเป็น bubble)"
              >−</button>
              {/* close completely */}
              <button
                onClick={() => { setOpen(false); setGone(true) }}
                style={{
                  background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 5,
                  color: '#fff', cursor: 'pointer', fontSize: 14, lineHeight: 1,
                  width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700,
                }}
                title="ปิด"
              >✕</button>
            </div>
          </div>

          <iframe
            src="/#/queue-mini"
            style={{ flex: 1, border: 'none', display: 'block' }}
            title="Mini Queue"
          />
        </div>
      )}

      {/* floating bubble when folded (not fully closed) */}
      {!open && !gone && (
        <button
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
            width: 52, height: 52, borderRadius: '50%',
            background: 'linear-gradient(135deg,#0D47A1,#0097A7)',
            border: 'none', color: '#fff', cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22,
          }}
          title="เปิดหน้า Mini เรียกคิว"
        >
          🖥️
        </button>
      )}
    </>
  )
}
