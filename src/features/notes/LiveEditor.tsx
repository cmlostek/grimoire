/**
 * Live-preview note editor built on CodeMirror 6.
 *
 * Highlights all decorator syntax inline as you type (IDE-style),
 * handles click-to-roll on $formula$ chips and click-to-toggle on
 * {{secrets}}, and shows [[wiki]] autocomplete.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  EditorView,
  ViewPlugin,
  Decoration,
  type DecorationSet,
  type ViewUpdate,
  keymap,
  drawSelection,
} from '@codemirror/view';
import { EditorState, RangeSetBuilder } from '@codemirror/state';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands';
import { useQuickDice } from '../dice/quickDiceStore';
import { searchWiki, kindLabel, type WikiEntry } from './wikiIndex';

// ─── Decorator token regex (mirrors decorators.ts TOKEN) ────────────────────
const DECO_RE =
  /(@\{[^}\n]+\}|\?\{[^}\n]+\}|!\{[^}\n]+\}|\$\{[^}\n]+\}|\$(?!\{)[^$\n]+\$|%%[^%\n]+?%%|\{\{!?[^}\n]*?\}\}|\[\[[^\]\n]+\]\])/g;

function tokenClass(token: string): string | null {
  if (token.startsWith('@{'))  return 'cm-d-loc';
  if (token.startsWith('?{'))  return 'cm-d-dep';
  if (token.startsWith('!{'))  return 'cm-d-milestone';
  if (token.startsWith('${'))  return 'cm-d-artifact';
  if (token.startsWith('%%'))  return 'cm-d-comment';
  if (token.startsWith('{{'))  return 'cm-d-secret';
  if (token.startsWith('[['))  return 'cm-d-link';
  if (token.startsWith('$'))   return 'cm-d-dice';
  return null;
}

// ─── Mark decorations for decorator tokens ───────────────────────────────────
function buildMarkDecos(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    DECO_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = DECO_RE.exec(text)) !== null) {
      const cls = tokenClass(m[0]);
      if (!cls) continue;
      builder.add(from + m.index, from + m.index + m[0].length, Decoration.mark({ class: cls }));
    }
  }
  return builder.finish();
}

const markPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = buildMarkDecos(view); }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.decorations = buildMarkDecos(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);

// ─── Heading line decorations ────────────────────────────────────────────────
const H_RE = /^(#{1,3}) /;

function buildHeadingDecos(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const m = H_RE.exec(line.text);
      if (m) {
        builder.add(
          line.from,
          line.from,
          Decoration.line({ class: `cm-heading cm-h${m[1].length}` }),
        );
      }
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

const headingPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = buildHeadingDecos(view); }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.decorations = buildHeadingDecos(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);

// ─── Theme ────────────────────────────────────────────────────────────────────
const noteTheme = EditorView.theme(
  {
    '&': { height: '100%', backgroundColor: '#020617' },
    '.cm-scroller': {
      overflow: 'auto',
      fontFamily: 'ui-monospace, monospace',
      fontSize: '14px',
    },
    '.cm-content': {
      padding: '24px 32px',
      color: '#f1f5f9',
      lineHeight: '1.75',
      caretColor: '#f1f5f9',
      minHeight: '100%',
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-focused': { outline: 'none' },
    '.cm-line': { padding: '0' },
    '.cm-cursor': { borderLeftColor: '#e2e8f0', borderLeftWidth: '2px' },
    '&.cm-focused .cm-selectionBackground': { backgroundColor: '#1d4ed850' },
    '.cm-selectionBackground': { backgroundColor: '#1d4ed830' },
    '.cm-gutters': { display: 'none' },
    // Headings
    '.cm-heading': {
      fontFamily: '"Iowan Old Style", Georgia, serif !important',
      color: '#bae6fd !important',
      fontWeight: 'bold !important',
    },
    '.cm-h1': {
      fontSize: '1.7em !important',
      borderBottom: '1px solid #334155',
      paddingBottom: '0.15em',
      display: 'block',
    },
    '.cm-h2': { fontSize: '1.35em !important' },
    '.cm-h3': { fontSize: '1.15em !important' },
    // Decorator marks
    '.cm-d-loc':       { background: 'rgba(251,146,60,.18)',  color: '#fdba74', borderRadius: '0.25em', padding: '0.05em 0.25em' },
    '.cm-d-dep':       { background: 'rgba(244,63,94,.18)',   color: '#fda4af', borderRadius: '0.25em', padding: '0.05em 0.25em' },
    '.cm-d-milestone': { background: 'rgba(56,189,248,.18)',  color: '#7dd3fc', borderRadius: '0.25em', padding: '0.05em 0.25em' },
    '.cm-d-artifact':  { background: 'rgba(34,197,94,.18)',   color: '#86efac', borderRadius: '0.25em', padding: '0.05em 0.25em' },
    '.cm-d-comment':   { color: '#64748b', fontStyle: 'italic', background: 'rgba(100,116,139,.08)', borderRadius: '0.25em', padding: '0.05em 0.25em' },
    '.cm-d-secret':    { background: 'rgba(139,92,246,.10)', color: '#c4b5fd', borderBottom: '1.5px dashed rgba(167,139,250,.5)', borderRadius: '0.25em', padding: '0.05em 0.25em', cursor: 'pointer' },
    '.cm-d-link':      { color: '#7dd3fc', background: 'rgba(14,165,233,.10)', borderBottom: '1px dashed rgba(125,211,252,.4)', borderRadius: '0.25em', padding: '0.05em 0.25em', cursor: 'pointer' },
    '.cm-d-dice':      { color: '#a5b4fc', background: 'rgba(99,102,241,.15)', border: '1px solid rgba(129,140,248,.35)', borderRadius: '0.25em', padding: '0.05em 0.35em', cursor: 'pointer' },
  },
  { dark: true },
);

// ─── Auto-pair characters ────────────────────────────────────────────────────
const autoPairExt = EditorView.inputHandler.of((view, from, to, text) => {
  const before = view.state.doc.sliceString(Math.max(0, from - 1), from);

  if (text === '{') {
    // @{ ?{ !{ ${ → auto-close }
    if ('@?!$'.includes(before)) {
      view.dispatch({ changes: { from, to, insert: '{}' }, selection: { anchor: from + 1 } });
      return true;
    }
    // {{ → auto-close }}
    if (before === '{') {
      view.dispatch({ changes: { from, to, insert: '}}' }, selection: { anchor: from + 1 } });
      return true;
    }
  }
  if (text === '[' && before === '[') {
    view.dispatch({ changes: { from, to, insert: '[]' }, selection: { anchor: from + 1 } });
    return true;
  }
  if (text === '%' && before === '%') {
    view.dispatch({ changes: { from, to, insert: '%%' }, selection: { anchor: from + 1 } });
    return true;
  }
  return false;
});

// ─── Wiki suggestion state ───────────────────────────────────────────────────
type SuggestState = {
  results: WikiEntry[];
  cursor: number;
  openAt: number; // doc position of '['[ open
  x: number;
  y: number;
};

// ─── LiveEditor component ────────────────────────────────────────────────────
type Props = {
  body: string;
  onChange: (v: string) => void;
  wikiIndex: WikiEntry[];
  onNavigate: (path: string) => void;
  rollFormula: (formula: string) => void;
};

export function LiveEditor({ body, onChange, wikiIndex, onNavigate, rollFormula }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  // Stable refs so CM6 closures never go stale
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const wikiRef = useRef(wikiIndex);
  wikiRef.current = wikiIndex;
  const navRef = useRef(onNavigate);
  navRef.current = onNavigate;
  const rollRef = useRef(rollFormula);
  rollRef.current = rollFormula;

  const [suggest, setSuggest] = useState<SuggestState | null>(null);
  const suggestRef = useRef(suggest);
  suggestRef.current = suggest;

  // Accept a wiki suggestion
  const acceptSuggestion = useCallback((entry: WikiEntry) => {
    const view = viewRef.current;
    const s = suggestRef.current;
    if (!view || !s) return;
    const pos = view.state.selection.main.head;
    view.dispatch({
      changes: { from: s.openAt, to: pos, insert: `[[${entry.name}]]` },
      selection: { anchor: s.openAt + entry.name.length + 4 },
    });
    setSuggest(null);
    view.focus();
  }, []);

  // Keyboard handler for suggestion dropdown (capture phase so CM6 doesn't eat it)
  useEffect(() => {
    if (!suggest) return;
    const handler = (e: KeyboardEvent) => {
      const s = suggestRef.current;
      if (!s) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setSuggest({ ...s, cursor: (s.cursor + 1) % s.results.length });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setSuggest({ ...s, cursor: (s.cursor - 1 + s.results.length) % s.results.length });
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        acceptSuggestion(s.results[s.cursor]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setSuggest(null);
      }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [suggest !== null, acceptSuggestion]); // eslint-disable-line react-hooks/exhaustive-deps

  // Click handler extension (dice + secret toggle + wiki nav)
  const clickExt = EditorView.domEventHandlers({
    mousedown(event, view) {
      const coords = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (coords === null) return false;
      const line = view.state.doc.lineAt(coords);
      const col = coords - line.from;
      DECO_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = DECO_RE.exec(line.text)) !== null) {
        if (col < m.index || col > m.index + m[0].length) continue;
        const token = m[0];
        // Dice chip
        if (token.startsWith('$') && !token.startsWith('${') && token.endsWith('$')) {
          event.preventDefault();
          rollRef.current(token.slice(1, -1).trim());
          return true;
        }
        // Secret toggle: flip {{text}} ↔ {{!text}}
        if (token.startsWith('{{') && token.endsWith('}}')) {
          event.preventDefault();
          const inner = token.slice(2, -2);
          const newToken = inner.startsWith('!')
            ? `{{${inner.slice(1)}}}`
            : `{{!${inner}}}`;
          const from = line.from + m.index;
          view.dispatch({ changes: { from, to: from + token.length, insert: newToken } });
          return true;
        }
        // Wiki link navigation
        if (token.startsWith('[[') && token.endsWith(']]')) {
          event.preventDefault();
          const name = token.slice(2, -2);
          const hit = wikiRef.current.find((e) => e.name === name);
          if (hit) navRef.current(hit.route);
          return true;
        }
      }
      return false;
    },
  });

  // Mount CM6 once
  useEffect(() => {
    if (!containerRef.current) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: body,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          drawSelection(),
          headingPlugin,
          markPlugin,
          clickExt,
          autoPairExt,
          noteTheme,
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (!update.docChanged && !update.selectionSet) return;

            // Push text changes to parent store
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }

            // Wiki autocomplete: detect [[prefix
            const pos = update.state.selection.main.head;
            const upto = update.state.doc.sliceString(0, pos);
            const openAt = upto.lastIndexOf('[[');
            if (openAt !== -1) {
              const fragment = upto.slice(openAt + 2);
              if (!fragment.includes(']]') && !fragment.includes('\n')) {
                const results = searchWiki(wikiRef.current, fragment, 6);
                if (results.length > 0) {
                  const coords = update.view.coordsAtPos(pos);
                  if (coords) {
                    setSuggest((prev) => ({
                      results,
                      cursor: prev?.openAt === openAt ? prev.cursor : 0,
                      openAt,
                      x: coords.left,
                      y: coords.bottom + 4,
                    }));
                    return;
                  }
                }
              }
            }
            setSuggest(null);
          }),
        ],
      }),
      parent: containerRef.current,
    });

    viewRef.current = view;
    // Auto-focus
    requestAnimationFrame(() => view.focus());

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount once only

  // Sync external body changes (realtime updates, note switching handled by key={note.id})
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== body) {
      // Preserve cursor position when syncing from outside
      const { from } = view.state.selection.main;
      view.dispatch({
        changes: { from: 0, to: current.length, insert: body },
        selection: { anchor: Math.min(from, body.length) },
      });
    }
  }, [body]);

  return (
    <div className="relative h-full" style={{ minHeight: 0 }}>
      <div ref={containerRef} className="h-full" />

      {/* Wiki autocomplete dropdown */}
      {suggest &&
        createPortal(
          <div
            style={{ position: 'fixed', left: suggest.x, top: suggest.y, zIndex: 50 }}
            className="w-64 bg-slate-900 border border-slate-700 rounded shadow-lg overflow-hidden"
            onMouseDown={(e) => e.preventDefault()}
          >
            <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
              Wiki — {/* show query */}
            </div>
            {suggest.results.map((r, i) => (
              <div
                key={`${r.kind}-${r.id}`}
                onClick={() => acceptSuggestion(r)}
                className={`px-2 py-1 flex items-center justify-between cursor-pointer text-xs ${
                  i === suggest.cursor
                    ? 'bg-sky-900/50 text-sky-100'
                    : 'hover:bg-slate-800 text-slate-300'
                }`}
              >
                <span className="truncate">{r.name}</span>
                <span className="text-[10px] text-slate-500 ml-2 shrink-0">
                  {kindLabel(r.kind)}
                </span>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
