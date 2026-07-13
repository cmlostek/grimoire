# SRD data

This folder ships two open-licensed Dungeons & Dragons SRD datasets that the
Spells, Items, and Rules pages render. Both are under
[CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/) and require
attribution to Wizards of the Coast.

## 2014 — SRD 5.1

- `5e-SRD-Spells.json`
- `5e-SRD-Equipment.json`
- `5e-SRD-Magic-Items.json`
- `5e-SRD-Monsters.json`
- `5e-SRD-Rule-Sections.json`

Source: [5e-bits/5e-database](https://github.com/5e-bits/5e-database), the
canonical JSON port of the WotC SRD 5.1 used by the public dnd5eapi.co.

## 2024 — SRD 5.2.1

Spells/items/magic items/rules (used by the catalog pages):

- `5e-SRD-Spells-2024.json` (339 entries)
- `5e-SRD-Equipment-2024.json` (220 entries)
- `5e-SRD-Magic-Items-2024.json` (282 entries)
- `5e-SRD-Rule-Sections-2024.json` (154 entries)

Equipment and magic items are merged from two sources (see
`scripts/merge-srd-2024-canonical.mjs`): the markdown parse below, topped up
with [5e-bits/5e-database](https://github.com/5e-bits/5e-database)'s `2024`
branch — a structured, actively-maintained JSON port of the same SRD 5.2.1
(MIT-licensed tooling over OGL 1.0a content) that started shipping 2024 data
in 2026. Where both sources have an entry, 5e-bits wins (it carries richer
structure — weapon mastery, tool crafting/utilize DCs, armor don/doff times);
entries only the markdown parser found (mounts, vehicles, hirelings,
lifestyle expenses, aggregated magic-item variants like "+1/+2/+3 Weapon")
are kept as-is. 5e-bits doesn't have 2024 spells or rules-glossary data yet,
so those two stay markdown-only. Re-run the merge whenever 5e-bits adds more
2024 entries:

```sh
node scripts/merge-srd-2024-canonical.mjs
```

Character-builder corpus (consumed by the level-up + character creation flows
coming in phases 4–5):

- `5e-SRD-Classes-2024.json` (12 classes — Barbarian, Bard, Cleric, Druid, Fighter, Monk, Paladin, Ranger, Rogue, Sorcerer, Warlock, Wizard). Each has a 20-row level table, named feature descriptions, one subclass with its own level→feature unlocks, and (for casters) a spell list keyed by spell level.
- `5e-SRD-Species-2024.json` (9 species — Dragonborn, Dwarf, Elf, Gnome, Goliath, Halfling, Human, Orc, Tiefling).
- `5e-SRD-Backgrounds-2024.json` (4 backgrounds — Acolyte, Criminal, Sage, Soldier).
- `5e-SRD-Feats-2024.json` (17 feats across Origin / General / Fighting Style / Epic Boon categories).

The 2024 SRD only ships one subclass per class. No 2014 equivalents exist for classes/species/feats; the character-builder data is 2024-only by design.

Generated from the WotC SRD 5.2.1 markdown extract at
[downfallx/dnd-5e-srd-markdown](https://github.com/downfallx/dnd-5e-srd-markdown).
The parser lives at `scripts/parse-srd-2024.mjs` and produces JSON that matches
`src/data/types.ts`. Re-run it whenever the upstream markdown is refreshed:

```sh
# 1. Refresh the cached markdown
curl -sL https://raw.githubusercontent.com/downfallx/dnd-5e-srd-markdown/master/spells.md > /tmp/spells.md
curl -sL https://raw.githubusercontent.com/downfallx/dnd-5e-srd-markdown/master/magic-items.md > /tmp/magic.md
curl -sL https://raw.githubusercontent.com/downfallx/dnd-5e-srd-markdown/master/equipment.md > /tmp/equipment.md
curl -sL https://raw.githubusercontent.com/downfallx/dnd-5e-srd-markdown/master/rules-glossary.md > /tmp/rules.md
curl -sL https://raw.githubusercontent.com/downfallx/dnd-5e-srd-markdown/master/classes.md > /tmp/classes.md
curl -sL https://raw.githubusercontent.com/downfallx/dnd-5e-srd-markdown/master/character-origins.md > /tmp/origins.md
curl -sL https://raw.githubusercontent.com/downfallx/dnd-5e-srd-markdown/master/feats.md > /tmp/feats.md

# 2. Re-parse to src/data
node scripts/parse-srd-2024.mjs

# 3. Top up Equipment/Magic-Items with the 5e-bits canonical dataset
node scripts/merge-srd-2024-canonical.mjs
```

Classes/species/backgrounds/feats are markdown-only and intentionally a
subset of the printed SRD 5.2.1 — the free SRD itself only ships one
subclass per class, 4 backgrounds, and 17 feats (see WotC's SRD 5.2.1 for
what's excluded from the free release). Equipment and magic items are no
longer capped by the markdown parser's table-matching heuristics; see the
merge step above.

## How the app uses both editions

`srd.ts` exports each edition individually (`SPELLS_2014`, `SPELLS_2024`, …)
plus a deduped union (`SPELLS`, `EQUIPMENT`, …) where 2014 wins on slug
collisions so existing non-edition-aware consumers (homebrew, character sheet,
wiki index) keep their historical behavior. The Spells/Items/Rules pages and
the chat catalog filter by the campaign-level edition setting
(`campaignSettingsStore.srdEdition`, GM-controlled, default `'both'`).

Deep-link hashes (e.g. `/items#bag-of-holding`) always resolve against the
union — so a chat chip works even when the current edition filter would hide
the target.
