import spellsJson from './5e-SRD-Spells.json';
import equipmentJson from './5e-SRD-Equipment.json';
import magicItemsJson from './5e-SRD-Magic-Items.json';
import monstersJson from './5e-SRD-Monsters.json';
import ruleSectionsJson from './5e-SRD-Rule-Sections.json';
import spells2024Json from './5e-SRD-Spells-2024.json';
import equipment2024Json from './5e-SRD-Equipment-2024.json';
import magicItems2024Json from './5e-SRD-Magic-Items-2024.json';
import ruleSections2024Json from './5e-SRD-Rule-Sections-2024.json';
import classes2024Json from './5e-SRD-Classes-2024.json';
import species2024Json from './5e-SRD-Species-2024.json';
import backgrounds2024Json from './5e-SRD-Backgrounds-2024.json';
import feats2024Json from './5e-SRD-Feats-2024.json';
import type {
  Spell,
  EquipmentItem,
  MagicItem,
  Monster,
  RuleSection,
  Class,
  Species,
  Background,
  Feat,
} from './types';

export type SrdEdition = '2014' | '2024';
type WithEdition<T> = T & { edition: SrdEdition };

const tag = <T>(arr: T[], edition: SrdEdition): WithEdition<T>[] =>
  arr.map((x) => ({ ...x, edition }));

function unionDedupe<T extends { index: string }>(...arrays: T[][]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const arr of arrays) {
    for (const item of arr) {
      if (seen.has(item.index)) continue;
      seen.add(item.index);
      out.push(item);
    }
  }
  return out;
}

export const SPELLS_2014 = tag(spellsJson as unknown as Spell[], '2014');
export const SPELLS_2024 = tag(spells2024Json as unknown as Spell[], '2024');
export const EQUIPMENT_2014 = tag(equipmentJson as unknown as EquipmentItem[], '2014');
export const EQUIPMENT_2024 = tag(equipment2024Json as unknown as EquipmentItem[], '2024');
export const MAGIC_ITEMS_2014 = tag(magicItemsJson as unknown as MagicItem[], '2014');
export const MAGIC_ITEMS_2024 = tag(magicItems2024Json as unknown as MagicItem[], '2024');
export const RULE_SECTIONS_2014 = tag(ruleSectionsJson as unknown as RuleSection[], '2014');
export const RULE_SECTIONS_2024 = tag(ruleSections2024Json as unknown as RuleSection[], '2024');

// Deduped unions. 2014 wins on conflicts to preserve historical behavior for
// non-edition-aware consumers (homebrew, character sheet, wiki index).
export const SPELLS = unionDedupe(SPELLS_2014, SPELLS_2024);
export const EQUIPMENT = unionDedupe(EQUIPMENT_2014, EQUIPMENT_2024);
export const MAGIC_ITEMS = unionDedupe(MAGIC_ITEMS_2014, MAGIC_ITEMS_2024);
export const RULE_SECTIONS = unionDedupe(RULE_SECTIONS_2014, RULE_SECTIONS_2024);
export const MONSTERS = monstersJson as unknown as Monster[];

/** Returns the entries for a given edition selector. */
export function spellsFor(edition: SrdEdition | 'both') {
  if (edition === '2014') return SPELLS_2014;
  if (edition === '2024') return SPELLS_2024;
  return SPELLS;
}
export function equipmentFor(edition: SrdEdition | 'both') {
  if (edition === '2014') return EQUIPMENT_2014;
  if (edition === '2024') return EQUIPMENT_2024;
  return EQUIPMENT;
}
export function magicItemsFor(edition: SrdEdition | 'both') {
  if (edition === '2014') return MAGIC_ITEMS_2014;
  if (edition === '2024') return MAGIC_ITEMS_2024;
  return MAGIC_ITEMS;
}
export function ruleSectionsFor(edition: SrdEdition | 'both') {
  if (edition === '2014') return RULE_SECTIONS_2014;
  if (edition === '2024') return RULE_SECTIONS_2024;
  return RULE_SECTIONS;
}

// ── 2024-only character-builder data ──────────────────────────────────────
// We don't have a 2014 dataset for these yet, so they ship as 2024-only
// (`*_2024` named, no edition selector). Phase 4 / 5 consumers should always
// reference these directly.
export const CLASSES_2024 = classes2024Json as unknown as Class[];
export const SPECIES_2024 = species2024Json as unknown as Species[];
export const BACKGROUNDS_2024 = backgrounds2024Json as unknown as Background[];
export const FEATS_2024 = feats2024Json as unknown as Feat[];

export const SPELL_SCHOOLS = Array.from(new Set(SPELLS.map((s) => s.school.name))).sort();
export const SPELL_LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
export const EQUIPMENT_CATEGORIES = Array.from(
  new Set(EQUIPMENT.map((e) => e.equipment_category.name))
).sort();
export const MAGIC_ITEM_RARITIES = [
  'Common',
  'Uncommon',
  'Rare',
  'Very Rare',
  'Legendary',
  'Artifact',
  'Varies',
];

export function costToGp(cost?: { quantity: number; unit: string }): number {
  if (!cost) return 0;
  const { quantity, unit } = cost;
  switch (unit) {
    case 'cp':
      return quantity / 100;
    case 'sp':
      return quantity / 10;
    case 'ep':
      return quantity / 2;
    case 'gp':
      return quantity;
    case 'pp':
      return quantity * 10;
    default:
      return quantity;
  }
}

export function formatCost(cost?: { quantity: number; unit: string }): string {
  if (!cost) return '—';
  return `${cost.quantity} ${cost.unit}`;
}

export function modifier(score: number): string {
  const m = Math.floor((score - 10) / 2);
  return m >= 0 ? `+${m}` : `${m}`;
}
