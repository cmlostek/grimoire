/**
 * Live-preview note editor — Obsidian-style.
 *
 * - Inline markdown rendered as you type: **bold**, *italic*, `code`, bullets, blockquotes
 * - Cursor line shows raw syntax; all other lines show rendered output
 * - {{secrets}} show as interactive widgets when cursor is outside them
 * - Decorator tokens highlighted in colour
 * - Click $dice$ to roll, click [[wiki]] to navigate, [[...]] autocomplete
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  EditorView,
  ViewPlugin,
  Decoration,
  WidgetType, // used by BulletWidget and SecretWidget
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
import { searchWiki, kindLabel, type WikiEntry } from './wikiIndex';
import { modifier } from '../../data/srd';
import type { PartyMember } from '../party/partyStore';
import { Shield, Heart } from 'lucide-react';

// ─── Decorator token regex (secrets excluded — handled by secretPlugin) ───────
const DECO_RE =
  /(@\{[^}\n]+\}|\?\{[^}\n]+\}|!\{[^}\n]+\}|\$\{[^}\n]+\}|\$(?!\{)[^$\n]+\$|%%[^%\n]+?%%|\[\[[^\]\n]+\]\])/g;

const SECRET_RE = /\{\{(!?[^}\n]*?)\}\}/g;

function tokenClass(token: string): string | null {
  if (token.startsWith('@{'))  return 'cm-d-loc';
  if (token.startsWith('?{'))  return 'cm-d-dep';
  if (token.startsWith('!{'))  return 'cm-d-milestone';
  if (token.startsWith('${'))  return 'cm-d-artifact';
  if (token.startsWith('%%'))  return 'cm-d-comment';
  if (token.startsWith('[['))  return 'cm-d-link';
  if (token.startsWith('$'))   return 'cm-d-dice';
  return null;
}

// ─── Decorator token marks ────────────────────────────────────────────────────
// Returns [openLen, closeLen] for each token type's syntax markers.
function markerLens(token: string): [number, number] {
  if (token.startsWith('%%'))                               return [2, 2]; // %%…%%
  if (token.startsWith('[['))                               return [2, 2]; // [[…]]
  if (token.startsWith('$') && !token.startsWith('${'))    return [1, 1]; // $…$  dice
  return [2, 1]; // @{…}  ?{…}  !{…}  ${…}
}

function buildMarkDecos(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();

  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    DECO_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = DECO_RE.exec(text)) !== null) {
      const cls = tokenClass(m[0]);
      if (!cls) continue;
      const absFrom = from + m.index;
      const absTo   = absFrom + m[0].length;
      const [openLen, closeLen] = markerLens(m[0]);
      const contentFrom = absFrom + openLen;
      const contentTo   = absTo   - closeLen;
      if (contentFrom < contentTo) {
        builder.add(absFrom,     contentFrom, HIDDEN);
        builder.add(contentFrom, contentTo,   Decoration.mark({ class: cls }));
        builder.add(contentTo,   absTo,       HIDDEN);
      } else {
        builder.add(absFrom, absTo, Decoration.mark({ class: cls }));
      }
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

// ─── Heading line decorations ─────────────────────────────────────────────────
const H_RE = /^(#{1,3}) /;

function buildHeadingDecos(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const m = H_RE.exec(line.text);
      if (m) {
        builder.add(line.from, line.from, Decoration.line({ class: `cm-heading cm-h${m[1].length}` }));
        builder.add(line.from, line.from + m[0].length, HIDDEN);
      }
      if (line.to >= to) break;
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

// ─── Inline markdown: bold, italic, code ─────────────────────────────────────
// Separate regexes so there are no ordering conflicts in the builder.
const BOLD_RE      = /\*\*([^*\n]+?)\*\*/g;
const ITALIC_RE    = /(?<!\*)\*(?!\*)([^*\n]+?)(?<!\*)\*(?!\*)/g;
const CODE_INL_RE  = /`([^`\n]+?)`/g;

// Hides markdown syntax markers via CSS — simpler and more reliable than Decoration.replace().
const HIDDEN = Decoration.mark({ class: 'cm-syn-hidden' });

/** Build decorations for ONE inline pattern. Ranges always in ascending order. */
function buildInlineDecos(
  view: EditorView,
  re: RegExp,
  markerLen: number,
  contentCls: string,
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();

  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const abs = from + m.index;
      const absEnd = abs + m[0].length;
      const openTo    = abs + markerLen;
      const closeFrom = absEnd - markerLen;
      if (openTo <= closeFrom) {
        builder.add(abs,       openTo,    HIDDEN);
        builder.add(openTo,    closeFrom, Decoration.mark({ class: contentCls }));
        builder.add(closeFrom, absEnd,    HIDDEN);
      }
    }
  }
  return builder.finish();
}

const boldPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildInlineDecos(view, BOLD_RE, 2, 'cm-bold');
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || u.selectionSet) {
        this.decorations = buildInlineDecos(u.view, BOLD_RE, 2, 'cm-bold');
      }
    }
  },
  { decorations: (v) => v.decorations },
);

const italicPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildInlineDecos(view, ITALIC_RE, 1, 'cm-italic');
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || u.selectionSet) {
        this.decorations = buildInlineDecos(u.view, ITALIC_RE, 1, 'cm-italic');
      }
    }
  },
  { decorations: (v) => v.decorations },
);

const codeInlinePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildInlineDecos(view, CODE_INL_RE, 1, 'cm-code-inline');
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || u.selectionSet) {
        this.decorations = buildInlineDecos(u.view, CODE_INL_RE, 1, 'cm-code-inline');
      }
    }
  },
  { decorations: (v) => v.decorations },
);

// ─── Lists and blockquotes ────────────────────────────────────────────────────
const LIST_RE      = /^(\s*)([-*+]|\d+\.) /;
const BLOCKQUOTE_RE = /^(\s*)> /;

class BulletWidget extends WidgetType {
  constructor(readonly bullet: string) { super(); }
  toDOM(): HTMLElement {
    const el = document.createElement('span');
    el.className = 'cm-bullet-widget';
    el.textContent = /^\d/.test(this.bullet) ? this.bullet + ' ' : '• ';
    return el;
  }
  eq(other: BulletWidget) { return other.bullet === this.bullet; }
  ignoreEvent() { return true; }
}

function buildListDecos(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();

  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const lm = LIST_RE.exec(line.text);
      if (lm) {
        const indent    = lm[1].length;
        const markerStart = line.from + indent;
        const markerEnd   = markerStart + lm[2].length + 1;
        builder.add(markerStart, markerEnd, Decoration.replace({ widget: new BulletWidget(lm[2]) }));
      }
      if (BLOCKQUOTE_RE.test(line.text)) {
        builder.add(line.from, line.from, Decoration.line({ class: 'cm-blockquote-line' }));
        const bqEnd = line.from + line.text.match(/^(\s*> )/)![0].length;
        builder.add(line.from, bqEnd, HIDDEN);
      }
      if (line.to >= to) break;
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

const listPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = buildListDecos(view); }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.decorations = buildListDecos(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);

// ─── Secret widget ────────────────────────────────────────────────────────────
class SecretWidget extends WidgetType {
  constructor(
    readonly rawText: string,  // content without leading !
    readonly revealed: boolean,
    readonly docFrom: number,
    readonly docTo: number,
  ) { super(); }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('span');
    wrap.className = `cm-secret-widget ${this.revealed ? 'csw-revealed' : 'csw-locked'}`;

    // ── header row ──────────────────────────────────────────────────────────
    const hdr = document.createElement('span');
    hdr.className = 'csw-header';

    const icon = document.createElement('span');
    icon.className = 'csw-icon';
    icon.innerHTML = this.revealed
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;

    const lbl = document.createElement('span');
    lbl.className = 'csw-label';
    lbl.textContent = this.revealed ? 'Discovered' : 'Secret';

    const btn = document.createElement('button');
    btn.className = 'csw-btn';
    btn.textContent = this.revealed ? 'Hide' : 'Reveal';
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const next = this.revealed
        ? `{{${this.rawText}}}`
        : `{{!${this.rawText}}}`;
      view.dispatch({ changes: { from: this.docFrom, to: this.docTo, insert: next } });
    });

    hdr.append(icon, lbl, btn);
    wrap.appendChild(hdr);

    // ── content (revealed only) ──────────────────────────────────────────────
    if (this.revealed && this.rawText) {
      const body = document.createElement('span');
      body.className = 'csw-body';
      body.textContent = this.rawText;
      wrap.appendChild(body);
    }

    // Clicking anywhere else on the widget puts cursor at secret start for editing
    wrap.addEventListener('mousedown', (e) => {
      if (e.target === btn) return;
      e.preventDefault();
      view.dispatch({ selection: { anchor: this.docFrom } });
      view.focus();
    });

    return wrap;
  }

  eq(o: SecretWidget) { return o.rawText === this.rawText && o.revealed === this.revealed; }
  ignoreEvent() { return false; }
}

function buildSecretDecos(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const cursorPos = view.state.selection.main.head;

  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    SECRET_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = SECRET_RE.exec(text)) !== null) {
      const absFrom = from + m.index;
      const absTo   = absFrom + m[0].length;
      const inner   = m[1];                       // may start with '!'
      const revealed = inner.startsWith('!');
      const rawText  = revealed ? inner.slice(1) : inner;

      if (cursorPos >= absFrom && cursorPos <= absTo) {
        // Cursor inside → show raw, highlighted
        builder.add(absFrom, absTo, Decoration.mark({ class: 'cm-d-secret' }));
      } else {
        // Cursor outside → render widget
        builder.add(
          absFrom,
          absTo,
          Decoration.replace({
            widget: new SecretWidget(rawText, revealed, absFrom, absTo),
            inclusive: false,
          }),
        );
      }
    }
  }
  return builder.finish();
}

const secretPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = buildSecretDecos(view); }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || u.selectionSet) {
        this.decorations = buildSecretDecos(u.view);
      }
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
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      fontSize: '14px',
    },
    '.cm-content': {
      padding: '24px 32px',
      color: '#f1f5f9',
      lineHeight: '1.8',
      caretColor: '#f1f5f9',
      minHeight: '100%',
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-line': { padding: '0' },
    '.cm-cursor': { borderLeftColor: '#e2e8f0', borderLeftWidth: '2px' },
    '&.cm-focused .cm-selectionBackground': { backgroundColor: '#1d4ed850' },
    '.cm-selectionBackground': { backgroundColor: '#1d4ed830' },
    '.cm-gutters': { display: 'none' },

    // ── Headings ──────────────────────────────────────────────────────────────
    '.cm-heading': {
      fontFamily: '"Iowan Old Style", Georgia, serif !important',
      color: '#bae6fd !important',
      fontWeight: 'bold !important',
    },
    '.cm-h1': { fontSize: '1.7em !important', borderBottom: '1px solid #334155', paddingBottom: '0.1em', display: 'block' },
    '.cm-h2': { fontSize: '1.35em !important' },
    '.cm-h3': { fontSize: '1.15em !important' },

    // ── Inline markdown ───────────────────────────────────────────────────────
    '.cm-syn-hidden':  { display: 'none' },
    '.cm-bold':        { fontWeight: '700' },
    '.cm-italic':      { fontStyle: 'italic' },
    '.cm-code-inline': {
      background: '#1e293b',
      padding: '0.05em 0.35em',
      borderRadius: '0.25em',
      fontFamily: 'ui-monospace, monospace',
      fontSize: '0.88em',
      color: '#e2e8f0',
    },

    // ── Lists & blockquotes ───────────────────────────────────────────────────
    '.cm-blockquote-line': {
      borderLeft: '3px solid #475569',
      paddingLeft: '0.75em',
      color: '#94a3b8',
      fontStyle: 'italic',
    },
    '.cm-bullet-widget': {
      color: '#94a3b8',
      userSelect: 'none',
    },

    // ── Decorator tokens ──────────────────────────────────────────────────────
    '.cm-d-loc':       { background: 'rgba(251,146,60,.18)',  color: '#fdba74', borderRadius: '0.25em', padding: '0.05em 0.25em' },
    '.cm-d-dep':       { background: 'rgba(244,63,94,.18)',   color: '#fda4af', borderRadius: '0.25em', padding: '0.05em 0.25em' },
    '.cm-d-milestone': { background: 'rgba(56,189,248,.18)',  color: '#7dd3fc', borderRadius: '0.25em', padding: '0.05em 0.25em' },
    '.cm-d-artifact':  { background: 'rgba(34,197,94,.18)',   color: '#86efac', borderRadius: '0.25em', padding: '0.05em 0.25em' },
    '.cm-d-comment':   { color: '#64748b', fontStyle: 'italic', background: 'rgba(100,116,139,.08)', borderRadius: '0.25em', padding: '0.05em 0.25em' },
    '.cm-d-secret':    { background: 'rgba(139,92,246,.10)', color: '#c4b5fd', borderBottom: '1.5px dashed rgba(167,139,250,.5)', borderRadius: '0.25em', padding: '0.05em 0.25em' },
    '.cm-d-link':      { color: '#7dd3fc', background: 'rgba(14,165,233,.10)', borderBottom: '1px dashed rgba(125,211,252,.4)', borderRadius: '0.25em', padding: '0.05em 0.25em', cursor: 'pointer' },
    '.cm-d-dice':      { color: '#a5b4fc', background: 'rgba(99,102,241,.15)', border: '1px solid rgba(129,140,248,.35)', borderRadius: '0.25em', padding: '0.05em 0.35em', cursor: 'pointer' },

    // ── Secret widget ─────────────────────────────────────────────────────────
    '.cm-secret-widget': {
      display: 'inline-flex',
      flexDirection: 'column',
      border: '1.5px dashed rgba(167,139,250,.45)',
      borderRadius: '0.4em',
      padding: '0.3em 0.6em 0.3em',
      margin: '0.15em 0',
      background: 'rgba(139,92,246,.06)',
      verticalAlign: 'middle',
      cursor: 'pointer',
      lineHeight: '1.5',
    },
    '.cm-secret-widget.csw-revealed': { borderColor: 'rgba(52,211,153,.38)', background: 'rgba(52,211,153,.04)' },
    '.cm-secret-widget.csw-locked':   { borderColor: 'rgba(100,116,139,.28)', background: 'rgba(100,116,139,.06)' },
    '.csw-header': {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.35em',
      fontSize: '0.72em',
      fontWeight: '600',
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      color: '#a78bfa',
    },
    '.csw-revealed .csw-header': { color: '#34d399' },
    '.csw-locked .csw-header':   { color: '#64748b' },
    '.csw-icon': { flexShrink: '0', fontSize: '1.1em' },
    '.csw-label': { flex: '1' },
    '.csw-btn': {
      background: 'rgba(139,92,246,.18)',
      border: '1px solid rgba(167,139,250,.28)',
      color: '#c4b5fd',
      padding: '0.05em 0.4em',
      borderRadius: '0.2em',
      cursor: 'pointer',
      fontSize: '0.9em',
      fontWeight: '500',
      letterSpacing: 'normal',
      textTransform: 'none',
    },
    '.csw-body': {
      display: 'block',
      fontSize: '0.92em',
      color: '#e2e8f0',
      marginTop: '0.25em',
      whiteSpace: 'pre-wrap',
      fontWeight: 'normal',
      fontStyle: 'normal',
      textTransform: 'none',
      letterSpacing: 'normal',
    },
  },
  { dark: true },
);

// ─── Auto-pair ────────────────────────────────────────────────────────────────
const autoPairExt = EditorView.inputHandler.of((view, from, to, text) => {
  const before = view.state.doc.sliceString(Math.max(0, from - 1), from);
  if (text === '{') {
    if ('@?!$'.includes(before)) {
      view.dispatch({ changes: { from, to, insert: '{}' }, selection: { anchor: from + 1 } });
      return true;
    }
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

// ─── Wiki suggestion state ────────────────────────────────────────────────────
type SuggestState = {
  results: WikiEntry[];
  cursor: number;
  openAt: number;
  x: number;
  y: number;
};

// ─── Props ────────────────────────────────────────────────────────────────────
type Props = {
  body: string;
  onChange: (v: string) => void;
  wikiIndex: WikiEntry[];
  onNavigate: (path: string) => void;
  rollFormula: (formula: string) => void;
  party: PartyMember[];
};

// ─── Abilities for party tooltip ─────────────────────────────────────────────
const PARTY_ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

type HoverTooltip = { member: PartyMember; rect: DOMRect };

// ─── Component ────────────────────────────────────────────────────────────────
export function LiveEditor({ body, onChange, wikiIndex, onNavigate, rollFormula, party }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef      = useRef<EditorView | null>(null);

  const onChangeRef  = useRef(onChange);  onChangeRef.current  = onChange;
  const wikiRef      = useRef(wikiIndex); wikiRef.current      = wikiIndex;
  const navRef       = useRef(onNavigate); navRef.current      = onNavigate;
  const rollRef      = useRef(rollFormula); rollRef.current    = rollFormula;
  const partyRef     = useRef(party);     partyRef.current     = party;

  const [suggest, setSuggest] = useState<SuggestState | null>(null);
  const suggestRef = useRef(suggest);
  suggestRef.current = suggest;

  const [hoverTooltip, setHoverTooltip] = useState<HoverTooltip | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const acceptSuggestion = useCallback((entry: WikiEntry) => {
    const view = viewRef.current;
    const s    = suggestRef.current;
    if (!view || !s) return;
    const pos = view.state.selection.main.head;
    view.dispatch({
      changes: { from: s.openAt, to: pos, insert: `[[${entry.name}]]` },
      selection: { anchor: s.openAt + entry.name.length + 4 },
    });
    setSuggest(null);
    view.focus();
  }, []);

  // Keyboard nav for wiki dropdown
  useEffect(() => {
    if (!suggest) return;
    const handler = (e: KeyboardEvent) => {
      const s = suggestRef.current;
      if (!s) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault(); e.stopPropagation();
        setSuggest({ ...s, cursor: (s.cursor + 1) % s.results.length });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault(); e.stopPropagation();
        setSuggest({ ...s, cursor: (s.cursor - 1 + s.results.length) % s.results.length });
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault(); e.stopPropagation();
        acceptSuggestion(s.results[s.cursor]);
      } else if (e.key === 'Escape') {
        e.preventDefault(); setSuggest(null);
      }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [suggest !== null, acceptSuggestion]); // eslint-disable-line react-hooks/exhaustive-deps

  // Click handler: dice roll + wiki navigate (secrets handled by widget)
  const clickExt = EditorView.domEventHandlers({
    mousedown(event, view) {
      const coords = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (coords === null) return false;
      const line = view.state.doc.lineAt(coords);
      const col  = coords - line.from;
      DECO_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = DECO_RE.exec(line.text)) !== null) {
        if (col < m.index || col > m.index + m[0].length) continue;
        const token = m[0];
        if (token.startsWith('$') && !token.startsWith('${') && token.endsWith('$')) {
          event.preventDefault();
          rollRef.current(token.slice(1, -1).trim());
          return true;
        }
        if (token.startsWith('[[') && token.endsWith(']]')) {
          event.preventDefault();
          const name = token.slice(2, -2);
          const hit  = wikiRef.current.find((e) => e.name === name);
          if (hit) navRef.current(hit.route);
          return true;
        }
      }
      return false;
    },
  });

  // Mount once
  useEffect(() => {
    if (!containerRef.current) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: body,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          drawSelection(),
          // Order matters: replace-decorations (secret/list) before mark-decorations
          secretPlugin,
          listPlugin,
          headingPlugin,
          boldPlugin,
          italicPlugin,
          codeInlinePlugin,
          markPlugin,
          clickExt,
          autoPairExt,
          noteTheme,
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (!update.docChanged && !update.selectionSet) return;
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
            // Wiki autocomplete
            const pos   = update.state.selection.main.head;
            const upto  = update.state.doc.sliceString(0, pos);
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
    requestAnimationFrame(() => view.focus());
    return () => { view.destroy(); viewRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external body (realtime, note switching handled by key={note.id})
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== body) {
      const { from } = view.state.selection.main;
      view.dispatch({
        changes: { from: 0, to: current.length, insert: body },
        selection: { anchor: Math.min(from, body.length) },
      });
    }
  }, [body]);

  return (
    <div
      className="relative h-full"
      style={{ minHeight: 0 }}
      onMouseOver={(e) => {
        const target = e.target as HTMLElement;
        const locEl = target.closest('.cm-d-loc') as HTMLElement | null;
        if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
        if (locEl) {
          const text = locEl.textContent?.trim() ?? '';
          const member = partyRef.current.find(
            (m) => m.name.trim().toLowerCase() === text.toLowerCase()
          );
          if (member) setHoverTooltip({ member, rect: locEl.getBoundingClientRect() });
        } else if (!target.closest('[data-party-tooltip]')) {
          hoverTimerRef.current = setTimeout(() => setHoverTooltip(null), 150);
        }
      }}
      onMouseOut={(e) => {
        const related = e.relatedTarget as HTMLElement | null;
        if (!related?.closest('.cm-d-loc') && !related?.closest('[data-party-tooltip]')) {
          if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
          hoverTimerRef.current = setTimeout(() => setHoverTooltip(null), 150);
        }
      }}
    >
      <div ref={containerRef} className="h-full" />

      {hoverTooltip && createPortal(
        (() => {
          const m = hoverTooltip.member;
          const rect = hoverTooltip.rect;
          const tooltipW = 264;
          const tooltipH = 190;
          const above = rect.bottom + tooltipH + 10 > window.innerHeight;
          const top  = above ? rect.top - tooltipH - 6 : rect.bottom + 6;
          const left = Math.max(8, Math.min(rect.left, window.innerWidth - tooltipW - 8));
          const hpPct = m.maxHp > 0 ? Math.min(100, (m.hp / m.maxHp) * 100) : 0;
          const hpColor = hpPct > 50 ? '#10b981' : hpPct > 25 ? '#38bdf8' : '#f87171';
          return (
            <div
              data-party-tooltip="true"
              className="party-tooltip"
              style={{ position: 'fixed', top, left, zIndex: 9999, width: tooltipW }}
              onMouseEnter={() => { if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; } }}
              onMouseLeave={() => { hoverTimerRef.current = setTimeout(() => setHoverTooltip(null), 150); }}
            >
              <div className="party-tooltip-name">{m.name}</div>
              <div className="party-tooltip-sub">
                {m.classSummary} · {m.race}
                {m.owner_user_id && <span className="party-tooltip-owned"> · Lv {m.level}</span>}
              </div>
              <div className="party-tooltip-stats">
                <span><Shield size={11} /> AC {m.ac}</span>
                <span><Heart size={11} className="text-rose-400" /> {m.hp}/{m.maxHp}</span>
                <span>Init {m.initiativeBonus >= 0 ? '+' : ''}{m.initiativeBonus}</span>
              </div>
              <div className="party-tooltip-hp-bar">
                <div style={{ width: `${hpPct}%`, background: hpColor }} />
              </div>
              <div className="party-tooltip-abilities">
                {PARTY_ABILITIES.map((a) => (
                  <div key={a} className="party-tooltip-ability">
                    <div className="party-tooltip-ability-label">{a.toUpperCase()}</div>
                    <div className="party-tooltip-ability-score">{m[a]}</div>
                    <div className="party-tooltip-ability-mod">{modifier(m[a])}</div>
                  </div>
                ))}
              </div>
              {(m.passivePerception || m.passiveInvestigation || m.passiveInsight) ? (
                <div className="party-tooltip-passives">
                  <span>Perc {m.passivePerception}</span>
                  <span>Inv {m.passiveInvestigation}</span>
                  <span>Ins {m.passiveInsight}</span>
                </div>
              ) : null}
            </div>
          );
        })(),
        document.body,
      )}

      {suggest && createPortal(
        <div
          style={{ position: 'fixed', left: suggest.x, top: suggest.y, zIndex: 50 }}
          className="w-64 bg-slate-900 border border-slate-700 rounded shadow-lg overflow-hidden"
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
            Wiki
          </div>
          {suggest.results.map((r, i) => (
            <div
              key={`${r.kind}-${r.id}`}
              onClick={() => acceptSuggestion(r)}
              className={`px-2 py-1 flex items-center justify-between cursor-pointer text-xs ${
                i === suggest.cursor ? 'bg-sky-900/50 text-sky-100' : 'hover:bg-slate-800 text-slate-300'
              }`}
            >
              <span className="truncate">{r.name}</span>
              <span className="text-[10px] text-slate-500 ml-2 shrink-0">{kindLabel(r.kind)}</span>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
