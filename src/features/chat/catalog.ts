import { useMemo } from 'react';
import { useNotes } from '../notes/notesStore';
import { useNpcStore } from '../npcs/npcStore';
import { useSharedHomebrew } from '../homebrew/sharedHomebrewStore';
import { SPELLS, EQUIPMENT, MAGIC_ITEMS, RULE_SECTIONS } from '../../data/srd';

export type CatalogKind = 'note' | 'npc' | 'item' | 'spell' | 'srd-item' | 'srd-spell' | 'rule';

export type CatalogEntry = {
  /** Globally-unique within chat tokens. Shape: `<kind>:<identifier>`. */
  id: string;
  kind: CatalogKind;
  /** Display name shown in the picker and in the chip. */
  name: string;
  /** Optional secondary label (e.g., "Lv 3", "magic item"). */
  hint?: string;
};

const KIND_LABEL: Record<CatalogKind, string> = {
  note: 'Note',
  npc: 'NPC',
  item: 'Item',
  spell: 'Spell',
  'srd-item': 'Item',
  'srd-spell': 'Spell',
  rule: 'Rule',
};
export const kindLabel = (k: CatalogKind) => KIND_LABEL[k];

/** Build the catalog from current store state. Memo-friendly: shape only changes
 *  when underlying lists change. */
export function useCatalog(): CatalogEntry[] {
  const notes = useNotes((s) => s.notes);
  const npcs = useNpcStore((s) => s.npcs);
  const homebrewItems = useSharedHomebrew((s) => s.items);
  const homebrewSpells = useSharedHomebrew((s) => s.spells);

  return useMemo(() => {
    const out: CatalogEntry[] = [];
    for (const n of notes) out.push({ id: `note:${n.id}`, kind: 'note', name: n.title || 'Untitled' });
    for (const n of npcs) out.push({ id: `npc:${n.id}`, kind: 'npc', name: n.name });
    for (const h of homebrewItems) out.push({ id: `item:${h.id}`, kind: 'item', name: h.name, hint: 'homebrew' });
    for (const h of homebrewSpells) out.push({ id: `spell:${h.id}`, kind: 'spell', name: h.name, hint: 'homebrew' });
    for (const s of SPELLS) out.push({ id: `srd-spell:${s.index}`, kind: 'srd-spell', name: s.name, hint: `Lv ${s.level} ${s.school.name}` });
    for (const e of EQUIPMENT) out.push({ id: `srd-item:${e.index}`, kind: 'srd-item', name: e.name, hint: e.equipment_category.name });
    for (const m of MAGIC_ITEMS) out.push({ id: `srd-item:${m.index}`, kind: 'srd-item', name: m.name, hint: m.rarity?.name ?? 'magic item' });
    for (const r of RULE_SECTIONS) out.push({ id: `rule:${r.index}`, kind: 'rule', name: r.name, hint: 'rule' });
    return out;
  }, [notes, npcs, homebrewItems, homebrewSpells]);
}

/** Case-insensitive contains match. Returns up to `limit` entries, prefix matches first. */
export function searchCatalog(entries: CatalogEntry[], query: string, limit = 8): CatalogEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries.slice(0, limit);
  const prefix: CatalogEntry[] = [];
  const contains: CatalogEntry[] = [];
  for (const e of entries) {
    const n = e.name.toLowerCase();
    if (n.startsWith(q)) prefix.push(e);
    else if (n.includes(q)) contains.push(e);
    if (prefix.length >= limit) break;
  }
  return [...prefix, ...contains].slice(0, limit);
}

/** Parse a catalog id into { kind, identifier }. */
export function splitCatalogId(id: string): { kind: CatalogKind; identifier: string } | null {
  const m = id.match(/^(note|npc|item|spell|srd-item|srd-spell|rule):(.+)$/);
  if (!m) return null;
  return { kind: m[1] as CatalogKind, identifier: m[2] };
}
