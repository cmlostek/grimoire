/**
 * Live-preview note editor — Obsidian-style.
 *
 * - Inline markdown rendered as you type: **bold**, *italic*, `code`, bullets, blockquotes
 * - Cursor line shows raw syntax; all other lines show rendered output
 * - {{secrets}} show as interactive widgets when cursor is outside them
 * - Decorator tokens highlighted in colour
 * - Click $dice$ to roll, click [[wiki]] to navigate, [[...]] autocomplete
 * - Yjs CRDT collaborative editing with live cursors via Supabase Realtime
 */
import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
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
  indentWithTab,
} from '@codemirror/commands';
import * as Y from 'yjs';
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next';
import {
  SupabaseCollabProvider,
  userCollabColor,
  toBase64,
  fromBase64,
  type CollabUser,
  type Collaborator,
} from './collabProvider';
import { searchWiki, kindLabel, type WikiEntry } from './wikiIndex';
import { autocorrectExtension } from './autocorrect';
import { modifier } from '../../data/srd';
import type { PartyMember } from '../party/partyStore';
import { Shield, Heart } from 'lucide-react';

// ─── Decorator token regex (secrets excluded — handled by secretPlugin) ───────
const DECO_RE =
  /(&\{[^}\n]+\}|@\{[^}\n]+\}|\?\{[^}\n]+\}|!\{[^}\n]+\}|\$\{[^}\n]+\}|\$(?!\{)[^$\n]+\$|%%[^%\n]+?%%|\[\[[^\]\n]+\]\])/g;

const SECRET_RE = /\{\{(!?[^}\n]*?)\}\}/g;

function tokenClass(token: string): string | null {
  if (token.startsWith('&{'))  return 'cm-d-loc';
  if (token.startsWith('@{'))  return 'cm-d-player';
  if (token.startsWith('?{'))  return 'cm-d-dep';
  if (token.startsWith('!{'))  return 'cm-d-milestone';
  if (token.startsWith('${'))  return 'cm-d-artifact';
  if (token.startsWith('%%'))  return 'cm-d-comment';
  if (token.startsWith('[['))  return 'cm-d-link';
  if (token.startsWith('$'))   return 'cm-d-dice';
  return null;
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

// ─── Heading line decorations ─────────────────────────────────────────────────
const H_RE = /^(#{1,3}) /;

function buildHeadingDecos(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const m = H_RE.exec(line.text);
      if (m) builder.add(line.from, line.from, Decoration.line({ class: `cm-heading cm-h${m[1].length}` }));
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
const BOLD_RE     = /\*\*([^*\n]+?)\*\*/g;
const ITALIC_RE   = /(?<!\*)\*(?!\*)([^*\n]+?)(?<!\*)\*(?!\*)/g;
const CODE_INL_RE = /`([^`\n]+?)`/g;

function buildInlineDecos(view: EditorView, re: RegExp, markerLen: number, cls: string): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const abs = from + m.index;
      const absEnd = abs + m[0].length;
      const inner = abs + markerLen;
      const innerEnd = absEnd - markerLen;
      if (inner <= innerEnd) builder.add(inner, innerEnd, Decoration.mark({ class: cls }));
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

// ─── Strikethrough & highlight ───────────────────────────────────────────────
const STRIKE_RE    = /~~([^~\n]+?)~~/g;
const HIGHLIGHT_RE = /==([^=\n]+?)==/g;

const strikethroughPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = buildInlineDecos(view, STRIKE_RE, 2, 'cm-strikethrough'); }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || u.selectionSet)
        this.decorations = buildInlineDecos(u.view, STRIKE_RE, 2, 'cm-strikethrough');
    }
  },
  { decorations: (v) => v.decorations },
);

const highlightPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = buildInlineDecos(view, HIGHLIGHT_RE, 2, 'cm-highlight'); }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || u.selectionSet)
        this.decorations = buildInlineDecos(u.view, HIGHLIGHT_RE, 2, 'cm-highlight');
    }
  },
  { decorations: (v) => v.decorations },
);

// ─── Inline image preview ────────────────────────────────────────────────────
// Replaces ![alt](url) with a thumbnail widget when the cursor is outside it.
const IMAGE_RE = /\[([^\]\n]*)\]\(([^)\n]+)\)/g;

class ImageWidget extends WidgetType {
  constructor(readonly src: string, readonly alt: string) { super(); }
  toDOM(): HTMLElement {
    const img = document.createElement('img');
    img.src = this.src;
    img.alt = this.alt || 'image';
    Object.assign(img.style, {
      maxWidth: '320px', maxHeight: '180px',
      verticalAlign: 'middle', borderRadius: '6px',
      margin: '2px 4px', display: 'inline-block',
      cursor: 'default',
    });
    return img;
  }
  eq(o: ImageWidget) { return o.src === this.src && o.alt === this.alt; }
  ignoreEvent() { return true; }
}

function buildImageDecos(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const cursorPos = view.state.selection.main.head;
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    IMAGE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = IMAGE_RE.exec(text)) !== null) {
      const absFrom = from + m.index;
      const absTo   = absFrom + m[0].length;
      if (cursorPos >= absFrom && cursorPos <= absTo) continue; // show raw while editing
      builder.add(absFrom, absTo, Decoration.replace({
        widget: new ImageWidget(m[2], m[1]),
        inclusive: false,
      }));
    }
  }
  return builder.finish();
}

const imagePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = buildImageDecos(view); }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || u.selectionSet)
        this.decorations = buildImageDecos(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);

// ─── Blockquotes ─────────────────────────────────────────────────────────────
const BLOCKQUOTE_RE = /^(\s*)> /;

function buildListDecos(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      if (BLOCKQUOTE_RE.test(line.text))
        builder.add(line.from, line.from, Decoration.line({ class: 'cm-blockquote-line' }));
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
// Editor surface colors come from CSS variables so they swap with the
// app-wide dark/light mode (see :root + html.light in index.css). The
// fallback values match the original dark theme so nothing breaks if a
// consumer mounts the editor without the theme variables defined.
const noteTheme = EditorView.theme(
  {
    '&': { height: '100%', backgroundColor: 'var(--editor-bg, #020617)' },
    '.cm-scroller': {
      overflow: 'auto',
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      fontSize: '14px',
    },
    '.cm-content': {
      padding: '24px 32px',
      color: 'var(--editor-fg, #f1f5f9)',
      lineHeight: '1.8',
      caretColor: 'var(--editor-fg, #f1f5f9)',
      minHeight: '100%',
    },
    '&.cm-focused': { outline: 'none' },
    '.cm-line': { padding: '0' },
    '.cm-cursor': { borderLeftColor: 'var(--editor-fg, #e2e8f0)', borderLeftWidth: '2px' },
    '&.cm-focused .cm-selectionBackground': { backgroundColor: '#1d4ed850' },
    '.cm-selectionBackground': { backgroundColor: '#1d4ed830' },
    '.cm-gutters': { display: 'none' },

    // ── Headings ──────────────────────────────────────────────────────────────
    '.cm-heading': {
      fontFamily: '"Iowan Old Style", Georgia, serif !important',
      color: 'var(--editor-heading, #bae6fd) !important',
      fontWeight: 'bold !important',
    },
    '.cm-h1': { fontSize: '1.7em !important', borderBottom: '1px solid #334155', paddingBottom: '0.1em', display: 'block' },
    '.cm-h2': { fontSize: '1.35em !important' },
    '.cm-h3': { fontSize: '1.15em !important' },

    // ── Inline markdown ───────────────────────────────────────────────────────
    '.cm-bold':        { fontWeight: '700' },
    '.cm-italic':      { fontStyle: 'italic' },
    '.cm-code-inline': {
      background: 'var(--editor-code-bg, #1e293b)',
      padding: '0.05em 0.35em',
      borderRadius: '0.25em',
      fontFamily: 'ui-monospace, monospace',
      fontSize: '0.88em',
      color: 'var(--editor-code-fg, #e2e8f0)',
    },

    // ── Lists & blockquotes ───────────────────────────────────────────────────
    '.cm-blockquote-line': {
      borderLeft: '3px solid #475569',
      paddingLeft: '0.75em',
      color: '#94a3b8',
      fontStyle: 'italic',
    },

    // ── Strikethrough / highlight ─────────────────────────────────────────────
    '.cm-strikethrough': { textDecoration: 'line-through', color: '#94a3b8' },
    '.cm-highlight':     { background: 'rgba(250,204,21,.22)', borderRadius: '0.15em', padding: '0.05em 0.2em' },

    // ── Decorator tokens ──────────────────────────────────────────────────────
    '.cm-d-loc':       { background: 'rgba(251,146,60,.18)',  color: '#fdba74', borderRadius: '0.25em', padding: '0.05em 0.25em', cursor: 'pointer' },
    '.cm-d-player':    { background: 'rgba(34,197,94,.18)',   color: 'var(--deco-player-fg, #86efac)', borderRadius: '0.25em', padding: '0.05em 0.25em' },
    '.cm-d-dep':       { background: 'rgba(244,63,94,.18)',   color: '#fda4af', borderRadius: '0.25em', padding: '0.05em 0.25em' },
    '.cm-d-milestone': { background: 'rgba(56,189,248,.18)',  color: '#7dd3fc', borderRadius: '0.25em', padding: '0.05em 0.25em' },
    '.cm-d-artifact':  { background: 'rgba(236,72,153,.18)',  color: 'var(--deco-artifact-fg, #f9a8d4)', borderRadius: '0.25em', padding: '0.05em 0.25em' },
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

    // ── Remote cursors (y-codemirror.next) ───────────────────────────────────
    '.cm-ySelectionInfo': {
      position: 'absolute',
      top: '-1.4em',
      left: '-1px',
      fontSize: '10px',
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      fontWeight: '600',
      fontStyle: 'normal',
      lineHeight: '1.2',
      userSelect: 'none',
      color: '#fff',
      padding: '0.1em 0.45em',
      borderRadius: '0.3em',
      whiteSpace: 'nowrap',
      zIndex: '100',
      pointerEvents: 'none',
      opacity: '0',
      transition: 'opacity 0.15s',
    },
    '.cm-ySelectionInfoVisible, .cm-ySelectionCaret:hover > .cm-ySelectionInfo': {
      opacity: '1',
    },
    '.cm-ySelectionCaret': {
      position: 'relative',
      borderLeft: '2px solid',
      borderRight: 'none',
      marginLeft: '-1px',
      boxSizing: 'border-box',
    },
  },
  { dark: true },
);

// ─── Autocomplete suggestion state ───────────────────────────────────────────
type SuggestEntry = { label: string; sub?: string };
/** trigger: the opening sequence, e.g. '[[', '@{', '&{', '$' */
type SuggestState = {
  trigger: string;
  results: SuggestEntry[];
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
  // Collab
  noteId: string;
  ydocState: string | null;
  userId: string;
  userName: string;
  /** Fires whenever the set of remote collaborators changes (excludes self). */
  onCollaboratorsChange?: (c: Collaborator[]) => void;
};

// ─── Abilities for party tooltip ─────────────────────────────────────────────
const PARTY_ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

type HoverTooltip = { member: PartyMember; rect: DOMRect };

// ─── Exposed handle (for parent to read Yjs state on save / trigger formatting) ─
export type FormatCmd =
  | { kind: 'wrap'; before: string; after: string }   // wraps selection (or inserts markers)
  | { kind: 'line-prefix'; prefix: string }            // toggles a line prefix, e.g. "# "
  | { kind: 'insert'; text: string };                  // inserts text at cursor

export type LiveEditorHandle = {
  getYdocState: () => string | null;
  format: (cmd: FormatCmd) => void;
};

export type { Collaborator };

// ─── Component ────────────────────────────────────────────────────────────────
export const LiveEditor = forwardRef<LiveEditorHandle, Props>(function LiveEditor(
  { body, onChange, wikiIndex, onNavigate, rollFormula, party, noteId, ydocState, userId, userName, onCollaboratorsChange },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef      = useRef<EditorView | null>(null);
  const ydocRef      = useRef<Y.Doc | null>(null);

  const onChangeRef             = useRef(onChange);           onChangeRef.current             = onChange;
  const wikiRef                 = useRef(wikiIndex);          wikiRef.current                 = wikiIndex;
  const navRef                  = useRef(onNavigate);         navRef.current                  = onNavigate;
  const rollRef                 = useRef(rollFormula);        rollRef.current                 = rollFormula;
  const partyRef                = useRef(party);              partyRef.current                = party;
  const onCollaboratorsChangeRef = useRef(onCollaboratorsChange); onCollaboratorsChangeRef.current = onCollaboratorsChange;

  const [suggest, setSuggest] = useState<SuggestState | null>(null);
  const suggestRef = useRef(suggest);
  suggestRef.current = suggest;

  const [hoverTooltip, setHoverTooltip] = useState<HoverTooltip | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Expose a way for the parent (Notes.tsx) to read the Yjs state on save
  // and to trigger formatting commands from the toolbar.
  useImperativeHandle(ref, () => ({
    getYdocState() {
      if (!ydocRef.current) return null;
      return toBase64(Y.encodeStateAsUpdate(ydocRef.current));
    },
    format(cmd: FormatCmd) {
      const view = viewRef.current;
      if (!view) return;

      if (cmd.kind === 'wrap') {
        const { from, to } = view.state.selection.main;
        const selected = view.state.doc.sliceString(from, to);
        if (selected) {
          view.dispatch({
            changes: { from, to, insert: cmd.before + selected + cmd.after },
            selection: { anchor: from + cmd.before.length, head: from + cmd.before.length + selected.length },
          });
        } else {
          // No selection: insert markers and place cursor between them
          view.dispatch({
            changes: { from, insert: cmd.before + cmd.after },
            selection: { anchor: from + cmd.before.length },
          });
        }
        view.focus();

      } else if (cmd.kind === 'line-prefix') {
        const { from } = view.state.selection.main;
        const line = view.state.doc.lineAt(from);
        const existing = /^(#{1,3} )/.exec(line.text);
        if (existing && existing[1] === cmd.prefix) {
          // Toggle off: remove prefix
          view.dispatch({ changes: { from: line.from, to: line.from + cmd.prefix.length, insert: '' } });
        } else {
          // Strip any existing heading prefix, then add the new one
          const stripped = line.text.replace(/^#{1,3} /, '');
          view.dispatch({ changes: { from: line.from, to: line.to, insert: cmd.prefix + stripped } });
        }
        view.focus();

      } else if (cmd.kind === 'insert') {
        const { from } = view.state.selection.main;
        view.dispatch({
          changes: { from, insert: cmd.text },
          selection: { anchor: from + cmd.text.length },
        });
        view.focus();
      }
    },
  }));

  const acceptSuggestion = useCallback((entry: SuggestEntry) => {
    const view = viewRef.current;
    const s    = suggestRef.current;
    if (!view || !s) return;
    const pos = view.state.selection.main.head;
    let insert: string;
    if      (s.trigger === '[[') insert = `[[${entry.label}]]`;
    else if (s.trigger === '@{') insert = `@{${entry.label}}`;
    else if (s.trigger === '&{') insert = `&{${entry.label}}`;
    else if (s.trigger === '$')  insert = `$${entry.label}$`;
    else                          insert = entry.label;
    view.dispatch({
      changes:   { from: s.openAt, to: pos, insert },
      selection: { anchor: s.openAt + insert.length },
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
      // I broke it, so I'm fixing it
      const coords = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (coords === null) return false;
      const line = view.state.doc.lineAt(coords);
      const col  = coords - line.from;
      DECO_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = DECO_RE.exec(line.text)) !== null) {
        // Strict bounds: col must be inside [m.index, m.index + length)
        if (col < m.index || col >= m.index + m[0].length) continue;
        const token = m[0];
        if (token.startsWith('$') && !token.startsWith('${') && token.endsWith('$')) {
          event.preventDefault();
          rollRef.current(token.slice(1, -1).trim());
          return true;
        }
        if (token.startsWith('[[') && token.endsWith(']]')) {
          const name = token.slice(2, -2);
          const hit  = wikiRef.current.find((e) => e.name === name);
          if (hit) { event.preventDefault(); navRef.current(hit.route); return true; }
          return false; // unresolved link — let cursor place normally
        }
        if (token.startsWith('&{') && token.endsWith('}')) {
          const name = token.slice(2, -1).trim();
          const hit  = wikiRef.current.find((e) => e.name === name);
          if (hit) { event.preventDefault(); navRef.current(hit.route); return true; }
          return false; // no match — let cursor place normally
        }
      }
      return false;
    },
  });

  const [collabReady, setCollabReady] = useState(!!ydocState);

  // Mount once per note (key={note.id} ensures remount on note switch).
  useEffect(() => {
    if (!containerRef.current) return;

    // ── Yjs document setup ───────────────────────────────────────────────────
    const ydoc = new Y.Doc();
    const ytext = ydoc.getText('note');
    ydocRef.current = ydoc;

    // Determine if we need the first-client-wins protocol.
    // When ydocState exists every client starts from the same vector clock → no
    // duplication possible on sync. When it's absent we must wait for a peer
    // response before inserting body text, otherwise two clients independently
    // inserting the same text creates CRDT duplicates when their docs merge.
    const needsFallback = !ydocState && !!body;

    if (ydocState) {
      // Restore persisted Yjs state — all clients share the same vector clock.
      Y.applyUpdate(ydoc, fromBase64(ydocState));
    }
    // If no ydocState: Y.Text starts empty. The provider will insert `body`
    // after 350ms if no peer responds (first-client-wins).

    // ── Collab provider (Supabase broadcast) ─────────────────────────────────
    const { color, colorLight } = userCollabColor(userId);
    const provider = new SupabaseCollabProvider(
      ydoc,
      noteId,
      { name: userName || 'Anonymous', color, colorLight, userId },
      {
        fallbackBody: needsFallback ? body : undefined,
        onReady: () => setCollabReady(true),
      },
    );

    // Notify parent whenever the set of remote collaborators changes.
    // Deduplicate by userId so a user with multiple tabs only appears once.
    const emitCollaborators = () => {
      const states = provider.awareness.getStates();
      const seen = new Set<string>();
      const list: Collaborator[] = [];
      states.forEach((state, clientId) => {
        // Skip this client's own session.
        if (clientId === ydoc.clientID) return;
        const u = (state as { user?: CollabUser }).user;
        if (!u) return;
        // Skip stale awareness entries from our own user (e.g. after a page
        // refresh or switching notes — the old clientID is no longer `ydoc.clientID`
        // but it still carries our userId until the 30-second awareness timeout).
        if (u.userId && u.userId === userId) return;
        // Use userId if present, otherwise fall back to color (deterministic
        // from userId via userCollabColor, so reliable as a dedup key).
        const key = u.userId ?? u.color;
        if (seen.has(key)) return;
        seen.add(key);
        list.push({ clientId, name: u.name, color: u.color });
      });
      onCollaboratorsChangeRef.current?.(list);
    };
    provider.awareness.on('change', emitCollaborators);

    const undoManager = new Y.UndoManager(ytext);

    // ── CodeMirror view ───────────────────────────────────────────────────────
    const view = new EditorView({
      state: EditorState.create({
        // Start from whatever Y.Text currently contains. If ydocState was
        // loaded this is the full saved content; if awaiting a peer or
        // fallback this is empty (yCollab will update the view once content
        // arrives via applyUpdate / ytext.insert).
        doc: ytext.toString(),
        extensions: [
          // Yjs binding — must be first so it captures all transactions.
          yCollab(ytext, provider.awareness, { undoManager }),
          // Use Yjs-aware undo keymap (undoes only local changes, not remote).
          keymap.of([
            ...yUndoManagerKeymap,
            ...defaultKeymap,
            indentWithTab,
            // ── Formatting shortcuts ─────────────────────────────────────────
            {
              key: 'Mod-b',
              run(view) {
                const { from, to } = view.state.selection.main;
                const sel = view.state.doc.sliceString(from, to);
                if (sel) {
                  view.dispatch({ changes: { from, to, insert: `**${sel}**` }, selection: { anchor: from + 2, head: from + 2 + sel.length } });
                } else {
                  view.dispatch({ changes: { from, insert: '****' }, selection: { anchor: from + 2 } });
                }
                return true;
              },
            },
            {
              key: 'Mod-i',
              run(view) {
                const { from, to } = view.state.selection.main;
                const sel = view.state.doc.sliceString(from, to);
                if (sel) {
                  view.dispatch({ changes: { from, to, insert: `*${sel}*` }, selection: { anchor: from + 1, head: from + 1 + sel.length } });
                } else {
                  view.dispatch({ changes: { from, insert: '**' }, selection: { anchor: from + 1 } });
                }
                return true;
              },
            },
          ]),
          drawSelection(),
          // Order matters: replace-decorations (secret/list) before mark-decorations.
          secretPlugin,
          listPlugin,
          headingPlugin,
          boldPlugin,
          italicPlugin,
          codeInlinePlugin,
          strikethroughPlugin,
          highlightPlugin,
          imagePlugin,
          autocorrectExtension(),
          markPlugin,
          clickExt,
          noteTheme,
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (!update.docChanged && !update.selectionSet) return;
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }

            const pos  = update.state.selection.main.head;
            const upto = update.state.doc.sliceString(0, pos);

            // ── Try each autocomplete trigger in priority order ────────────────
            type Candidate = { trigger: string; openAt: number; results: SuggestEntry[] };
            let candidate: Candidate | null = null;

            // [[ wiki link
            if (!candidate) {
              const at = upto.lastIndexOf('[[');
              if (at !== -1) {
                const frag = upto.slice(at + 2);
                if (!frag.includes(']]') && !frag.includes('\n')) {
                  const hits = searchWiki(wikiRef.current, frag, 6)
                    .map((e) => ({ label: e.name, sub: kindLabel(e.kind) }));
                  if (hits.length) candidate = { trigger: '[[', openAt: at, results: hits };
                }
              }
            }

            // @{ party member
            if (!candidate) {
              const at = upto.lastIndexOf('@{');
              if (at !== -1) {
                const frag = upto.slice(at + 2);
                if (!frag.includes('}') && !frag.includes('\n')) {
                  const fl = frag.toLowerCase();
                  const hits = partyRef.current
                    .filter((m) => m.name.toLowerCase().includes(fl))
                    .slice(0, 6)
                    .map((m) => ({ label: m.name, sub: m.classSummary }));
                  if (hits.length) candidate = { trigger: '@{', openAt: at, results: hits };
                }
              }
            }

            // &{ location — no autocomplete: location names aren't in the wiki index
            // (only spells/items are), so offering suggestions here would populate
            // with spells. Users type location names manually.
            // Will add locations later if and/or when it is added to the index

            // $ dice expression
            if (!candidate) {
              const at = upto.lastIndexOf('$');
              if (at !== -1 && upto[at + 1] !== '{') {
                const frag = upto.slice(at + 1);
                if (!frag.includes('$') && !frag.includes('\n')) {
                  const DICE: SuggestEntry[] = [
                    { label: '1d4',    sub: 'damage' },
                    { label: '1d6',    sub: 'damage' },
                    { label: '1d8',    sub: 'weapon' },
                    { label: '1d10',   sub: 'weapon' },
                    { label: '1d12',   sub: 'great weapon' },
                    { label: '1d20',   sub: 'check / save' },
                    { label: '2d6',    sub: 'area damage' },
                    { label: '4d6kh3', sub: 'stat roll' },
                    { label: '1d100',  sub: 'percentile' },
                  ];
                  const fl = frag.toLowerCase();
                  const hits = DICE.filter((d) => !fl || d.label.startsWith(fl));
                  if (hits.length) candidate = { trigger: '$', openAt: at, results: hits };
                }
              }
            }

            if (candidate) {
              const coords = update.view.coordsAtPos(pos);
              if (coords) {
                const c = candidate;
                setSuggest((prev) => ({
                  trigger:  c.trigger,
                  results:  c.results,
                  cursor:   prev?.openAt === c.openAt ? prev.cursor : 0,
                  openAt:   c.openAt,
                  x: coords.left,
                  y: coords.bottom + 4,
                }));
                return;
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

    return () => {
      provider.destroy();
      view.destroy();
      viewRef.current = null;
      ydocRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="relative h-full"
      style={{ minHeight: 0 }}
      onMouseOver={(e) => {
        const target = e.target as HTMLElement;
        const locEl = target.closest('.cm-d-player') as HTMLElement | null;
        if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
        if (locEl) {
          const raw = locEl.textContent?.trim() ?? '';
          const inner = raw.startsWith('@{') && raw.endsWith('}')
            ? raw.slice(2, -1).trim()
            : raw;
          const member = partyRef.current.find(
            (m) => m.name.trim().toLowerCase() === inner.toLowerCase()
          );
          if (member) setHoverTooltip({ member, rect: locEl.getBoundingClientRect() });
        } else if (!target.closest('[data-party-tooltip]')) {
          hoverTimerRef.current = setTimeout(() => setHoverTooltip(null), 150);
        }
      }}
      onMouseOut={(e) => {
        const related = e.relatedTarget as HTMLElement | null;
        if (!related?.closest('.cm-d-player') && !related?.closest('[data-party-tooltip]')) {
          if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
          hoverTimerRef.current = setTimeout(() => setHoverTooltip(null), 150);
        }
      }}
    >
      <div ref={containerRef} className="h-full" />

      {/* Loading veil shown only while waiting for first-client-wins peer timeout
          (≤350 ms, only for unsaved legacy notes without a ydoc_state). */}
      {!collabReady && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ background: 'var(--editor-bg, #020617)', zIndex: 10 }}
        >
          <span className="text-xs text-slate-500 animate-pulse">Connecting…</span>
        </div>
      )}

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
            {suggest.trigger === '[[' ? 'Wiki Link' : suggest.trigger === '@{' ? 'Party Member' : suggest.trigger === '&{' ? 'Location' : 'Dice'}
          </div>
          {suggest.results.map((r, i) => (
            <div
              key={`${i}-${r.label}`}
              onClick={() => acceptSuggestion(r)}
              className={`px-2 py-1 flex items-center justify-between cursor-pointer text-xs ${
                i === suggest.cursor ? 'bg-sky-900/50 text-sky-100' : 'hover:bg-slate-800 text-slate-300'
              }`}
            >
              <span className="truncate">{r.label}</span>
              {r.sub && <span className="text-[10px] text-slate-500 ml-2 shrink-0">{r.sub}</span>}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
});
