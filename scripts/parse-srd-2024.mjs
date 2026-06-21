// Parse WotC SRD 5.2.1 markdown (via downfallx/dnd-5e-srd-markdown, CC-BY-4.0)
// into JSON files matching src/data/types.ts. One-shot tool — re-run when source updates.
//
// Usage: node scripts/parse-srd-2024.mjs [src-dir] [out-dir]
//   src-dir defaults to /tmp (expects spells.md, magic.md, equipment.md, rules.md)
//   out-dir defaults to src/data
//
// Outputs:
//   5e-SRD-Spells-2024.json
//   5e-SRD-Magic-Items-2024.json
//   5e-SRD-Equipment-2024.json
//   5e-SRD-Rule-Sections-2024.json

import fs from 'node:fs';
import path from 'node:path';

const SRC = process.argv[2] || '/tmp';
const OUT = process.argv[3] || path.join(process.cwd(), 'src/data');

// Match the slug scheme used by the 2014 5e-bits dataset so the same entry
// in both editions shares an index (apostrophes are dropped, not split on).
const slug = (s) =>
  s
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const SCHOOLS = [
  'Abjuration',
  'Conjuration',
  'Divination',
  'Enchantment',
  'Evocation',
  'Illusion',
  'Necromancy',
  'Transmutation',
];

function stripHtml(s) {
  return s
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/?(em|i)>/gi, '*')
    .replace(/<\/?(strong|b)>/gi, '**')
    .replace(/<[^>]+>/g, '')
    .replace(/&mdash;|&ndash;/g, '—')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&minus;/g, '-')
    .replace(/&[a-z]+;/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Convert all <table>...</table> blocks in a string to GFM markdown pipe tables.
// Lossy: colspan/rowspan attributes are ignored (cells render in their natural slot).
function htmlTablesToMarkdown(text) {
  return text.replace(/<table[\s\S]*?<\/table>/gi, (tbl) => {
    const head = tbl.match(/<thead>([\s\S]*?)<\/thead>/i);
    const body = tbl.match(/<tbody>([\s\S]*?)<\/tbody>/i);
    const rowsFrom = (chunk) =>
      [...chunk.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)].map((tr) =>
        [...tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) =>
          // Escape pipe chars in cell content so they don't break the table
          stripHtml(c[1]).replace(/\|/g, '\\|') || ' ',
        ),
      );
    const headerRows = head ? rowsFrom(head[1]) : [];
    const bodyRows = body ? rowsFrom(body[1]) : rowsFrom(tbl);
    const all = headerRows.length ? headerRows.concat(bodyRows) : bodyRows;
    if (!all.length) return '';
    const cols = Math.max(...all.map((r) => r.length));
    const pad = (row) => {
      const r = row.slice();
      while (r.length < cols) r.push(' ');
      return r;
    };
    const headerLine = headerRows.length ? pad(headerRows[0]) : Array(cols).fill(' ');
    const sep = Array(cols).fill('---');
    const body2 = (headerRows.length ? headerRows.slice(1).concat(bodyRows) : bodyRows).map(pad);
    const fmt = (r) => `| ${r.join(' | ')} |`;
    return ['', fmt(headerLine), fmt(sep), ...body2.map(fmt), ''].join('\n');
  });
}

// ---------- Spells ----------

function parseSpells(md) {
  const anchor = md.indexOf('## Spell Descriptions');
  if (anchor < 0) throw new Error('Could not find "## Spell Descriptions"');
  const tail = md.slice(anchor);
  const chunks = tail.split(/\n#### /).slice(1);
  const spells = [];

  const HEADER_RE = new RegExp(
    `^_(?:Level (\\d+) )?(${SCHOOLS.join('|')})(?: Cantrip)? \\(([^)]+)\\)_$`,
  );

  for (const chunk of chunks) {
    const nl = chunk.indexOf('\n');
    if (nl < 0) continue;
    const name = chunk.slice(0, nl).trim();
    // Strip blank lines and find first non-empty line
    const lines = chunk.slice(nl + 1).split('\n');
    let i = 0;
    while (i < lines.length && !lines[i].trim()) i++;
    if (i >= lines.length) continue;
    const head = lines[i].trim();
    const m = head.match(HEADER_RE);
    if (!m) continue; // not a spell entry (probably a stat block)

    const level = m[1] ? parseInt(m[1], 10) : 0;
    const school = m[2];
    const classes = m[3]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    i++;
    while (i < lines.length && !lines[i].trim()) i++;

    let castingTime = '';
    let range = '';
    let components = '';
    let duration = '';
    let material;
    while (i < lines.length) {
      const fm = lines[i].match(/^\*\*([A-Za-z ]+):\*\*\s*(.*)$/);
      if (!fm) break;
      const field = fm[1].trim();
      const value = fm[2].trim();
      if (field === 'Casting Time') castingTime = value;
      else if (field === 'Range') range = value;
      else if (field === 'Components') {
        const cm = value.match(/^([VSM,\s]+?)(?:\s*\((.+)\))?$/);
        if (cm) {
          components = cm[1].trim();
          material = cm[2];
        } else {
          components = value;
        }
      } else if (field === 'Duration') duration = value;
      i++;
    }
    while (i < lines.length && !lines[i].trim()) i++;

    const bodyText = lines.slice(i).join('\n').trim();
    const paragraphs = bodyText.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
    const desc = [];
    const higher = [];
    for (const p of paragraphs) {
      const mh = p.match(
        /^_(?:Using a Higher-Level Spell Slot|At Higher Levels|Cantrip Upgrade)\._\s*([\s\S]*)$/,
      );
      if (mh) {
        higher.push(mh[1].trim());
      } else {
        desc.push(p);
      }
    }

    spells.push({
      index: slug(name),
      name,
      desc,
      higher_level: higher.length ? higher : undefined,
      range,
      components: components
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      material,
      ritual: /ritual/i.test(castingTime),
      duration,
      concentration: /^Concentration/i.test(duration),
      casting_time: castingTime,
      level,
      school: { name: school },
      classes: classes.map((name) => ({ name })),
    });
  }
  // Dedupe by index (some sources duplicate)
  const seen = new Set();
  return spells.filter((s) => (seen.has(s.index) ? false : (seen.add(s.index), true)));
}

// ---------- Magic items ----------

const ITEM_CATEGORIES = [
  'Armor',
  'Potion',
  'Ring',
  'Rod',
  'Scroll',
  'Staff',
  'Wand',
  'Weapon',
  'Wondrous Item',
];

function normalizeItemCategory(c) {
  // 2014 schema uses "Wondrous Items" plural; rest singular.
  if (c === 'Wondrous Item') return 'Wondrous Items';
  return c;
}

function detectRarity(text) {
  // Order matters — check more-specific first
  const order = ['Very Rare', 'Legendary', 'Artifact', 'Uncommon', 'Common', 'Rare'];
  for (const r of order) {
    const re = new RegExp(`\\b${r}\\b`);
    if (re.test(text)) return r;
  }
  return 'Varies';
}

function parseMagicItems(md) {
  // Chunk on #### headers; only accept entries whose first italic line names a known category.
  const chunks = md.split(/\n#### /).slice(1);
  const items = [];
  const HEADER_RE = new RegExp(
    `^_(${ITEM_CATEGORIES.join('|')})(?:\\s*\\(([^)]+)\\))?,\\s*([^_]+)_$`,
  );

  for (const chunk of chunks) {
    const nl = chunk.indexOf('\n');
    if (nl < 0) continue;
    const name = chunk.slice(0, nl).trim();
    const lines = chunk.slice(nl + 1).split('\n');
    let i = 0;
    while (i < lines.length && !lines[i].trim()) i++;
    if (i >= lines.length) continue;
    const head = lines[i].trim();
    const m = head.match(HEADER_RE);
    if (!m) continue;

    const category = normalizeItemCategory(m[1]);
    const rarity = detectRarity(m[3]);

    i++;
    while (i < lines.length && !lines[i].trim()) i++;

    // Collect paragraphs until we hit the end of the chunk.
    // Convert raw HTML tables to GFM markdown first so they render under react-markdown + remark-gfm.
    const bodyText = htmlTablesToMarkdown(lines.slice(i).join('\n').trim());
    const paragraphs = bodyText
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter(Boolean);

    items.push({
      index: slug(name),
      name,
      equipment_category: { name: category },
      rarity: { name: rarity },
      desc: paragraphs,
    });
  }
  const seen = new Set();
  return items.filter((it) => (seen.has(it.index) ? false : (seen.add(it.index), true)));
}

// ---------- Equipment ----------

// Parse HTML <table> contents into an array of rows-of-cells (strings).
// Section header rows (single th with colspan) become { _section: '...' }.
function parseHtmlTable(html) {
  const headMatch = html.match(/<thead>([\s\S]*?)<\/thead>/i);
  const bodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/i);
  if (!bodyMatch) return null;
  let headers = [];
  if (headMatch) {
    const ths = [...headMatch[1].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)];
    headers = ths.map((t) => stripHtml(t[1]));
  }
  const rows = [];
  const trs = [...bodyMatch[1].matchAll(/<tr>([\s\S]*?)<\/tr>/gi)];
  for (const tr of trs) {
    // Section header row?
    const sectionTh = tr[1].match(/<th[^>]*colspan[^>]*>([\s\S]*?)<\/th>/i);
    if (sectionTh && !/<td/i.test(tr[1])) {
      rows.push({ _section: stripHtml(sectionTh[1]) });
      continue;
    }
    const cells = [...tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) =>
      stripHtml(c[1]),
    );
    rows.push(cells);
  }
  return { headers, rows };
}

// Find all <table> blocks (greedy bounded match) preceded by their nearest **bold caption**.
function findTables(md) {
  const re = /<table>[\s\S]*?<\/table>/g;
  const out = [];
  let m;
  while ((m = re.exec(md))) {
    const before = md.slice(0, m.index);
    const captionMatch = before.match(/\*\*([^*]+)\*\*\s*\n\s*$/);
    const caption = captionMatch ? captionMatch[1].trim() : '';
    out.push({ caption, html: m[0], index: m.index });
  }
  return out;
}

function parseCost(costStr) {
  if (!costStr) return undefined;
  const m = costStr.match(/^([\d,]+)\s*(CP|SP|EP|GP|PP)/i);
  if (!m) return undefined;
  return { quantity: parseInt(m[1].replace(/,/g, ''), 10), unit: m[2].toLowerCase() };
}

function parseWeight(w) {
  if (!w) return undefined;
  const m = w.match(/^([\d.]+)/);
  return m ? parseFloat(m[1]) : undefined;
}

function parseDamage(dmg) {
  if (!dmg || dmg === '—') return undefined;
  // "1d8 Slashing"
  const m = dmg.match(/^(\d+d\d+(?:\s*\+\s*\d+)?)\s+(\w+)/);
  if (!m) return undefined;
  return {
    damage_dice: m[1].replace(/\s+/g, ''),
    damage_type: { name: m[2] },
  };
}

function parseProperties(props) {
  if (!props || props === '—') return { properties: [], range: undefined, versatile: undefined };
  const out = [];
  let range;
  let versatile;
  // Split on commas not inside parens
  const parts = [];
  let depth = 0;
  let buf = '';
  for (const ch of props) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(buf.trim());
      buf = '';
    } else buf += ch;
  }
  if (buf.trim()) parts.push(buf.trim());

  for (const p of parts) {
    const rm = p.match(/^(?:Thrown|Range)\s*\(Range\s*(\d+)\/(\d+)\)$/i) ||
      p.match(/^Range\s*\((\d+)\/(\d+)\)$/i) ||
      p.match(/^Thrown\s*\(Range\s*(\d+)\/(\d+)\)$/i);
    if (rm) {
      range = { normal: parseInt(rm[1], 10), long: parseInt(rm[2], 10) };
      out.push({ name: 'Thrown' });
      continue;
    }
    const vm = p.match(/^Versatile\s*\((\d+d\d+)\)$/i);
    if (vm) {
      versatile = vm[1];
      out.push({ name: 'Versatile' });
      continue;
    }
    const am = p.match(/^Ammunition\s*\(Range\s*(\d+)\/(\d+)\)$/i);
    if (am) {
      range = { normal: parseInt(am[1], 10), long: parseInt(am[2], 10) };
      out.push({ name: 'Ammunition' });
      continue;
    }
    out.push({ name: p });
  }
  return { properties: out, range, versatile };
}

function parseEquipment(md) {
  const items = [];
  const tables = findTables(md);

  for (const { caption, html } of tables) {
    const tbl = parseHtmlTable(html);
    if (!tbl) continue;
    const { headers, rows } = tbl;
    const lowerHeaders = headers.map((h) => h.toLowerCase());

    // --- Weapons ---
    if (caption === 'Weapons' || /weapons$/i.test(caption)) {
      let section = '';
      for (const row of rows) {
        if (row._section) {
          section = row._section;
          continue;
        }
        if (!Array.isArray(row) || row.length < 6) continue;
        const [name, damageStr, propsStr, mastery, weight, cost] = row;
        if (!name) continue;
        const damage = parseDamage(damageStr);
        const { properties, range, versatile } = parseProperties(propsStr);
        const weaponCategory = /Simple/i.test(section) ? 'Simple' : 'Martial';
        const weaponRange = /Melee/i.test(section) ? 'Melee' : 'Ranged';
        const item = {
          index: slug(name),
          name,
          equipment_category: { name: 'Weapon' },
          weapon_category: weaponCategory,
          weapon_range: weaponRange,
          category_range: `${weaponCategory} ${weaponRange}`,
          cost: parseCost(cost),
          weight: parseWeight(weight),
          damage,
          properties,
        };
        if (versatile) {
          item.two_handed_damage = {
            damage_dice: versatile,
            damage_type: damage?.damage_type ?? { name: 'Bludgeoning' },
          };
        }
        if (range) item.range = range;
        if (mastery && mastery !== '—') {
          item.desc = [`Mastery: ${mastery}`];
        }
        items.push(item);
      }
      continue;
    }

    // --- Armor ---
    if (caption === 'Armor' || /^armor$/i.test(caption)) {
      let section = '';
      for (const row of rows) {
        if (row._section) {
          section = row._section;
          continue;
        }
        if (!Array.isArray(row) || row.length < 5) continue;
        const [name, acStr, strReq, stealth, weight, cost] = row;
        if (!name) continue;
        const acMatch = acStr?.match(/(\d+)/);
        const armor = {
          index: slug(name),
          name,
          equipment_category: { name: 'Armor' },
          armor_category: (() => {
            // section is like "*Light Armor (1 Minute to Don or Doff)*" (stripHtml renders <em> as *)
            const s = section
              .replace(/^\*+|\*+$/g, '')
              .replace(/\s*\(.*$/, '')
              .trim();
            if (/^Shield/i.test(s)) return 'Shield';
            return s.replace(/\sArmor$/i, '').trim() || 'Light';
          })(),
          armor_class: acMatch
            ? {
                base: parseInt(acMatch[1], 10),
                dex_bonus: /Dex/i.test(acStr || ''),
                max_bonus: (() => {
                  const mm = (acStr || '').match(/max\s*(\d+)|\+\s*Dex\s*\(max\s*(\d+)\)/i);
                  return mm ? parseInt(mm[1] || mm[2], 10) : undefined;
                })(),
              }
            : undefined,
          str_minimum: strReq && /\d/.test(strReq) ? parseInt(strReq, 10) : 0,
          stealth_disadvantage: /Disadvantage/i.test(stealth || ''),
          weight: parseWeight(weight),
          cost: parseCost(cost),
        };
        items.push(armor);
      }
      continue;
    }

    // --- Adventuring Gear / Tools / Mounts / etc.: generic two-or-three column table ---
    // Heuristic: must have a "Cost" or "Price" or "Weight" header.
    const hasCost = lowerHeaders.some((h) => /cost|price/.test(h));
    const hasWeight = lowerHeaders.some((h) => /weight/.test(h));
    if (!hasCost && !hasWeight) continue;
    if (!caption) continue;
    const nameIdx = lowerHeaders.findIndex((h) => /item|name|gear|tool|service|mount|vehicle|food|drink|lodging/.test(h));
    const costIdx = lowerHeaders.findIndex((h) => /cost|price/.test(h));
    const weightIdx = lowerHeaders.findIndex((h) => /weight/.test(h));
    if (nameIdx < 0) continue;

    const categoryName = (() => {
      const c = caption.toLowerCase();
      if (/adventuring|gear/.test(c)) return 'Adventuring Gear';
      if (/tool/.test(c)) return 'Tools';
      if (/mount|vehicle|tack|harness/.test(c)) return 'Mounts and Vehicles';
      if (/pack/.test(c)) return 'Adventuring Gear';
      if (/food|drink|lodging|service/.test(c)) return 'Adventuring Gear';
      if (/ammunition/.test(c)) return 'Adventuring Gear';
      return caption;
    })();

    for (const row of rows) {
      if (row._section) continue;
      if (!Array.isArray(row)) continue;
      const name = row[nameIdx];
      if (!name || name === '—') continue;
      const cost = costIdx >= 0 ? parseCost(row[costIdx]) : undefined;
      const weight = weightIdx >= 0 ? parseWeight(row[weightIdx]) : undefined;
      items.push({
        index: slug(name),
        name,
        equipment_category: { name: categoryName },
        cost,
        weight,
      });
    }
  }

  // Dedupe by index
  const seen = new Set();
  return items.filter((it) => (seen.has(it.index) ? false : (seen.add(it.index), true)));
}

// ---------- Rules glossary ----------

function parseRules(md) {
  const anchor = md.indexOf('## Rules Definitions');
  if (anchor < 0) throw new Error('Could not find "## Rules Definitions"');
  const tail = md.slice(anchor);
  const chunks = tail.split(/\n#### /).slice(1);
  const out = [];
  for (const chunk of chunks) {
    const nl = chunk.indexOf('\n');
    if (nl < 0) continue;
    const name = chunk.slice(0, nl).trim();
    const body = htmlTablesToMarkdown(chunk.slice(nl + 1).trim());
    if (!body) continue;
    out.push({
      index: slug(name),
      name,
      desc: body,
    });
  }
  return out;
}

// ---------- Classes ----------

/** Parse a key/value HTML table (two columns, no thead) into {label: value}. */
function parseKvTable(html) {
  const m = html.match(/<table[\s\S]*?<\/table>/i);
  if (!m) return {};
  const rows = [...m[0].matchAll(/<tr>([\s\S]*?)<\/tr>/gi)];
  const out = {};
  for (const r of rows) {
    const cells = [...r[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) =>
      stripHtml(c[1]),
    );
    if (cells.length >= 2) out[cells[0]] = cells.slice(1).join(' ');
  }
  return out;
}

/** Parse a class level table (thead + tbody). Returns { headers, rows[][] }. */
function parseLevelTable(html) {
  const tbl = parseHtmlTable(html);
  if (!tbl) return { headers: [], rows: [] };
  return tbl;
}

function parseClasses(md) {
  // Each `## ClassName` block (anchor # Classes once, then per-class sections).
  const classBlocks = md.split(/\n## /).slice(1);
  const classes = [];

  for (const block of classBlocks) {
    const nl = block.indexOf('\n');
    const name = block.slice(0, nl).trim();
    // Skip non-class headers (none expected in classes.md but be defensive).
    if (!name || /spell list|feature|table|description/i.test(name)) continue;
    const body = block.slice(nl + 1);

    // --- Core traits table (key/value) ---
    const traitsAnchor = body.indexOf('**Core ');
    const traits = traitsAnchor >= 0 ? parseKvTable(body.slice(traitsAnchor)) : {};

    // --- Class features table (level progression) ---
    const featuresTableAnchor = body.search(new RegExp(`\\*\\*${name} Features\\*\\*`));
    let levelTable = [];
    if (featuresTableAnchor >= 0) {
      const tableHtml = body.slice(featuresTableAnchor).match(/<table[\s\S]*?<\/table>/i);
      if (tableHtml) {
        const { headers, rows } = parseLevelTable(tableHtml[0]);
        const lowerHeaders = headers.map((h) => h.toLowerCase());
        const lvIdx = lowerHeaders.findIndex((h) => /^level$/.test(h));
        const pbIdx = lowerHeaders.findIndex((h) => /proficiency\s+bonus/.test(h));
        const featIdx = lowerHeaders.findIndex((h) => /(class\s+)?features/.test(h));
        for (const row of rows) {
          if (!Array.isArray(row)) continue;
          const lvStr = row[lvIdx] ?? '';
          const lv = parseInt(lvStr, 10);
          if (!Number.isFinite(lv) || lv < 1 || lv > 20) continue;
          const featuresStr = featIdx >= 0 ? row[featIdx] ?? '' : '';
          const features = featuresStr
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s && !/^—$/.test(s) && !/^subclass feature$/i.test(s));
          const classCols = {};
          headers.forEach((h, i) => {
            if (i === lvIdx || i === pbIdx || i === featIdx) return;
            const v = row[i];
            if (v !== undefined && v !== '' && v !== '—') classCols[h] = v;
          });
          levelTable.push({
            level: lv,
            proficiencyBonus: pbIdx >= 0 ? parseInt(row[pbIdx] ?? '0', 10) : 0,
            features,
            classColumns: classCols,
          });
        }
      }
    }

    // --- Feature descriptions (#### Name blocks under "### <Class> Class Features",
    //     before "### <Class> Spell List" / "### <Class> Subclass") ---
    const featuresSection = (() => {
      const re = new RegExp(`### ${name} Class Features`);
      const m = body.match(re);
      if (!m) return '';
      const start = body.indexOf(m[0]) + m[0].length;
      // Stop at the next `###` boundary (spell list or subclass)
      const tail = body.slice(start);
      const endMatch = tail.match(/\n### /);
      return endMatch ? tail.slice(0, endMatch.index) : tail;
    })();

    const features = {};
    if (featuresSection) {
      const chunks = featuresSection.split(/\n#### /).slice(1);
      for (const chunk of chunks) {
        const cnl = chunk.indexOf('\n');
        const rawName = chunk.slice(0, cnl).trim();
        const fbody = htmlTablesToMarkdown(chunk.slice(cnl + 1).trim());
        if (!rawName) continue;
        // Source prefixes feature headers with "Level N: " — strip so the keys
        // match the references in the level table ("Rage", not "Level 1: Rage").
        const fname = rawName.replace(/^Level\s+\d+:\s+/, '');
        features[fname] = fbody;
      }
    }

    // --- Spell list (caster classes only) ---
    // Each level is a `#### Cantrips (Level 0 ...)` or `#### Level N <Class> Spells`
    // section followed by an HTML table whose first column is the spell name
    // (plain text, not italicized).
    let spellList;
    const spellListMatch = body.match(new RegExp(`### ${name} Spell List([\\s\\S]*?)(?:\n### |$)`));
    if (spellListMatch) {
      const sl = spellListMatch[1];
      const sections = sl.split(/\n#### /).slice(1);
      const buckets = [];
      for (const section of sections) {
        const nl2 = section.indexOf('\n');
        const header = section.slice(0, nl2).trim();
        let lv;
        if (/^Cantrips/i.test(header)) {
          lv = 0;
        } else {
          const lvMatch = header.match(/Level\s+(\d+)/i);
          if (!lvMatch) continue;
          lv = parseInt(lvMatch[1], 10);
        }
        const tableHtml = section.match(/<table[\s\S]*?<\/table>/i);
        if (!tableHtml) continue;
        const tbl = parseHtmlTable(tableHtml[0]);
        if (!tbl) continue;
        const names = [];
        for (const row of tbl.rows) {
          if (!Array.isArray(row) || row.length === 0) continue;
          const n = row[0];
          if (!n || /^—$/.test(n)) continue;
          const sid = slug(n);
          if (!names.includes(sid)) names.push(sid);
        }
        if (names.length > 0) buckets.push({ level: lv, spells: names });
      }
      if (buckets.length > 0) {
        buckets.sort((a, b) => a.level - b.level);
        spellList = buckets;
      }
    }

    // --- Subclass ---
    const subclasses = [];
    const subAnchor = body.search(new RegExp(`### ${name} Subclass:`));
    if (subAnchor >= 0) {
      const subSection = body.slice(subAnchor);
      const subHeaderMatch = subSection.match(/^### [^:]+: (.+?)\n/);
      const subName = subHeaderMatch?.[1]?.trim();
      if (subName) {
        // Subclass feature blocks use `#### <FeatureName>` and a level cue in
        // the first paragraph (italicized "_Level N <Subclass>_").
        const subBody = subSection.replace(/^### .+?\n/, '');
        const chunks = subBody.split(/\n#### /).slice(1);
        const subFeatures = [];
        for (const chunk of chunks) {
          const cnl = chunk.indexOf('\n');
          const rawName = chunk.slice(0, cnl).trim();
          const fbody = chunk.slice(cnl + 1).trim();
          // Subclass features also use "Level N: " prefix in the header.
          const lvHeaderMatch = rawName.match(/^Level\s+(\d+):\s+(.+)$/);
          const lvBodyMatch = fbody.match(/_Level (\d+) /);
          const level = lvHeaderMatch
            ? parseInt(lvHeaderMatch[1], 10)
            : lvBodyMatch
              ? parseInt(lvBodyMatch[1], 10)
              : 0;
          const fname = lvHeaderMatch ? lvHeaderMatch[2] : rawName;
          subFeatures.push({
            level,
            name: fname,
            desc: htmlTablesToMarkdown(fbody),
          });
        }
        subclasses.push({
          index: slug(subName),
          name: subName,
          className: name,
          features: subFeatures,
        });
      }
    }

    const hitDie = (() => {
      const v = traits['Hit Point Die'] ?? '';
      const m = v.match(/D(\d+)/i);
      return m ? parseInt(m[1], 10) : 0;
    })();

    classes.push({
      index: slug(name),
      name,
      hitDie,
      primaryAbility: traits['Primary Ability'] ?? '',
      saveProfs: traits['Saving Throw Proficiencies'] ?? '',
      skillChoices: traits['Skill Proficiencies'] ?? '',
      weaponProfs: traits['Weapon Proficiencies'] ?? '',
      armorProfs: traits['Armor Training'] ?? '',
      startingEquipment: traits['Starting Equipment'] ?? '',
      levelTable,
      features,
      subclasses,
      ...(spellList ? { spellList } : {}),
    });
  }
  return classes;
}

// ---------- Species / Backgrounds / Feats ----------

function parseOrigins(md) {
  const species = [];
  const backgrounds = [];

  // Backgrounds: blocks under "### Background Descriptions"
  const bgAnchor = md.indexOf('### Background Descriptions');
  if (bgAnchor >= 0) {
    const tail = md.slice(bgAnchor);
    const stop = tail.search(/\n## /);
    const section = stop > 0 ? tail.slice(0, stop) : tail;
    const chunks = section.split(/\n#### /).slice(1);
    for (const chunk of chunks) {
      const nl = chunk.indexOf('\n');
      const name = chunk.slice(0, nl).trim();
      const body = chunk.slice(nl + 1);
      const lines = body.split('\n').map((l) => l.trim());
      const fieldOf = (label) => {
        const re = new RegExp(`^\\*\\*${label}:\\*\\*\\s*(.+)$`);
        const hit = lines.find((l) => re.test(l));
        return hit ? hit.replace(re, '$1').trim() : '';
      };
      const ability = fieldOf('Ability Scores');
      const feat = fieldOf('Feat');
      const skills = fieldOf('Skill Proficiencies');
      const tool = fieldOf('Tool Proficiency');
      const equipment = fieldOf('Equipment');
      backgrounds.push({
        index: slug(name),
        name,
        abilityScores: ability.split(/,| and /).map((s) => s.trim()).filter(Boolean),
        feat: feat.replace(/\s*\(see "Feats"\)\.?$/i, '').trim(),
        skillProfs: skills.split(/,| and /).map((s) => s.trim()).filter(Boolean),
        toolProf: tool,
        equipment,
      });
    }
  }

  // Species: blocks under "### Species Descriptions"
  const spAnchor = md.indexOf('### Species Descriptions');
  if (spAnchor >= 0) {
    const tail = md.slice(spAnchor);
    const stop = tail.search(/\n## /);
    const section = stop > 0 ? tail.slice(0, stop) : tail;
    const chunks = section.split(/\n#### /).slice(1);
    for (const chunk of chunks) {
      const nl = chunk.indexOf('\n');
      const name = chunk.slice(0, nl).trim();
      const body = chunk.slice(nl + 1);
      const lines = body.split('\n');
      const fieldOf = (label) => {
        const re = new RegExp(`^\\*\\*${label}:\\*\\*\\s*(.+)$`);
        const hit = lines.find((l) => re.test(l));
        return hit ? hit.replace(re, '$1').trim() : '';
      };
      // Traits: italicized "_Name._ body" paragraphs, possibly with embedded tables.
      const bodyWithTables = htmlTablesToMarkdown(body);
      const paragraphs = bodyWithTables.split(/\n\n+/);
      const traits = [];
      for (const p of paragraphs) {
        const m = p.match(/^_([A-Z][A-Za-z0-9' \-]+?)\._\s*([\s\S]*)$/);
        if (m) {
          traits.push({ name: m[1].trim(), desc: m[2].trim() });
        }
      }
      species.push({
        index: slug(name),
        name,
        creatureType: fieldOf('Creature Type'),
        size: fieldOf('Size'),
        speed: fieldOf('Speed'),
        traits,
      });
    }
  }

  return { species, backgrounds };
}

function parseFeats(md) {
  const feats = [];
  // Sections: ### Origin Feats / General Feats / Fighting Style Feats / Epic Boon Feats
  const sectionRe = /\n### (Origin|General|Fighting Style|Epic Boon) Feats\n/g;
  const matches = [...md.matchAll(sectionRe)];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const cat = m[1];
    const start = m.index + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : md.length;
    const section = md.slice(start, end);
    const chunks = section.split(/\n#### /).slice(1);
    for (const chunk of chunks) {
      const nl = chunk.indexOf('\n');
      const name = chunk.slice(0, nl).trim();
      const body = chunk.slice(nl + 1).trim();
      // First italic line: `_<Category> Feat[(Prerequisite: ...)]_`
      const firstLine = body.split('\n').find((l) => l.trim().startsWith('_'));
      let prerequisite;
      if (firstLine) {
        const pm = firstLine.match(/Prerequisite:\s*([^)]+)/);
        if (pm) prerequisite = pm[1].trim();
      }
      // Rest after the italic header is the body.
      const afterHeader = firstLine
        ? body.slice(body.indexOf(firstLine) + firstLine.length).trim()
        : body;
      const repeatable = /_Repeatable\._/.test(afterHeader);
      feats.push({
        index: slug(name),
        name,
        category: cat,
        ...(prerequisite ? { prerequisite } : {}),
        desc: htmlTablesToMarkdown(afterHeader),
        ...(repeatable ? { repeatable: true } : {}),
      });
    }
  }
  return feats;
}

// ---------- Main ----------

function load(p) {
  return fs.readFileSync(path.join(SRC, p), 'utf8').replace(/﻿/g, '');
}

const spellsMd = load('spells.md');
const magicMd = load('magic.md');
const equipMd = load('equipment.md');
const rulesMd = load('rules.md');
const classesMd = load('classes.md');
const originsMd = load('origins.md');
const featsMd = load('feats.md');

const spells = parseSpells(spellsMd);
const magic = parseMagicItems(magicMd);
const equipment = parseEquipment(equipMd);
const rules = parseRules(rulesMd);
const classes = parseClasses(classesMd);
const { species, backgrounds } = parseOrigins(originsMd);
const feats = parseFeats(featsMd);

function write(file, data) {
  const out = path.join(OUT, file);
  fs.writeFileSync(out, JSON.stringify(data, null, 0));
  console.log(`  ${file}: ${data.length} entries  (${Math.round(fs.statSync(out).size / 1024)} KB)`);
}

console.log('Parsed 2024 SRD:');
write('5e-SRD-Spells-2024.json', spells);
write('5e-SRD-Magic-Items-2024.json', magic);
write('5e-SRD-Equipment-2024.json', equipment);
write('5e-SRD-Rule-Sections-2024.json', rules);
write('5e-SRD-Classes-2024.json', classes);
write('5e-SRD-Species-2024.json', species);
write('5e-SRD-Backgrounds-2024.json', backgrounds);
write('5e-SRD-Feats-2024.json', feats);

// Sanity samples
const peek = (arr, n) => arr.find((x) => x.name === n) ?? arr.find((x) => x.index === slug(n));
console.log('\nSamples:');
console.log('  spell  Fireball:', JSON.stringify(peek(spells, 'Fireball'), null, 2)?.slice(0, 400));
console.log('  magic  Bag of Holding:', JSON.stringify(peek(magic, 'Bag of Holding'), null, 2)?.slice(0, 300));
console.log('  weapon Longsword:', JSON.stringify(peek(equipment, 'Longsword'), null, 2)?.slice(0, 300));
console.log('  rule   Advantage:', JSON.stringify(peek(rules, 'Advantage'), null, 2)?.slice(0, 300));
