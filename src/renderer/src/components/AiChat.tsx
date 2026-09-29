import { useEffect, useRef, useState } from 'react'
import type { AiBuildResult, AiStatus } from '@shared/ai/status'
import type { Operation } from '@shared/index'
import { LIMITS } from '@shared/edition'
import ModelDownload from './ModelDownload'

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
  onChooseModel,
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
  onChooseModel: (model: string) => void
  turns: Turn[]
  activeId: number | null
  onSelect: (id: number) => void
  busy: boolean
  progress: string
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
        {LIMITS.model ? (
          status?.selected && (
            <span className="chat-model-fixed" title="AI model used by this edition (runs on this computer)">
              AI model: {status.selected}
            </span>
          )
        ) : status?.running && status.models.length > 0 && (
          <select
            className="chat-model"
            value={status.selected ?? ''}
            onChange={(e) => onChooseModel(e.target.value)}
            disabled={busy}
            title="AI model (runs on this computer)"
          >
            {status.models.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name} ({m.sizeGB} GB){m.nonCommercial ? ' — non-commercial license' : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {status?.models.find((m) => m.name === status.selected)?.nonCommercial && (
        <div className="license-warn">
          ⚠ {status.selected} is licensed for non-commercial use only. Pick another model for business use.
        </div>
      )}
      <div className="chat-list" ref={listRef}>
        {checking && !status ? (
          <p className="muted">Checking local AI…</p>
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
              <b>Ollama is running, but the AI model is not installed yet.</b>
            </p>
            <ModelDownload model={status.recommended} onDone={onRefresh} />
            <p className="muted dl-alt">
              Or in a terminal: <code>ollama pull {status.recommended}</code>, then{' '}
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
                  draw the flow, and write the Java.
                </p>
                <div className="ai-examples">
                  {EXAMPLES.map((ex) => (
                    <button key={ex} className="ai-chip" onClick={() => onSend(ex)} disabled={busy}>
                      {ex}
                    </button>
                  ))}
                </div>
                {!status.models.some((m) => m.name === status.recommended) && (
                  <p className="ai-tip">
                    Tip: for better results on your {status.ramGB} GB machine, run{' '}
                    <code>ollama pull {status.recommended}</code> then{' '}
                    <button className="link-btn" onClick={onRefresh}>
                      refresh
                    </button>
                    .
                  </p>
                )}
              </div>
            )}

            {turns.map((t) => (
              <div key={t.id} className="turn">
                <div className="msg-user">{t.query}</div>
                {t.result === null ? (
                  <div className="msg-ai pending">
                    <span className="spinner small" />
                    <span className="muted">{progress}</span>
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
