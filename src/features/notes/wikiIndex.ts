import { SPELLS, EQUIPMENT, MAGIC_ITEMS } from '../../data/srd';
import type { HomebrewItem, HomebrewSpell } from '../../store';

export type WikiKind = 'spell' | 'equipment' | 'magic' | 'custom-item' | 'custom-spell';

export type WikiEntry = {
  name: string;
  kind: WikiKind;
  id: string;
  route: string;
};

export function buildWikiIndex(
  customItems: HomebrewItem[],
  customSpells: HomebrewSpell[]
): WikiEntry[] {
  const out: WikiEntry[] = [];
  for (const s of SPELLS) {
    out.push({ name: s.name, kind: 'spell', id: s.index, route: `/spells#${s.index}` });
  }
  for (const e of EQUIPMENT) {
    out.push({ name: e.name, kind: 'equipment', id: e.index, route: `/items#${e.index}` });
  }
  for (const m of MAGIC_ITEMS) {
    out.push({ name: m.name, kind: 'magic', id: m.index, route: `/items#${m.index}` });
  }
  for (const i of customItems) {
    out.push({
      name: i.name,
      kind: 'custom-item',
      id: i.id,
      route: `/items#custom-${i.id}`,
    });
  }
  for (const s of customSpells) {
    out.push({
      name: s.name,
      kind: 'custom-spell',
      id: s.id,
      route: `/spells#custom-${s.id}`,
    });
  }
  return out;
}

export function findWiki(index: WikiEntry[], name: string): WikiEntry | undefined {
  const q = name.trim().toLowerCase();
  if (!q) return undefined;
  return index.find((e) => e.name.toLowerCase() === q);
}

export function searchWiki(index: WikiEntry[], query: string, limit = 8): WikiEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const starts: WikiEntry[] = [];
  const contains: WikiEntry[] = [];
  for (const e of index) {
    const lower = e.name.toLowerCase();
    if (lower.startsWith(q)) starts.push(e);
    else if (lower.includes(q)) contains.push(e);
    if (starts.length + contains.length > 60) break;
  }
  return [...starts, ...contains].slice(0, limit);
}

export function kindLabel(k: WikiKind): string {
  switch (k) {
    case 'spell':
      return 'spell';
    case 'equipment':
      return 'gear';
    case 'magic':
      return 'magic';
    case 'custom-item':
      return 'homebrew item';
    case 'custom-spell':
      return 'homebrew spell';
  }
}
