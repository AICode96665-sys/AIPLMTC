import { useState } from 'react'
import { htmlToText, type Field, type MapDef, type TypeDef } from '@shared/index'

function isMap(def: TypeDef): def is MapDef {
  return typeof def === 'object' && !Array.isArray(def) && (def as MapDef).$ === true
}

function FieldRow({ name, field }: { name: string; field: Field }): JSX.Element {
  const [open, setOpen] = useState(false)
  const isArray = field.type.includes('[]')
  const hasChildren = field.properties != null && typeof field.properties === 'object'
  const hasDesc = Boolean(field.description)

  return (
    <div className="field">
      <div className="field-head" onClick={() => (hasDesc || hasChildren) && setOpen(!open)}>
        <span className="field-name">{name}</span>
        <span className="field-type">
          : {field.type}
          {isArray ? '' : ''}
          {field.recursive ? ' ↻ (recursive)' : ''}
        </span>
        {(hasDesc || hasChildren) && <span className="toggle">{open ? '▾' : '▸'}</span>}
      </div>
      {open && hasDesc && <div className="field-desc">{htmlToText(field.description ?? '')}</div>}
      {open && hasChildren && (
        <div className="nested">
          <SchemaNode def={field.properties as TypeDef} />
        </div>
      )}
    </div>
  )
}

function SchemaNode({ def }: { def: TypeDef }): JSX.Element {
  if (def == null) return <span className="leaf">—</span>

  if (typeof def === 'string') {
    return <span className="leaf">&quot;{def}&quot;</span>
  }

  if (Array.isArray(def)) {
    return <span className="leaf enum">enum: [{def.join(', ')}]</span>
  }

  if (isMap(def)) {
    return (
      <div className="map">
        <div className="map-label">Map</div>
        <FieldRow name="key" field={def.key} />
        <FieldRow name="value" field={def.value} />
      </div>
    )
  }

  const entries = Object.entries(def as Record<string, Field>)
  if (entries.length === 0) return <span className="leaf">{'{}'}</span>

  return (
    <div className="object">
      {entries.map(([name, field]) => (
        <FieldRow key={name} name={name} field={field} />
      ))}
    </div>
  )
}

export default function SchemaView({ def }: { def: TypeDef }): JSX.Element {
  return (
    <div className="schema">
      <SchemaNode def={def} />
    </div>
  )
}
