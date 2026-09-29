import { useEffect, useState } from 'react'

const MB = 1024 * 1024

/** "Download AI model" button with progress — asks the local Ollama to fetch the
 *  app's model (about 1 GB, once). Calls onDone when the model is installed. */
export default function ModelDownload({ model, onDone }: { model: string; onDone: () => void }): JSX.Element {
  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState('')
  const [bytes, setBytes] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(
    () =>
      window.tc.onAiPullProgress((p) => {
        setStatus(p.status)
        setBytes(p.total ? { done: p.completed ?? 0, total: p.total } : null)
      }),
    []
  )

  const start = async (): Promise<void> => {
    setRunning(true)
    setError(null)
    setStatus('Starting download…')
    setBytes(null)
    const r = await window.tc.aiPullModel()
    setRunning(false)
    if (r.ok) onDone()
    else setError(r.error)
  }

  const pct = bytes && bytes.total > 0 ? Math.min(100, Math.round((100 * bytes.done) / bytes.total)) : null

  return (
    <div className="model-download">
      {!running ? (
        <>
          <button className="btn-primary" onClick={start}>
            Download AI model (about 1 GB)
          </button>
          <p className="muted">
            Downloads <code>{model}</code> once through Ollama; it is reused every time after that.
          </p>
          {error && <div className="loader-error">{error}</div>}
        </>
      ) : (
        <>
          <div className="dl-status">
            <span>{friendly(status)}</span>
            {pct !== null && bytes && (
              <span className="muted">
                {pct}% · {Math.round(bytes.done / MB)} / {Math.round(bytes.total / MB)} MB
              </span>
            )}
          </div>
          <div className="dl-bar" role="progressbar" aria-valuenow={pct ?? undefined} aria-valuemin={0} aria-valuemax={100}>
            <div className={`dl-fill ${pct === null ? 'indeterminate' : ''}`} style={pct !== null ? { width: `${pct}%` } : undefined} />
          </div>
          <button className="clear dl-cancel" onClick={() => window.tc.aiCancelPull()}>
            Cancel
          </button>
        </>
      )}
    </div>
  )
}

/** Ollama's status messages in plain words. */
function friendly(status: string): string {
  if (!status) return 'Starting download…'
  if (status.startsWith('pulling manifest')) return 'Preparing download…'
  if (status.startsWith('pulling')) return 'Downloading AI model…'
  if (status.startsWith('verifying')) return 'Checking the download…'
  if (status.startsWith('writing')) return 'Installing…'
  if (status === 'success') return 'Done'
  return status
}
