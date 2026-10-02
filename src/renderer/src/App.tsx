import { useCallback, useEffect, useState } from 'react'
import type { Catalog, CatalogSummary, RawData } from '@shared/index'
import AiStudio from './components/AiStudio'
import CatalogLoader from './components/CatalogLoader'
import FeedbackPanel from './components/FeedbackPanel'


type Phase = 'checking' | 'load' | 'loading' | 'ready'

export default function App(): JSX.Element {
  const [phase, setPhase] = useState<Phase>('checking')
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [rawData, setRawData] = useState<RawData | null>(null)
  const [summary, setSummary] = useState<CatalogSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const closeFeedback = useCallback(() => setFeedbackOpen(false), [])

  const enterStudio = useCallback(async () => {
    setPhase('loading')
    setError(null)
    try {
      const [cat, data] = await Promise.all([window.tc.getCatalog(), window.tc.getRawData()])
      setCatalog(cat)
      setRawData(data)
      setPhase('ready')
    } catch (e) {
      setError(String(e))
      setPhase('load')
    }
  }, [])

  useEffect(() => {
    window.tc
      .status()
      .then((s) => {
        if (s.loaded) {
          setSummary(s.summary)
          enterStudio()
        } else setPhase('load')
      })
      .catch(() => setPhase('load'))
  }, [enterStudio])

  const changeCatalog = useCallback(async () => {
    await window.tc.reset()
    setCatalog(null)
    setRawData(null)
    setSummary(null)
    setPhase('load')
  }, [])

  if (phase === 'checking' || phase === 'loading') {
    return (
      <div className="centered">
        <div className="spinner" />
        {summary ? (
          <>
            <p className="load-title">
              Loading <b>{summary.sourceLabel}</b>
            </p>
            <p className="load-sub">
              {summary.version !== 'unknown' ? `${summary.version} · ` : ''}
              {summary.operations.toLocaleString()} operations
            </p>
          </>
        ) : (
          <p>Loading catalog…</p>
        )}
      </div>
    )
  }

  if (phase === 'load') {
    return (
      <>
        {error && <div className="loader-error floating">{error}</div>}
        <CatalogLoader onLoaded={enterStudio} />
      </>
    )
  }

  if (!catalog || !rawData) {
    return (
      <div className="centered">
        <p>Something went wrong.</p>
        <button className="btn-primary" onClick={changeCatalog}>
          Load a catalog
        </button>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">TC SOA Studio</span>

        <span className="counts">
          {catalog.libs.length} libraries · {catalog.services.length} services ·{' '}
          {catalog.operations.length} operations
        </span>
        <button className="clear change-catalog" onClick={changeCatalog}>
          Change catalog
        </button>
        <button className="clear change-catalog" onClick={() => setFeedbackOpen(true)}>
          Feedback &amp; contact
        </button>
      </header>
      {feedbackOpen && <FeedbackPanel onClose={closeFeedback} />}
      <AiStudio catalog={catalog} rawData={rawData} />
    </div>
  )
}
