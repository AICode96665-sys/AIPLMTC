import { useMemo, useState } from 'react'
import type { Catalog, Operation } from '@shared/index'
import type { PlanStep, RankedOption } from '@shared/ai/planner'
import { retrieveOperations } from '@shared/ai/retrieve'

/** Why a step uses its operation, in plain words. */
function reason(step: PlanStep, bestUrl: string | undefined): { text: string; warn?: string } {
  const c = step.choice
  switch (c.by) {
    case 'recipe':
      return { text: `From the built-in recipe book: it matched “${c.matched ?? step.action}”.` }
    case 'setup':
      return { text: `Added automatically: Teamcenter needs this before “${c.forAction ?? 'the next step'}” (recipe book).` }
    case 'cleanup':
      return { text: `Added automatically: needed at the end, after “${c.forAction ?? 'the steps above'}” (recipe book).` }
    case 'only':
      return { text: `It was the only operation in your catalog that matched “${step.action}”.` }
    case 'ai':
      return {
        text: `Your catalog was searched for “${step.action}”, and the AI chose this one of the ${c.options.length} best matches.`,
        warn: bestUrl && bestUrl !== step.url ? 'The AI did not choose the best search match. Please check this step.' : undefined
      }
    case 'top':
      return { text: 'The AI gave no usable answer, so the best search match was used.' }
    case 'user':
      return { text: 'You chose this operation.' }
  }
}

function OptionRow({
  op,
  score,
  current,
  best,
  onPick
}: {
  op: Operation
  score?: number
  current: boolean
  best: boolean
  onPick?: () => void
}): JSX.Element {
  const body = (
    <>
      <div className="opt-head">
        <b>{op.name}</b>
        <span className="muted">
          {op.lib} · {op.serviceStub} · {op.year}
        </span>
        {current && <span className="opt-tag current">in use</span>}
        {best && <span className="opt-tag">best match</span>}
      </div>
      {score !== undefined && (
        <div className="opt-score" title="Search relevance (100 = best match found)">
          <div className="opt-bar">
            <div style={{ width: `${Math.max(4, Math.min(100, score))}%` }} />
          </div>
          <span>{score}</span>
        </div>
      )}
      {op.description && <div className="opt-desc">{op.description.replace(/\s+/g, ' ').slice(0, 140)}</div>}
    </>
  )
  return onPick && !current ? (
    <button className="opt-row pickable" onClick={onPick} title="Use this operation for this step">
      {body}
    </button>
  ) : (
    <div className="opt-row">{body}</div>
  )
}

/** "Why?" and "Change operation" for one step of an answer. */
export default function StepPanel({
  mode,
  step,
  catalog,
  byUrl,
  busy,
  error,
  onPick,
  onClose
}: {
  mode: 'why' | 'change'
  step: PlanStep
  catalog: Catalog
  byUrl: Map<string, Operation>
  busy: boolean
  error: string | null
  onPick: (url: string) => void
  onClose: () => void
}): JSX.Element {
  const [search, setSearch] = useState('')
  const options = step.choice.options.filter((o) => byUrl.has(o.url))
  const bestUrl = options[0]?.url
  const why = reason(step, bestUrl)

  const found = useMemo(() => {
    const q = search.trim()
    return q.length < 2 ? [] : retrieveOperations(catalog, q, 8).map((s) => s.op)
  }, [catalog, search])

  const current = byUrl.get(step.url)
  const row = (o: RankedOption, pickable: boolean): JSX.Element => (
    <OptionRow
      key={o.url}
      op={byUrl.get(o.url)!}
      score={o.score}
      current={o.url === step.url}
      best={o.url === bestUrl}
      onPick={pickable ? () => onPick(o.url) : undefined}
    />
  )

  return (
    <div className="step-panel" onClick={(e) => e.stopPropagation()}>
      <div className="step-panel-head">
        <b>{mode === 'why' ? 'Why this operation?' : 'Change operation'}</b>
        <button className="clear" onClick={onClose}>
          Close
        </button>
      </div>

      {mode === 'why' ? (
        <>
          <p>{why.text}</p>
          {why.warn && <p className="step-warn">⚠ {why.warn}</p>}
          {options.length > 0 && (
            <>
              <div className="muted small">Search matches for “{step.action}”, best first:</div>
              {options.map((o) => row(o, false))}
            </>
          )}
        </>
      ) : (
        <>
          {current && (
            <p className="muted small">
              Now: <b>{current.name}</b>. Pick another operation; the flow is re-wired and the Java is written again.
            </p>
          )}
          {options.length > 0 && (
            <>
              <div className="muted small">Best matches for “{step.action}”:</div>
              {options.map((o) => row(o, !busy))}
            </>
          )}
          <input
            className="search step-search"
            placeholder="Search all operations, e.g. export plmxml"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {found.map((op) => (
            <OptionRow
              key={op.url}
              op={op}
              current={op.url === step.url}
              best={false}
              onPick={busy ? undefined : () => onPick(op.url)}
            />
          ))}
          {search.trim().length >= 2 && found.length === 0 && <p className="muted small">No operations match.</p>}
          {busy && <p className="muted small">Writing the Java again…</p>}
          {error && <div className="loader-error">{error}</div>}
        </>
      )}
    </div>
  )
}
