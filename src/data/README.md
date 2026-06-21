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
- `5e-SRD-Equipment-2024.json` (167 entries)
- `5e-SRD-Magic-Items-2024.json` (258 entries)
- `5e-SRD-Rule-Sections-2024.json` (154 entries)

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
```

The 2024 dataset is intentionally a subset of the printed SRD 5.2.1 — for
example, generic crafting tools and trade goods aren't enumerated as discrete
items in the markdown source, so they don't appear in the equipment list.

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
