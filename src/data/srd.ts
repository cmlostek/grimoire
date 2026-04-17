import spellsJson from './5e-SRD-Spells.json';
import equipmentJson from './5e-SRD-Equipment.json';
import magicItemsJson from './5e-SRD-Magic-Items.json';
import monstersJson from './5e-SRD-Monsters.json';
import ruleSectionsJson from './5e-SRD-Rule-Sections.json';
import type { Spell, EquipmentItem, MagicItem, Monster, RuleSection } from './types';

export const SPELLS = spellsJson as unknown as Spell[];
export const EQUIPMENT = equipmentJson as unknown as EquipmentItem[];
export const MAGIC_ITEMS = magicItemsJson as unknown as MagicItem[];
export const MONSTERS = monstersJson as unknown as Monster[];
export const RULE_SECTIONS = ruleSectionsJson as unknown as RuleSection[];

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
