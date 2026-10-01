import { useCallback, useEffect, useMemo, useState } from 'react'
import { expandForDisplay, operationPorts, type Catalog, type Operation, type RawData, type TypeDef } from '@shared/index'
import type { AiStatus, OperationNotes } from '@shared/ai/status'
import SchemaView from './SchemaView'
import JavaCodeView from './JavaCodeView'
import AiChat, { type Turn } from './AiChat'

/** "ItemProperties[]" from "Teamcenter::Soa::Core::_2006_03::DataManagement::ItemProperties[]". */
const shortType = (t: string): string => t.split('::').pop()!

/** The first sentence of a description (the full text stays below). */
function firstSentence(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  const m = flat.match(/^(.{20,300}?[.!?])(\s|$)/)
  return m ? m[1] : flat.slice(0, 300)
}

/** Details for one operation — shown when a step name in the chat is clicked. A short
 *  summary (what it does, takes, returns, and what the recipe book knows) comes first,
 *  all from the catalog and the recipe book, nothing generated. */
function OperationDetails({ op, rawData, onClose }: { op: Operation; rawData: RawData; onClose: () => void }): JSX.Element {
  const expanded = useMemo(
    () => ({
      input: expandForDisplay(rawData, op.input) as TypeDef,
      output: expandForDisplay(rawData, op.output) as TypeDef
    }),
    [op, rawData]
  )
  const ports = useMemo(() => operationPorts(op), [op])
  const [notes, setNotes] = useState<OperationNotes | null>(null)
  useEffect(() => {
    let current = true
    setNotes(null)
    window.tc.operationNotes(op.url).then((n) => current && setNotes(n), () => {})
    return () => {
      current = false
    }
  }, [op])
  const list = (ps: { name: string; type: string }[]): string =>
    ps.map((p) => `${p.name} (${shortType(p.type)})`).join(', ')
  const results = ports.outputs.filter((p) => p.name !== 'serviceData')
  return (
    <div className="op-drawer">
      <div className="suggest-head">
        <div>
          <b>{op.name}</b>
          <div className="muted">
            {op.lib} · {op.serviceStub} · {op.year}
          </div>
        </div>
        <button className="clear" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="op-drawer-body op-detail">
        <div className="op-summary">
          {op.description && <p className="op-what">{firstSentence(op.description)}</p>}
          <dl className="op-io">
            <dt>Takes</dt>
            <dd>{ports.inputs.length ? list(ports.inputs) : 'nothing'}</dd>
            <dt>Returns</dt>
            <dd>
              {results.length ? list(results) : 'ServiceData only'}
              {results.length > 0 && ports.outputs.some((p) => p.name === 'serviceData') ? ', serviceData' : ''}
            </dd>
          </dl>
          {notes && (notes.needsFirst.length > 0 || notes.followWith.length > 0 || notes.partOf.length > 0) && (
            <ul className="op-notes" title="From the built-in recipe book">
              {notes.needsFirst.length > 0 && <li>Needs first: {notes.needsFirst.join(', ')}</li>}
              {notes.followWith.length > 0 && <li>Follow with: {notes.followWith.join(', ')}</li>}
              {notes.partOf.map((p) => (
                <li key={p}>Usually part of: {p}</li>
              ))}
            </ul>
          )}
        </div>
        <h3>Description</h3>
        <p className="desc">{op.description}</p>
        <dl className="meta">
          <dt>SOA Dependency</dt>
          <dd className="mono">{op.include}</dd>
        </dl>
        <h3>Request</h3>
        <SchemaView def={expanded.input} />
        <h3>Response</h3>
        <SchemaView def={expanded.output} />
      </div>
    </div>
  )
}

/** The AI-only workspace: chat on the left (the steps), the generated Java on the right. */
export default function AiStudio({ catalog, rawData }: { catalog: Catalog; rawData: RawData }): JSX.Element {
  const byUrl = useMemo(() => new Map(catalog.operations.map((o) => [o.url, o])), [catalog])

  const [status, setStatus] = useState<AiStatus | null>(null)
  const [checking, setChecking] = useState(true)
  const [turns, setTurns] = useState<Turn[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  /** stages reached so far for the running request ("thinking" view) */
  const [progress, setProgress] = useState<string[]>([])
  const [detailsOp, setDetailsOp] = useState<Operation | null>(null)
  /** which button just copied: 'all' | 'selection' */
  const [copied, setCopied] = useState<'all' | 'selection' | null>(null)
  const [selection, setSelection] = useState('')
  const refresh = useCallback(async () => {
    setChecking(true)
    try {
      setStatus(await window.tc.aiStatus())
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    return window.tc.onAiProgress((m) => setProgress((p) => (p[p.length - 1] === m ? p : p.concat(m))))
  }, [refresh])

  /** Ask the AI. A follow-up ("check out this object") continues the flow on screen; the
   *  back end decides whether the words point back. */
  const send = useCallback(
    async (query: string) => {
      if (busy) return
      const shown = turns.find((t) => t.id === activeId)?.result
      const continueFrom = shown?.ok ? shown.planId : undefined
      const id = Date.now()
      setTurns((ts) => ts.concat({ id, query, result: null }))
      setBusy(true)
      setProgress([])
      try {
        const result = await window.tc.aiPlan(query, continueFrom)
        setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, result } : t)))
        if (result.ok) {
          setActiveId(id)
          setDetailsOp(null)
          setCopied(null)
        }
      } finally {
        setBusy(false)
      }
    },
    [busy, turns, activeId]
  )

  const active = turns.find((t) => t.id === activeId)?.result
  const activeOk = active?.ok ? active : null

  const copyAll = useCallback(async () => {
    if (!activeOk) return
    await window.tc.copyText(activeOk.code)
    setCopied('all')
  }, [activeOk])

  const copySelection = useCallback(async () => {
    if (!selection) return
    await window.tc.copyText(selection)
    setCopied('selection')
  }, [selection])

  const onSelectionChange = useCallback((text: string) => {
    setSelection(text)
    setCopied(null)
  }, [])

  const selectedLines = selection ? selection.replace(/\n$/, '').split('\n').length : 0

  return (
    <div className="studio">
      <AiChat
        status={status}
        checking={checking}
        onRefresh={refresh}
        turns={turns}
        activeId={activeId}
        onSelect={(id) => {
          setActiveId(id)
          setDetailsOp(null)
          setCopied(null)
        }}
        busy={busy}
        progress={progress}
        onSend={send}
        onCancel={() => window.tc.aiCancel()}
        byUrl={byUrl}
        onShowOperation={setDetailsOp}
      />

      <div className="studio-main">
        <section className="code-pane">
          <div className="code-head">
            <span>Java code</span>
            <div className="code-actions">
              {activeOk && selection && (
                <button className="btn-secondary" onClick={copySelection} title="Copy the selected text (or press Ctrl+C)">
                  {copied === 'selection' ? 'Copied ✓' : `Copy selection (${selectedLines} line${selectedLines === 1 ? '' : 's'})`}
                </button>
              )}
              {activeOk && (
                <button className="btn-primary" onClick={copyAll}>
                  {copied === 'all' ? 'Copied ✓' : 'Copy all'}
                </button>
              )}
            </div>
          </div>
          <JavaCodeView
            code={activeOk ? activeOk.code : '// Ask the AI on the left — the Java for your flow will appear here.'}
            onSelectionChange={onSelectionChange}
          />
          <div className="code-hint">
            Click a line number to select a line · Shift+click to select several · Ctrl+C to copy · Ctrl+F to search ·
            <span className="hint-todo"> TODO</span> = fill in ·<span className="hint-given"> from your request</span> = filled from your words ·
            <span className="hint-wired"> from step N</span> = taken from an earlier step
          </div>
          {detailsOp && <OperationDetails op={detailsOp} rawData={rawData} onClose={() => setDetailsOp(null)} />}
        </section>
      </div>
    </div>
  )
}
