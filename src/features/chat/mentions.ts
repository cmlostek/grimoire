import type { ChatMember } from './chatStore';
import type { CatalogKind } from './catalog';

/** Player mention: `@[Display Name](uuid)`. */
export const USER_MENTION_RE = /@\[([^\]]+)\]\(([0-9a-fA-F-]{36})\)/g;
/** Catalog reference: `#[Display Name](kind:identifier)`. */
export const HASH_TOKEN_RE = /#\[([^\]]+)\]\((note|npc|item|spell|srd-item|srd-spell):([^)]+)\)/g;
/** Combined matcher used by parseSegments. Order matters: try # first because
 *  the user token cannot contain `(kind:` so they're disjoint. */
const ANY_TOKEN_RE = /@\[([^\]]+)\]\(([0-9a-fA-F-]{36})\)|#\[([^\]]+)\]\((note|npc|item|spell|srd-item|srd-spell):([^)]+)\)/g;

export type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'mention'; userId: string; name: string }
  | { kind: 'ref'; refKind: CatalogKind; identifier: string; name: string };

/** Split a body into rendering segments (text + chips). */
export function parseSegments(body: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  ANY_TOKEN_RE.lastIndex = 0;
  for (const m of body.matchAll(ANY_TOKEN_RE)) {
    const start = m.index ?? 0;
    if (start > last) out.push({ kind: 'text', text: body.slice(last, start) });
    if (m[2]) {
      // @ token
      out.push({ kind: 'mention', name: m[1], userId: m[2] });
    } else {
      // # token
      out.push({ kind: 'ref', refKind: m[4] as CatalogKind, identifier: m[5], name: m[3] });
    }
    last = start + m[0].length;
  }
  if (last < body.length) out.push({ kind: 'text', text: body.slice(last) });
  return out;
}

/** Pull unique mentioned user ids (for the `mentions[]` DB column). */
export function extractMentionIds(body: string): string[] {
  const ids = new Set<string>();
  USER_MENTION_RE.lastIndex = 0;
  for (const m of body.matchAll(USER_MENTION_RE)) ids.add(m[2]);
  return [...ids];
}

/** Case-insensitive contains filter over campaign members, sorted by name. */
export function filterMembers(members: ChatMember[], query: string): ChatMember[] {
  const q = query.trim().toLowerCase();
  const matched = q
    ? members.filter((m) => m.displayName.toLowerCase().includes(q))
    : members;
  return [...matched].sort((a, b) => a.displayName.localeCompare(b.displayName));
}
