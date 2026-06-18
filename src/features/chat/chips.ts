import type { CatalogKind } from './catalog';

/** Single character icon for each catalog kind. Used in picker rows and chips. */
export const KIND_ICON_CHAR: Record<CatalogKind, string> = {
  note: '📓',
  npc: '🧙',
  item: '🎒',
  spell: '✨',
  'srd-item': '🎒',
  'srd-spell': '✨',
  rule: '📖',
};

/** Background tint used behind the kind icon in the picker and as chip fill. */
export const KIND_PILL_BG: Record<CatalogKind, string> = {
  note:        'color-mix(in srgb, #38bdf8 18%, transparent)',
  npc:         'color-mix(in srgb, #fbbf24 18%, transparent)',
  item:        'color-mix(in srgb, #4ade80 18%, transparent)',
  spell:       'color-mix(in srgb, #a78bfa 18%, transparent)',
  'srd-item':  'color-mix(in srgb, #4ade80 14%, transparent)',
  'srd-spell': 'color-mix(in srgb, #a78bfa 14%, transparent)',
  rule:        'color-mix(in srgb, #f472b6 14%, transparent)',
};

/** Text/accent color for each kind. */
export const KIND_FG: Record<CatalogKind, string> = {
  note:        '#7dd3fc',
  npc:         '#fbbf24',
  item:        '#86efac',
  spell:       '#c4b5fd',
  'srd-item':  '#86efac',
  'srd-spell': '#c4b5fd',
  rule:        '#f9a8d4',
};
