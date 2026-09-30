import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import {
  EditorView,
  Decoration,
  MatchDecorator,
  ViewPlugin,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  type DecorationSet,
  type ViewUpdate
} from '@codemirror/view'
import { defaultKeymap } from '@codemirror/commands'
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import { java } from '@codemirror/lang-java'
import { oneDark } from '@codemirror/theme-one-dark'

/** Marks what the user still has to do (TODO) and what came from their request. */
function markPlugin(regexp: RegExp, className: string): ViewPlugin<{ marks: DecorationSet }> {
  const decorator = new MatchDecorator({ regexp, decoration: Decoration.mark({ class: className }) })
  return ViewPlugin.define(
    (view) => ({
      marks: decorator.createDeco(view),
      update(u: ViewUpdate) {
        this.marks = decorator.updateDeco(u, this.marks)
      }
    }),
    { decorations: (p) => p.marks }
  )
}

/** Click a line number to select that line; Shift+click to extend to a range of
 *  whole lines. The selection includes the line break, so pasted lines stay lines. */
const selectableLineNumbers = lineNumbers({
  domEventHandlers: {
    mousedown(view, block, event) {
      const e = event as MouseEvent
      const doc = view.state.doc
      const line = doc.lineAt(block.from)
      const sel = view.state.selection.main
      let from = line.from
      let to = line.to
      if (e.shiftKey && !sel.empty) {
        from = Math.min(doc.lineAt(sel.from).from, line.from)
        to = Math.max(doc.lineAt(Math.max(sel.to - 1, sel.from)).to, line.to)
      }
      view.dispatch({ selection: { anchor: from, head: Math.min(to + 1, doc.length) } })
      view.focus()
      return true
    }
  }
})

const theme = EditorView.theme(
  {
    '&': { height: '100%', fontSize: '12.5px', backgroundColor: '#1e1e1e' },
    '.cm-scroller': { fontFamily: "'Cascadia Code', Consolas, 'Courier New', monospace", lineHeight: '1.55' },
    '.cm-gutters': { backgroundColor: '#1e1e1e', borderRight: '1px solid #333', cursor: 'pointer' },
    '.cm-lineNumbers .cm-gutterElement': { padding: '0 10px 0 12px' },
    '.cm-lineNumbers .cm-gutterElement:hover': { color: '#fff' },
    '.cm-todo': { backgroundColor: 'rgba(229, 164, 44, 0.18)', color: '#f0c05a', borderRadius: '2px' },
    '.cm-given': { backgroundColor: 'rgba(80, 200, 140, 0.18)', color: '#7fd1a8', borderRadius: '2px' },
    '.cm-wired': { backgroundColor: 'rgba(97, 175, 239, 0.16)', color: '#8cc4f5', borderRadius: '2px' },
    '.cm-selectionMatch': { backgroundColor: 'rgba(97, 175, 239, 0.25)' }
  },
  { dark: true }
)

export default function JavaCodeView({
  code,
  onSelectionChange
}: {
  code: string
  /** The currently selected text ('' when nothing is selected). */
  onSelectionChange?: (text: string) => void
}): JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const onSel = useRef(onSelectionChange)
  onSel.current = onSelectionChange

  // create the editor once
  useEffect(() => {
    if (!host.current) return
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: code,
        extensions: [
          selectableLineNumbers,
          highlightActiveLineGutter(),
          highlightActiveLine(),
          drawSelection(),
          EditorState.readOnly.of(true),
          java(),
          oneDark,
          theme,
          highlightSelectionMatches(),
          search({ top: true }),
          keymap.of([...searchKeymap, ...defaultKeymap]),
          markPlugin(/\bTODO\b.*$/gm, 'cm-todo'),
          markPlugin(/\/\/ from your request/g, 'cm-given'),
          markPlugin(/\/\/ from step \d+.*$/gm, 'cm-wired'),
          EditorView.updateListener.of((u) => {
            if (!u.selectionSet && !u.docChanged) return
            const { from, to } = u.state.selection.main
            onSel.current?.(u.state.sliceDoc(from, to))
          })
        ]
      })
    })
    view.current = v
    return () => {
      v.destroy()
      view.current = null
    }
    // the document is updated by the effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // new code (another answer selected, ...) -> replace the document, back to the top
  useEffect(() => {
    const v = view.current
    if (!v || v.state.doc.toString() === code) return
    v.dispatch({
      changes: { from: 0, to: v.state.doc.length, insert: code },
      selection: { anchor: 0 },
      effects: EditorView.scrollIntoView(0)
    })
  }, [code])

  return <div className="code-editor" ref={host} />
}
