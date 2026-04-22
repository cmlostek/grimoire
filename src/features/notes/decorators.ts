import type { Root, Text, PhrasingContent, RootContent } from 'mdast';
import { findWiki, type WikiEntry } from './wikiIndex';

export const NEWLINE_PLACEHOLDER = '\uE000';
// Private-use codepoints to hide markdown syntax *inside* {{secrets}} from
// the remark parser so it can't split the block across multiple AST nodes.
const S_STAR  = '\uE001'; // *
const S_UNDER = '\uE002'; // _
const S_TICK  = '\uE003'; // `
const S_TILDE = '\uE004'; // ~

// Note: \$(?!\{) matches $ NOT followed by { so it doesn't swallow ${artifact}
const TOKEN =
  /(@\{[^}\n]+\}|\?\{[^}\n]+\}|!\{[^}\n]+\}|\$\{[^}\n]+\}|\$(?!\{)[^$\n]+\$|%%[^%\n]+?%%|\{\{[^}\n]+\}\}|\[\[[^\]\n]+\]\])/g;

const MULTILINE_TRANSFORMS: Array<[RegExp, string, string]> = [
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
  secretCounter: () => number
): PhrasingContent | null {
  if (raw.startsWith('@{') && raw.endsWith('}')) {
    return makeSpan('note-deco note-loc', restore(raw.slice(2, -1)));
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
  if (raw.startsWith('[[') && raw.endsWith(']]')) {
    const name = raw.slice(2, -2);
    const hit = findWiki(wiki, name);
    if (hit) return makeLink(hit.route, name, hit.kind);
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

function splitText(node: Text, wiki: WikiEntry[], secretCounter: () => number): PhrasingContent[] | null {
  const text = node.value;
  TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  const out: PhrasingContent[] = [];
  let last = 0;
  let found = false;
  while ((match = TOKEN.exec(text)) !== null) {
    const replacement = classify(match[0], wiki, secretCounter);
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

function walk(node: unknown, wiki: WikiEntry[], secretCounter: () => number): void {
  if (!node || typeof node !== 'object') return;
  const n = node as { type?: string; children?: unknown[] };
  if (!Array.isArray(n.children)) return;
  const parent = node as Parent;
  const next: Array<RootContent | PhrasingContent> = [];
  for (const child of parent.children) {
    const c = child as { type?: string };
    if (c?.type === 'text') {
      const replaced = splitText(child as Text, wiki, secretCounter);
      if (replaced) next.push(...(replaced as Array<RootContent | PhrasingContent>));
      else next.push(child);
    } else if (c?.type === 'code' || c?.type === 'inlineCode') {
      next.push(child);
    } else {
      walk(child, wiki, secretCounter);
      next.push(child);
    }
  }
  parent.children = next;
}

export function remarkNoteDecorators(wiki: WikiEntry[]) {
  return () => (tree: Root) => {
    let idx = 0;
    walk(tree, wiki, () => idx++);
  };
}
