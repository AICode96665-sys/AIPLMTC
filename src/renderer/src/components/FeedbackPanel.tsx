import { useEffect, useState } from 'react'
import { FEEDBACK_FORM_URL, REPORT_PROBLEM_URL, REPO_URL } from '@shared/links'

/** "Feedback & contact": a small panel with links that open in the web browser. */
export default function FeedbackPanel({ onClose }: { onClose: () => void }): JSX.Element {
  const [version, setVersion] = useState('')

  useEffect(() => {
    window.tc.appVersion().then(setVersion, () => {})
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="feedback-backdrop" onClick={onClose}>
      <div className="feedback-panel" role="dialog" aria-label="Feedback and contact" onClick={(e) => e.stopPropagation()}>
        <div className="feedback-head">
          <div>
            <b>TC SOA Studio</b>
            {version && <div className="muted small">Version {version}</div>}
          </div>
          <button className="clear" onClick={onClose}>
            Close
          </button>
        </div>

        <a className="feedback-link" href={FEEDBACK_FORM_URL} target="_blank" rel="noreferrer">
          <span className="feedback-icon">💬</span>
          <span>
            <b>Send feedback or contact us</b>
            <span className="muted small">Ideas, questions, anything you'd like to tell us</span>
          </span>
        </a>
        <a className="feedback-link" href={REPORT_PROBLEM_URL} target="_blank" rel="noreferrer">
          <span className="feedback-icon">🐛</span>
          <span>
            <b>Report a problem</b>
            <span className="muted small">What you typed, what you expected, what happened</span>
          </span>
        </a>
        <a className="feedback-link" href={REPO_URL} target="_blank" rel="noreferrer">
          <span className="feedback-icon">⭐</span>
          <span>
            <b>TC SOA Studio on GitHub</b>
            <span className="muted small">Releases, source code and updates</span>
          </span>
        </a>

        <p className="feedback-note muted small">
          These open in your web browser. The app itself sends nothing; please don't include confidential company
          data or catalog contents.
          <br />
          Not affiliated with or endorsed by Siemens. Teamcenter is a trademark of Siemens.
        </p>
      </div>
    </div>
  )
}
