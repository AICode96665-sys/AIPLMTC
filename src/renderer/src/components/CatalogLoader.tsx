import { useState } from 'react'
import type { CatalogSummary, LoadResult } from '@shared/index'

type Tab = 'file' | 'path'

export default function CatalogLoader({ onLoaded }: { onLoaded: () => void }): JSX.Element {
  const [tab, setTab] = useState<Tab>('file')
  const [path, setPath] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<CatalogSummary | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const handle = async (fn: () => Promise<LoadResult>): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const r = await fn()
      if (r.ok) setSummary(r.summary)
      else setError(r.error)
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  const onPick = async (): Promise<void> => {
    const p = await window.tc.pickFile()
    if (p) {
      setPath(p)
      await handle(() => window.tc.loadPath(p))
    }
  }

  const onDrop = async (e: React.DragEvent): Promise<void> => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    const p = (file as File & { path?: string }).path
    if (p) {
      setPath(p)
      await handle(() => window.tc.loadPath(p))
    } else {
      const text = await file.text()
      await handle(() => window.tc.loadContent(file.name, text))
    }
  }

  if (summary) {
    return (
      <div className="loader-screen">
        <div className="loader-card confirm">
          <div className="confirm-check">✓</div>
          <h2>Catalog loaded</h2>
          <p className="muted">{summary.sourceLabel}</p>
          <div className="summary-grid">
            <div><span className="big">{summary.libraries}</span>libraries</div>
            <div><span className="big">{summary.services}</span>services</div>
            <div><span className="big">{summary.operations}</span>operations</div>
            <div><span className="big">{summary.version}</span>version</div>
          </div>
          <div className="confirm-actions">
            <button className="btn-primary big-btn" onClick={onLoaded}>
              Open Studio →
            </button>
            <button className="clear" onClick={() => setSummary(null)}>
              Load a different file
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="loader-screen">
      <div className="loader-card">
        <h1>TC SOA Studio</h1>
        <p className="muted">
          Load your Teamcenter <code>structure.js</code> to begin. Use your own server's file to
          include your custom APIs and exact version.
        </p>

        <div className="loader-tabs">
          <button className={tab === 'file' ? 'tab active' : 'tab'} onClick={() => setTab('file')}>
            Upload file
          </button>
          <button className={tab === 'path' ? 'tab active' : 'tab'} onClick={() => setTab('path')}>
            Local path
          </button>
        </div>

        {tab === 'file' && (
          <div className="loader-body">
            <div
              className={`dropzone ${dragOver ? 'over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={onPick}
            >
              {busy ? 'Loading…' : 'Drag structure.js here, or click to browse'}
            </div>
          </div>
        )}

        {tab === 'path' && (
          <div className="loader-body">
            <label>Full path to structure.js</label>
            <input
              className="search"
              placeholder="C:\\path\\to\\structure.js"
              value={path}
              onChange={(e) => setPath(e.target.value)}
            />
            <button
              className="btn-primary big-btn"
              disabled={busy || !path.trim()}
              onClick={() => handle(() => window.tc.loadPath(path.trim()))}
            >
              {busy ? 'Loading…' : 'Load file'}
            </button>
          </div>
        )}

        {error && <div className="loader-error">{error}</div>}

        <p className="legal-note">
          Works with Siemens Teamcenter. Not affiliated with or endorsed by Siemens. Teamcenter is a trademark of
          Siemens. Your catalog and your requests stay on this computer; the AI runs locally.
        </p>
      </div>
    </div>
  )
}
