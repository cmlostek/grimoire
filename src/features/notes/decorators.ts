import type { Root, Text, PhrasingContent, RootContent } from 'mdast';
import { findWiki, extractHeading, type WikiEntry } from './wikiIndex';

/** Maps a (case-insensitive) player or NPC name to a colour to paint
 *  `@{Name}` mention decorations with — mirroring the colour the player
 *  picks in their dashboard / chat. */
export type MentionColors = Record<string, string>;

export const NEWLINE_PLACEHOLDER = '\uE000';
// Private-use codepoints to hide markdown syntax from the remark parser.
const S_STAR   = '\uE001'; // * inside {{secrets}}
const S_UNDER  = '\uE002'; // _ inside {{secrets}}
const S_TICK   = '\uE003'; // ` inside {{secrets}}
const S_TILDE  = '\uE004'; // ~ inside {{secrets}}
// [[wiki links]] — remark parses [label] as a link reference, splitting the
// token across AST nodes before our plugin can see it.  Escape the brackets.
const S_WOPEN  = '\uE005'; // [[
const S_WCLOSE = '\uE006'; // ]]
// :::left / :::center / :::right ... ::: alignment blocks - collapsed to a
// single-line sentinel run (like {{secrets}}) so remark keeps them as one
// text node instead of splitting on internal markdown/newlines.
const ALIGN_MARK     = '\uE007'; // open - followed by one align code char (L/C/R)
const ALIGN_MARK_END = '\uE008'; // close
const ALIGN_CODE: Record<string, string> = { left: 'L', center: 'C', right: 'R' };
const ALIGN_NAME: Record<string, string> = { L: 'left', C: 'center', R: 'right' };
const ALIGN_BLOCK_RE = /^:::(left|center|right)[ \t]*\n([\s\S]*?)\n:::[ \t]*$/gm;

// Note: \$(?!\{) matches $ NOT followed by { so it doesn't swallow ${artifact}
const TOKEN =
  /(&\{[^}\n]+\}|@\{[^}\n]+\}|\?\{[^}\n]+\}|!\{[^}\n]+\}|\$\{[^}\n]+\}|\$(?!\{)[^$\n]+\$|%%[^%\n]+?%%|\{\{[^}\n]+\}\}|\uE005[^\uE006\n]+\uE006|\uE007[LCR][\s\S]*?\uE008)/g;

const MULTILINE_TRANSFORMS: Array<[RegExp, string, string]> = [
  [/&\{([\s\S]*?)\}/g,  '&{', '}'],
  [/@\{([\s\S]*?)\}/g,  '@{', '}'],
  [/\?\{([\s\S]*?)\}/g, '?{', '}'],
  [/!\{([\s\S]*?)\}/g,  '!{', '}'],
  [/\$\{([\s\S]*?)\}/g, '${', '}'],
  [/%%([\s\S]*?)%%/g,   '%%', '%%'],
  // {{...}} handled separately below (needs extra markdown-char escaping)
];

export function preprocessDecorators(src: string): string {
  if (!src) return src;
  const segments: Array<{ code: boolean; text: string }> = [];
  const codeFence = /```[\s\S]*?```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = codeFence.exec(src)) !== null) {
    if (m.index > last) segments.push({ code: false, text: src.slice(last, m.index) });
    segments.push({ code: true, text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < src.length) segments.push({ code: false, text: src.slice(last) });

  return segments
    .map((s) => {
      if (s.code) return s.text;
      let t = s.text;
      // Alignment blocks: collapse to a single sentinel-wrapped run (newlines
      // and inline-markdown characters escaped, same treatment as {{secrets}}
      // below) so remark can't split the block across multiple AST nodes.
      t = t.replace(ALIGN_BLOCK_RE, (_m, align: string, inner: string) =>
        ALIGN_MARK + ALIGN_CODE[align] +
        inner
          .replace(/\n/g, NEWLINE_PLACEHOLDER)
          .replace(/\*/g,  S_STAR)
          .replace(/_/g,   S_UNDER)
          .replace(/`/g,   S_TICK)
          .replace(/~/g,   S_TILDE)
        + ALIGN_MARK_END
      );
      for (const [re, open, close] of MULTILINE_TRANSFORMS) {
        t = t.replace(re, (_, inner: string) =>
          open + inner.replace(/\n/g, NEWLINE_PLACEHOLDER) + close
        );
      }
      // Secrets: replace newlines AND inline-markdown characters so remark
      // doesn't parse **bold** / _italic_ / `code` inside the block and split
      // it across multiple AST text nodes before our plugin can match {{...}}.
      t = t.replace(/\{\{([\s\S]*?)\}\}/g, (_, inner: string) =>
        '{{' +
        inner
          .replace(/\n/g, NEWLINE_PLACEHOLDER)
          .replace(/\*/g,  S_STAR)
          .replace(/_/g,   S_UNDER)
          .replace(/`/g,   S_TICK)
          .replace(/~/g,   S_TILDE)
        + '}}'
      );
      // Wiki links: remark parses [label] as link references, splitting [[...]]
      // across multiple AST nodes before our plugin can see the full token.
      t = t.replace(/\[\[([^\]\n]+)\]\]/g, (_: string, inner: string) =>
        S_WOPEN + inner + S_WCLOSE
      );
      return t;
    })
    .join('');
}

function restore(text: string): string {
  return text
    .split(NEWLINE_PLACEHOLDER).join('\n')
    .replace(/\uE001/g, '*')
    .replace(/\uE002/g, '_')
    .replace(/\uE003/g, '`')
    .replace(/\uE004/g, '~');
}

type CustomSpan = {
  type: 'html';
  value: string;
  data: {
    hName: string;
    hProperties: Record<string, string>;
    hChildren: Array<{ type: 'text'; value: string }>;
  };
};

function makeSpan(
  className: string,
  text: string,
  extraProps: Record<string, string> = {}
): PhrasingContent {
  const node = {
    type: 'html' as const,
    value: '',
    data: {
      hName: 'span',
      hProperties: { className, ...extraProps },
      hChildren: [{ type: 'text' as const, value: text }],
    },
  } satisfies CustomSpan;
  return node as unknown as PhrasingContent;
}

function makeLink(
  href: string,
  text: string,
  kind: string
): PhrasingContent {
  return {
    type: 'html',
    value: '',
    data: {
      hName: 'a',
      hProperties: {
        href,
        className: 'note-link',
        'data-wiki': 'true',
        'data-wiki-kind': kind,
      },
      hChildren: [{ type: 'text', value: text }],
    },
  } as unknown as PhrasingContent;
}

function makeBrokenLink(text: string): PhrasingContent {
  return makeSpan('note-link note-link-broken', text, { 'data-wiki-broken': 'true' });
}

function classify(
  raw: string,
  wiki: WikiEntry[],
  secretCounter: () => number,
  mentionColors: MentionColors,
): PhrasingContent | null {
  if (raw.startsWith(ALIGN_MARK) && raw.endsWith(ALIGN_MARK_END)) {
    const align = ALIGN_NAME[raw[1]] ?? 'left';
    const content = restore(raw.slice(2, -1));
    return makeSpan('note-align', '', {
      'data-align-content': content,
      style: `display: block; text-align: ${align};`,
    });
  }
  if (raw.startsWith('&{') && raw.endsWith('}')) {
    const name = restore(raw.slice(2, -1));
    const hit = findWiki(wiki, name);
    if (hit) {
      return {
        type: 'html',
        value: '',
        data: {
          hName: 'span',
          hProperties: { className: 'note-deco note-loc note-loc-link', 'data-wiki-route': hit.route },
          hChildren: [{ type: 'text', value: name }],
        },
      } as unknown as PhrasingContent;
    }
    return makeSpan('note-deco note-loc', name);
  }
  if (raw.startsWith('@{') && raw.endsWith('}')) {
    const name = restore(raw.slice(2, -1));
    const color = mentionColors[name.trim().toLowerCase()];
    if (color) {
      // Inline style so each mention paints in its owner's chosen colour.
      const style =
        `color: ${color}; background: color-mix(in srgb, ${color} 22%, transparent);`;
      return makeSpan('note-deco note-player', name, { style });
    }
    return makeSpan('note-deco note-player', name);
  }
  if (raw.startsWith('?{') && raw.endsWith('}')) {
    return makeSpan('note-deco note-dep', restore(raw.slice(2, -1)));
  }
  if (raw.startsWith('!{') && raw.endsWith('}')) {
    return makeSpan('note-deco note-milestone', restore(raw.slice(2, -1)));
  }
  if (raw.startsWith('${') && raw.endsWith('}')) {
    return makeSpan('note-deco note-artifact', restore(raw.slice(2, -1)));
  }
  if (raw.startsWith('%%') && raw.endsWith('%%')) {
    return makeSpan('note-comment', restore(raw.slice(2, -2)));
  }
  if (raw.startsWith('{{') && raw.endsWith('}}')) {
    const inner = restore(raw.slice(2, -2));
    const revealed = inner.startsWith('!');
    const text = revealed ? inner.slice(1) : inner;
    const idx = String(secretCounter());
    // Pass the full restored content (may include markdown) via data attribute.
    // The span handler in Notes.tsx will render it with its own ReactMarkdown.
    return makeSpan('note-secret', '', {
      'data-secret': 'true',
      'data-secret-index': idx,
      'data-secret-revealed': String(revealed),
      'data-secret-content': text,
    });
  }
  if (raw.startsWith(S_WOPEN) && raw.endsWith(S_WCLOSE)) {
    const name = restore(raw.slice(1, -1));
    const hit = findWiki(wiki, name);
    if (hit) {
      // Append heading to the route as ?h=<slug> so the click handler can
      // scroll without re-parsing the link text.
      const heading = extractHeading(name);
      const href = heading
        ? hit.route + (hit.route.includes('?') ? '&' : '?') + 'h=' + encodeURIComponent(heading)
        : hit.route;
      return makeLink(href, name, hit.kind);
    }
    return makeBrokenLink(name);
  }
  // $1d20 + 8$ — inline dice roll chip ($ not followed by {)
  if (raw.startsWith('$') && raw.endsWith('$') && !raw.startsWith('${') && raw.length > 2) {
    const formula = raw.slice(1, -1).trim();
    if (/\dd\d/i.test(formula)) {
      return makeSpan('note-dice', formula, { 'data-dice-formula': formula });
    }
  }
  return null;
}

function splitText(
  node: Text,
  wiki: WikiEntry[],
  secretCounter: () => number,
  mentionColors: MentionColors,
): PhrasingContent[] | null {
  const text = node.value;
  TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  const out: PhrasingContent[] = [];
  let last = 0;
  let found = false;
  while ((match = TOKEN.exec(text)) !== null) {
    const replacement = classify(match[0], wiki, secretCounter, mentionColors);
    if (!replacement) continue;
    found = true;
    if (match.index > last) {
      out.push({ type: 'text', value: text.slice(last, match.index) } as Text);
    }
    out.push(replacement);
    last = match.index + match[0].length;
  }
  if (!found) return null;
  if (last < text.length) {
    out.push({ type: 'text', value: text.slice(last) } as Text);
  }
  return out;
}

type Parent = { children: Array<RootContent | PhrasingContent> };

function walk(
  node: unknown,
  wiki: WikiEntry[],
  secretCounter: () => number,
  mentionColors: MentionColors,
): void {
  if (!node || typeof node !== 'object') return;
  const n = node as { type?: string; children?: unknown[] };
  if (!Array.isArray(n.children)) return;
  const parent = node as Parent;
  const next: Array<RootContent | PhrasingContent> = [];
  for (const child of parent.children) {
    const c = child as { type?: string };
    if (c?.type === 'text') {
      const replaced = splitText(child as Text, wiki, secretCounter, mentionColors);
      if (replaced) next.push(...(replaced as Array<RootContent | PhrasingContent>));
      else next.push(child);
    } else if (c?.type === 'code' || c?.type === 'inlineCode') {
      next.push(child);
    } else {
      walk(child, wiki, secretCounter, mentionColors);
      next.push(child);
    }
  }
  parent.children = next;
}

export function remarkNoteDecorators(wiki: WikiEntry[], mentionColors: MentionColors = {}) {
  return () => (tree: Root) => {
    let idx = 0;
    walk(tree, wiki, () => idx++, mentionColors);
  };
}

// ─── Collapsible headings & nested lists (read-only view) ────────────────────
// Tags each heading and each nested-list-bearing list item with a stable
// `data-fold-id`, and wraps the block(s) following a heading — up to the next
// heading of the same or shallower level — in a synthetic container so the
// read view can hide/show them. Only root-level headings are handled: notes
// don't nest headings inside blockquotes/lists.
type FoldableNode = { type: string; depth?: number; data?: Record<string, unknown>; children?: unknown[] };

function tagFoldable(node: FoldableNode, foldId: string): void {
  const existing = (node.data?.hProperties as Record<string, unknown>) ?? {};
  node.data = { ...(node.data ?? {}), hProperties: { ...existing, 'data-fold-id': foldId } };
}

function wrapHeadingSections(tree: Root, next: () => number): void {
  const children = tree.children as unknown as FoldableNode[];
  const out: FoldableNode[] = [];
  let i = 0;
  while (i < children.length) {
    const node = children[i];
    if (node.type === 'heading' && typeof node.depth === 'number') {
      const level = node.depth;
      tagFoldable(node, `h-${next()}`);
      const foldId = (node.data!.hProperties as Record<string, unknown>)['data-fold-id'] as string;
      out.push(node);
      i++;
      const section: FoldableNode[] = [];
      while (i < children.length) {
        const peek = children[i];
        if (peek.type === 'heading' && typeof peek.depth === 'number' && peek.depth <= level) break;
        section.push(peek);
        i++;
      }
      if (section.length) {
        out.push({
          type: 'noteFoldSection',
          children: section as unknown[],
          data: {
            hName: 'div',
            hProperties: { className: 'note-fold-section', 'data-fold-for': foldId },
          },
        });
      }
      continue;
    }
    out.push(node);
    i++;
  }
  tree.children = out as unknown as Root['children'];
}

function markFoldableListItems(node: unknown, next: () => number): void {
  if (!node || typeof node !== 'object') return;
  const n = node as FoldableNode;
  if (!Array.isArray(n.children)) return;
  if (n.type === 'listItem' && n.children.some((c) => (c as { type?: string })?.type === 'list')) {
    tagFoldable(n, `li-${next()}`);
  }
  for (const child of n.children) markFoldableListItems(child, next);
}

export function remarkFoldMarks() {
  return () => (tree: Root) => {
    let hIdx = 0;
    let liIdx = 0;
    wrapHeadingSections(tree, () => hIdx++);
    markFoldableListItems(tree, () => liIdx++);
  };
}
