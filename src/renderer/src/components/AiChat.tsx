import { useEffect, useRef, useState } from 'react'
import type { AiBuildResult, AiStatus } from '@shared/ai/status'
import type { Operation } from '@shared/index'
import ModelDownload from './ModelDownload'
import { doneText, STAGES } from '@shared/ai/progress'

export interface Turn {
  id: number
  query: string
  /** null while the AI is still working */
  result: AiBuildResult | null
}

const EXAMPLES = [
  'Create an item then get its properties',
  'Check out an object, change a property, then check it in',
  'Revise an item',
  'Delete a dataset'
]

/** The conversation column: setup help, past requests/answers, and the input box. */
export default function AiChat({
  status,
  checking,
  onRefresh,
  turns,
  activeId,
  onSelect,
  busy,
  progress,
  onSend,
  onCancel,
  byUrl,
  onShowOperation
}: {
  status: AiStatus | null
  checking: boolean
  onRefresh: () => void
  turns: Turn[]
  activeId: number | null
  onSelect: (id: number) => void
  busy: boolean
  /** stages reached so far; the last one is running */
  progress: string[]
  onSend: (query: string) => void
  onCancel: () => void
  byUrl: Map<string, Operation>
  /** Open the details (description, request, response) of a step's operation. */
  onShowOperation: (op: Operation) => void
}): JSX.Element {
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  // keep the newest message in view
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [turns.length, busy])

  const ready = Boolean(status?.running && status.selected)
  const send = (): void => {
    const q = draft.trim()
    if (!q || busy || !ready) return
    onSend(q)
    setDraft('')
  }

  return (
    <aside className="chat">
      <div className="chat-head">
        <b>✨ AI assistant</b>
        {status?.selected && (
          <span className="chat-model-fixed" title="The AI model this app uses (runs on this computer)">
            AI model: {status.selected}
          </span>
        )}
      </div>

      <div className="chat-list" ref={listRef}>
        {checking && !status ? (
          <p className="muted">Starting the local AI (Ollama)…</p>
        ) : !status?.running ? (
          <div className="chat-setup">
            <p>
              <b>Local AI is not running.</b> This app uses <b>Ollama</b>, a free app that runs AI on your own
              computer — nothing is sent to the internet.
            </p>
            <ol>
              <li>
                Install Ollama from{' '}
                <a href="https://ollama.com" target="_blank" rel="noreferrer">
                  ollama.com
                </a>{' '}
                and start it.
              </li>
              <li>Click Check again. The app then offers to download its AI model (about 1 GB) for you.</li>
            </ol>
            <button className="btn-primary" onClick={onRefresh} disabled={checking}>
              {checking ? 'Checking…' : 'Check again'}
            </button>
          </div>
        ) : !status.selected ? (
          <div className="chat-setup">
            <p>
              <b>Getting the AI model ready.</b> It is downloaded once (about 1 GB) and reused after that.
            </p>
            <ModelDownload model={status.model} onDone={onRefresh} autoStart />
            <p className="muted dl-alt">
              Or in a terminal: <code>ollama pull {status.model}</code>, then{' '}
              <button className="link-btn" onClick={onRefresh} disabled={checking}>
                {checking ? 'checking…' : 'check again'}
              </button>
              .
            </p>
          </div>
        ) : (
          <>
            {turns.length === 0 && (
              <div className="chat-welcome">
                <p>
                  Describe what your program should do. I'll pick the right Teamcenter operations from your API,
                  list the steps, and write the Java.
                </p>
                <div className="ai-examples">
                  {EXAMPLES.map((ex) => (
                    <button key={ex} className="ai-chip" onClick={() => onSend(ex)} disabled={busy}>
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {turns.map((t) => (
              <div key={t.id} className="turn">
                <div className="msg-user">{t.query}</div>
                {t.result === null ? (
                  <div className="msg-ai pending">
                    <ul className="thinking">
                      {progress.slice(0, -1).map((m) => (
                        <li key={m} className="done">
                          <span className="tick">✓</span>
                          {doneText(m)}
                        </li>
                      ))}
                      <li className="now">
                        <span className="spinner small" />
                        {progress[progress.length - 1] ?? STAGES.understand.doing}
                      </li>
                    </ul>
                    <button className="clear" onClick={onCancel}>
                      Cancel
                    </button>
                  </div>
                ) : !t.result.ok ? (
                  <div className="msg-ai error">{t.result.error}</div>
                ) : (
                  <div
                    className={`msg-ai ok ${t.id === activeId ? 'active' : ''}`}
                    onClick={() => onSelect(t.id)}
                    title="Show this flow and its code"
                  >
                    <p>Here is the flow ({t.result.plan.steps.length} steps):</p>
                    <ol className="msg-steps">
                      {t.result.plan.steps.map((s) => {
                        const op = byUrl.get(s.url)
                        const v = s.values
                        const given = [
                          v.objectType && `type: ${v.objectType}`,
                          ...v.properties.map((p) => `${p.name} = "${p.value}"`),
                          v.file && `file: ${v.file}`
                        ].filter(Boolean)
                        return (
                          <li key={s.id}>
                            <span className="muted">{s.action} → </span>
                            {op ? (
                              <button
                                className="step-op"
                                title="Show this operation's details"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onSelect(t.id)
                                  onShowOperation(op)
                                }}
                              >
                                {op.name}
                              </button>
                            ) : (
                              <b>{s.url}</b>
                            )}
                            {s.source === 'recipe' && (
                              <span className="msg-recipe" title="From the built-in Teamcenter recipe book">
                                recipe
                              </span>
                            )}
                            {given.length > 0 && <div className="msg-values">{given.join(' · ')}</div>}
                          </li>
                        )
                      })}
                    </ol>
                    {t.result.notes.length > 0 && (
                      <ul className="ai-notes">
                        {t.result.notes.map((n, i) => (
                          <li key={i}>{n}</li>
                        ))}
                      </ul>
                    )}
                    {t.id !== activeId && <div className="msg-show">Show this flow →</div>}
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </div>

      <div className="chat-compose">
        <textarea
          className="ai-query"
          placeholder={ready ? 'e.g. Create an item, set its description, then check it in' : 'Set up local AI first'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          disabled={!ready}
          rows={3}
        />
        <div className="chat-compose-foot">
          <span className="muted">Enter to send · Shift+Enter for a new line</span>
          <button className="btn-primary" onClick={send} disabled={!ready || busy || !draft.trim()}>
            Send
          </button>
        </div>
      </div>
    </aside>
  )
}
