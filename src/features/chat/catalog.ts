import { useMemo } from 'react';
import { useNotes } from '../notes/notesStore';
import { useNpcStore } from '../npcs/npcStore';
import { useSharedHomebrew } from '../homebrew/sharedHomebrewStore';
import { spellsFor, equipmentFor, magicItemsFor, ruleSectionsFor } from '../../data/srd';
import { useCampaignSettings } from '../notes/campaignSettingsStore';

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
 *  when underlying lists change. SRD entries are filtered by the campaign's
 *  current edition so chat chips don't suggest entries the campaign has hidden. */
export function useCatalog(): CatalogEntry[] {
  const notes = useNotes((s) => s.notes);
  const npcs = useNpcStore((s) => s.npcs);
  const homebrewItems = useSharedHomebrew((s) => s.items);
  const homebrewSpells = useSharedHomebrew((s) => s.spells);
  const edition = useCampaignSettings((s) => s.settings.srdEdition);

  return useMemo(() => {
    const spells = spellsFor(edition);
    const equipment = equipmentFor(edition);
    const magic = magicItemsFor(edition);
    const rules = ruleSectionsFor(edition);
    const out: CatalogEntry[] = [];
    for (const n of notes) out.push({ id: `note:${n.id}`, kind: 'note', name: n.title || 'Untitled' });
    for (const n of npcs) out.push({ id: `npc:${n.id}`, kind: 'npc', name: n.name });
    for (const h of homebrewItems) out.push({ id: `item:${h.id}`, kind: 'item', name: h.name, hint: 'homebrew' });
    for (const h of homebrewSpells) out.push({ id: `spell:${h.id}`, kind: 'spell', name: h.name, hint: 'homebrew' });
    for (const s of spells) out.push({ id: `srd-spell:${s.index}`, kind: 'srd-spell', name: s.name, hint: `Lv ${s.level} ${s.school.name}` });
    for (const e of equipment) out.push({ id: `srd-item:${e.index}`, kind: 'srd-item', name: e.name, hint: e.equipment_category.name });
    for (const m of magic) out.push({ id: `srd-item:${m.index}`, kind: 'srd-item', name: m.name, hint: m.rarity?.name ?? 'magic item' });
    for (const r of rules) out.push({ id: `rule:${r.index}`, kind: 'rule', name: r.name, hint: 'rule' });
    return out;
  }, [notes, npcs, homebrewItems, homebrewSpells, edition]);
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
