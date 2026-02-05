import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'

/**
 * Custom CodeMirror 6 theme matching the Red Ledger palette.
 * Background: paper, Gutter: paper-stack, Cursor: rca-red
 */
const theme = EditorView.theme({
  '&': {
    backgroundColor: '#FDFCF8',
    color: '#2C2C2C',
    fontSize: '13px'
  },
  '.cm-content': {
    caretColor: '#DB1E1E',
    fontFamily: "'JetBrains Mono', 'Menlo', monospace",
    padding: '8px 0'
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: '#DB1E1E',
    borderLeftWidth: '2px'
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'rgba(219, 30, 30, 0.15)'
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(245, 241, 232, 0.5)'
  },
  '.cm-gutters': {
    backgroundColor: '#F4F1EA',
    color: '#2C2C2C80',
    border: 'none',
    borderRight: '1px solid #E5E0D5'
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'rgba(245, 241, 232, 0.7)'
  },
  '.cm-foldPlaceholder': {
    backgroundColor: '#F4F1EA',
    color: '#2C2C2C80',
    border: '1px solid #E5E0D5'
  },
  '.cm-placeholder': {
    color: '#2C2C2C40',
    fontStyle: 'italic'
  },
  '.cm-line': {
    padding: '0 8px'
  }
})

const highlighting = HighlightStyle.define([
  { tag: tags.heading, fontWeight: 'bold', color: '#2C2C2C' },
  { tag: tags.heading1, fontSize: '1.3em' },
  { tag: tags.heading2, fontSize: '1.15em' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.link, color: '#DB1E1E', textDecoration: 'underline' },
  { tag: tags.url, color: '#5D737E' },
  { tag: tags.monospace, fontFamily: "'JetBrains Mono', monospace", color: '#8B4513' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.quote, color: '#2C2C2C99', fontStyle: 'italic' },
  { tag: tags.list, color: '#DB1E1E' },
  { tag: tags.comment, color: '#2C2C2C50' },
  { tag: tags.processingInstruction, color: '#5D737E' }
])

export const redLedgerTheme = [theme, syntaxHighlighting(highlighting)]
