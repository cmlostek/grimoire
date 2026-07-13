// Merge the 5e-bits/5e-database canonical 2024 SRD JSON (structured, actively
// maintained) into our markdown-parsed 5e-SRD-Equipment-2024.json /
// 5e-SRD-Magic-Items-2024.json. The markdown parser (parse-srd-2024.mjs)
// drops entries whose source tables don't match its heuristics (see
// src/data/README.md); the 5e-bits dataset fills most of those gaps with
// higher-quality structured data (weapon mastery, tool crafting/utilize,
// armor don/doff times, etc). Where 5e-bits has an entry, it wins; entries
// only the markdown parser found (mounts, vehicles, hirelings, lifestyle
// expenses, aggregated magic-item variants) are kept as-is.
//
// Usage: node scripts/merge-srd-2024-canonical.mjs [out-dir]
//   out-dir defaults to src/data. Re-run when 5e-bits/5e-database updates
//   its 2024 dataset (it's a live WIP — check for new entries periodically).

import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2] || path.join(process.cwd(), 'src/data');
const RAW_BASE = 'https://raw.githubusercontent.com/5e-bits/5e-database/main/src/2024/en';

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

async function fetchJson(name) {
  const res = await fetch(`${RAW_BASE}/5e-SRD-${name}.json`);
  if (!res.ok) throw new Error(`Failed to fetch ${name}: ${res.status}`);
  return res.json();
}

function readLocal(file) {
  return JSON.parse(fs.readFileSync(path.join(OUT, file), 'utf8'));
}

function write(file, data) {
  const out = path.join(OUT, file);
  const sorted = [...data].sort((a, b) => a.name.localeCompare(b.name));
  fs.writeFileSync(out, JSON.stringify(sorted, null, 0));
  console.log(`  ${file}: ${sorted.length} entries  (${Math.round(fs.statSync(out).size / 1024)} KB)`);
}

// Splits a 5e-bits desc string on its "\n"-joined paragraph breaks and drops
// the leading "Category (subtype)" line, which duplicates equipment_category/rarity.
function splitDesc(raw) {
  if (!raw) return [];
  const parts = raw
    .split(/\s*\n\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length > 1) parts.shift();
  return parts;
}

// ---------- Equipment ----------

function equipmentCategoryOf(cats) {
  if (cats.includes('Weapons')) return 'Weapon';
  if (cats.includes('Armor') || cats.includes('Shields')) return 'Armor';
  if (cats.some((c) => /Tools|Musical Instruments|Gaming Sets/.test(c))) return 'Tools';
  return 'Adventuring Gear';
}

function gearCategoryOf(cats) {
  if (cats.includes('Arcane Foci')) return 'Arcane Foci';
  if (cats.includes('Druidic Foci')) return 'Druidic Foci';
  if (cats.includes('Holy Symbols')) return 'Holy Symbols';
  if (cats.includes('Equipment Packs')) return 'Equipment Packs';
  if (cats.includes('Ammunition')) return 'Ammunition';
  return undefined;
}

function transformEquipment(it) {
  const cats = it.equipment_categories.map((c) => c.name);
  const category = equipmentCategoryOf(cats);
  const index = slug(it.name);

  const base = {
    index,
    name: it.name,
    equipment_category: { name: category },
    cost: it.cost,
    weight: it.weight,
  };

  if (category === 'Weapon') {
    const weaponCategory = cats.includes('Martial Weapons') ? 'Martial' : 'Simple';
    const weaponRange = cats.includes('Ranged Weapons') ? 'Ranged' : 'Melee';
    Object.assign(base, {
      weapon_category: weaponCategory,
      weapon_range: weaponRange,
      category_range: `${weaponCategory} ${weaponRange}`,
      damage: it.damage,
      two_handed_damage: it.two_handed_damage,
      range: it.range,
      properties: it.properties?.map((p) => ({ name: p.name })),
    });
    if (it.mastery) base.desc = [`Mastery: ${it.mastery.name}`];
    return base;
  }

  if (category === 'Armor') {
    const armorCategory = cats.includes('Shields')
      ? 'Shield'
      : cats.includes('Heavy Armor')
        ? 'Heavy'
        : cats.includes('Medium Armor')
          ? 'Medium'
          : 'Light';
    Object.assign(base, {
      armor_category: armorCategory,
      armor_class: it.armor_class,
      str_minimum: it.str_minimum ?? 0,
      stealth_disadvantage: !!it.stealth_disadvantage,
    });
    return base;
  }

  const gearCategory = gearCategoryOf(cats);
  if (gearCategory) base.gear_category = { name: gearCategory };

  // Tools: describe what they craft/utilize (matches 2014 dataset's generic
  // "these tools let you..." style desc paragraphs).
  const descParts = [];
  if (it.craft?.length) descParts.push(`Craft: ${it.craft.map((c) => c.name).join(', ')}.`);
  if (it.utilize?.length) {
    descParts.push(
      `Utilize: ${it.utilize.map((u) => `${u.name} (DC ${u.dc.dc_value})`).join('; ')}.`,
    );
  }
  if (descParts.length) base.desc = descParts;

  return base;
}

// ---------- Magic items ----------

const MAGIC_CATEGORY_MAP = {
  Armor: 'Armor',
  Potions: 'Potion',
  Rings: 'Ring',
  Rods: 'Rod',
  Scrolls: 'Scroll',
  Staffs: 'Staff',
  Wands: 'Wand',
  Weapons: 'Weapon',
  'Wondrous Items': 'Wondrous Items',
};

function detectRarity(text) {
  const order = ['Very Rare', 'Legendary', 'Artifact', 'Uncommon', 'Common', 'Rare'];
  for (const r of order) {
    if (new RegExp(`\\b${r}\\b`).test(text)) return r;
  }
  return 'Varies';
}

function transformMagicItem(it) {
  return {
    index: slug(it.name),
    name: it.name,
    equipment_category: { name: MAGIC_CATEGORY_MAP[it.equipment_category.name] ?? it.equipment_category.name },
    rarity: { name: detectRarity(it.rarity.name) },
    desc: splitDesc(it.desc),
    ...(it.variant ? { variant: true } : {}),
  };
}

// ---------- Main ----------

console.log('Fetching 5e-bits/5e-database canonical 2024 dataset...');
const [bitsEquipment, bitsMagicItems] = await Promise.all([
  fetchJson('Equipment'),
  fetchJson('Magic-Items'),
]);
console.log(`  fetched ${bitsEquipment.length} equipment, ${bitsMagicItems.length} magic items`);

const localEquipment = readLocal('5e-SRD-Equipment-2024.json');
const localMagicItems = readLocal('5e-SRD-Magic-Items-2024.json');

function merge(local, bitsTransformed) {
  const map = new Map(local.map((x) => [x.index, x]));
  for (const item of bitsTransformed) map.set(item.index, item);
  return [...map.values()];
}

const mergedEquipment = merge(localEquipment, bitsEquipment.map(transformEquipment));
const mergedMagicItems = merge(localMagicItems, bitsMagicItems.map(transformMagicItem));

console.log('\nMerged 2024 SRD (markdown parse + 5e-bits canonical):');
write('5e-SRD-Equipment-2024.json', mergedEquipment);
write('5e-SRD-Magic-Items-2024.json', mergedMagicItems);
