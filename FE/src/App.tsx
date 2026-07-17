import React, { useEffect, useState, useRef } from 'react'
import './App.css'

type Status = 'idle' | 'predicting' | 'danger' | 'safe'

const NAV = [
  { label: 'Overview', active: true },
]

export default function App() {
  const [ws, setWs] = useState<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [maskImage, setMaskImage] = useState<string | null>(null)
  const [overlayImage, setOverlayImage] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [tumorPct, setTumorPct] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const s = new WebSocket('ws://localhost:8000/ws')
    s.onopen = () => setConnected(true)
    s.onclose = () => setConnected(false)
    s.onmessage = (e) => {
      const d = JSON.parse(e.data)
      if (d.status === 'success') {
        setMaskImage(d.mask)
        setOverlayImage(d.overlay)
        const pct = d.tumor_pixel_percent ?? 0
        setTumorPct(pct)
        setStatus(pct > 1 ? 'danger' : 'safe')
      } else {
        setStatus('idle')
      }
    }
    setWs(s)
    return () => s.close()
  }, [])

  useEffect(() => {
    if (selectedImage && ws?.readyState === WebSocket.OPEN) {
      setStatus('predicting')
      ws.send(JSON.stringify({ type: 'predict', image: selectedImage }))
    }
  }, [selectedImage])

  const loadFile = (file: File) => {
    setMaskImage(null); setOverlayImage(null); setStatus('idle')
    const r = new FileReader()
    r.onload = (ev) => setSelectedImage(ev.target?.result as string)
    r.readAsDataURL(file)
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div>
            <div className="sidebar-logo-name">MRI SEGMENTATION</div>
            <div className="sidebar-logo-sub">Hồ Đức Thắng</div>
          </div>
        </div>

        <div className="sidebar-section-label">Workspace</div>

        {NAV.map((n) => (
          <div key={n.label} className={`nav-item ${n.active ? 'active' : ''}`}>
            <span className="nav-icon">{n.icon}</span>
            {n.label}
          </div>
        ))}
      </aside>

      <div className="main-wrap">
        <div className="topbar">
          <div className="topbar-left">
            <h1>Overview</h1>
            <p>Phân vùng dữ liệu để phát hiện khối u não.</p>
          </div>

        </div>

        <div className="content">

          <div className="upload-card">
            <div className="upload-card-header">
              <div>
                <div className="upload-card-title">MRI Image Input</div>
                <div className="upload-card-sub">Kéo thả hoặc click để chọn ảnh. AI sẽ tự động phân tích ngay khi upload.</div>
              </div>
            </div>
            <div className="upload-card-body">
              <div
                className={`dropzone ${selectedImage ? 'filled' : ''}`}
                onClick={() => fileRef.current?.click()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) loadFile(f) }}
                onDragOver={(e) => e.preventDefault()}
              >
                {selectedImage ? (
                  <div className="dz-wrapper">
                    <img src={selectedImage} className="dz-thumb" alt="MRI" />
                    <div className="dz-overlay">Thay ảnh mới</div>
                  </div>
                ) : (
                  <>
                    <div className="dz-title">Kéo thả hoặc click để upload</div>
                    <div className="dz-hint">Hỗ trợ JPG · PNG · TIF · JPEG</div>
                  </>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f) }} />
            </div>
          </div>

          {status === 'predicting' && (
            <div className="status-banner analyzing">
              <div className="sb-icon">🔬</div>
              <div>
                <div className="sb-title">Đang phân tích <span className="dots"><span /><span /><span /></span></div>
                <div className="sb-desc">U-Net model đang xử lý ảnh MRI, vui lòng chờ trong giây lát.</div>
              </div>
            </div>
          )}
          {status === 'danger' && (
            <div className="status-banner danger">
              <div>
                <div className="sb-title">Phát hiện tổn thương não</div>
                <div className="sb-desc">
                  Phát hiện vùng bất thường chiếm <strong>{tumorPct.toFixed(2)}%</strong>.
                </div>
                <div className="tumor-bar">
                  <div className="tumor-bar-meta">
                    <span>Tumor coverage</span><span>{tumorPct.toFixed(2)}%</span>
                  </div>
                  <div className="tumor-bar-track">
                    <div className="tumor-bar-fill" style={{ width: `${Math.min(tumorPct * 5, 100)}%` }} />
                  </div>
                </div>
              </div>
            </div>
          )}
          {status === 'safe' && (
            <div className="status-banner safe">
              <div>
                <div className="sb-title">Không phát hiện bất thường</div>
                <div className="sb-desc">Không phát hiện vùng tổn thương đáng.</div>
              </div>
            </div>
          )}

          <div className="results-grid">
            {[
              { num: 'MRI', label: 'Ảnh Gốc', src: selectedImage },
              { num: 'MASK', label: 'AI Mask', src: maskImage },
              { num: 'OVL', label: 'Vị Trí Khối U', src: overlayImage },
            ].map(({ num, label, src }) => (
              <div className="result-card" key={num}>
                <div className="rc-header">
                  <span className="rc-badge">{num}</span>
                  <span className="rc-label">{label}</span>
                </div>
                {src
                  ? <img src={src} alt={label} className="rc-img" />
                  : (
                    <div className="rc-empty">
                      {status === 'predicting' ? <div className="spin" /> : null}
                      <span className="rc-empty-text">
                        {!selectedImage
                          ? 'Chưa có ảnh'
                          : status === 'predicting'
                            ? 'Đang xử lý...'
                            : 'Chờ kết quả'}
                      </span>
                    </div>
                  )
                }
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  )
}