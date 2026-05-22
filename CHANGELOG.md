# Changelog

All notable changes to Grimoire are documented in this file. Format based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning follows
[SemVer](https://semver.org/).

## [1.0.1] — 2026-05-21

### Added

- **Per-user note permissions.** Replaced the tri-state visibility cycle
  (GM only / View only / Editable) with a per-user view/edit matrix. The note
  author and GM always have full access; the GM (or author) can grant view
  and/or edit independently to each player. Quick presets (GM only, Party
  view, Party edit) stamp the matrix in one click. Edit implies view.
- **Explicit Save button for notes.** Title and body changes are now
  buffered locally and flushed to Supabase on Save click, which broadcasts
  to other viewers via realtime. Sidebar shows an unsaved-changes dot next
  to dirty notes.
- **Map ping tool.** Click anywhere on the map (available to GM and
  players) to drop a 2-second animated pulse visible to everyone viewing
  the map. Broadcasts via Supabase Realtime — ephemeral, not persisted.
- **Map viewer presence.** Avatar stack in the top-right of the map shows
  who else currently has the map open, with amber initials for GM and sky
  for players, and a white ring on your own avatar.
- **Collapsible sidebar.** A toggle in the sidebar header shrinks the
  aside from 224 px to 56 px, hiding labels and the join-code row, and
  collapsing every footer row to an icon-only button with the label as a
  tooltip. State persisted across reloads.
- **Dark / Light mode toggle.** Replaced the 5-accent and 6-background
  color pickers with a single Sun/Moon toggle. Dark uses the saturated
  Arcane blue (the original default); light uses a pale blue accent paired
  with slate-100 surfaces.
- **NPC stat blocks.** Each NPC now carries a 5e-style stat block
  (creature type, AC, HP, hit dice, speed, ability scores, skills, senses,
  languages, damage/condition immunities, CR, traits, actions). GM gets
  an inline editor; players see a formatted read-only card. Visibility is
  a separate flag from the existing "visible to players" gate — the GM
  can reveal an NPC while keeping their stats hidden.
- **Rules panel — character-creation chapters.** Bundled nine new SRD 5.1
  sections covering Step-by-Step Character Creation, Ability Score
  Generation, Races (Overview), Classes (Overview), Backgrounds,
  Alignment & Personality, Equipment & Starting Wealth, Levels and
  Advancement, and Multiclassing. Total sections: 33 → 42.

### Fixed

- **@PlayerName hover tooltip.** The CodeMirror decorator marks the whole
  `@{Name}` token, so the hover handler's lookup was comparing
  `"@{Name}"` against the bare member name and never matching. Strip the
  wrapper before lookup. Also fixed Notes.tsx not loading the party store
  on mount — landing on /notes from a hard reload meant the LiveEditor
  saw an empty party array.
- **Initiative tracker conditions not counting down.** End-of-round only
  persisted updates when the conditions list length changed (i.e., a
  condition expired). For still-active conditions (Poisoned 3 → 2 →
  1) the decrement was computed but never saved, freezing the counter
  visually until expiry. Now persists on any change.
- **Map tokens couldn't be placed at narrow viewport widths.** The map
  SVG used `w-full h-full` which collapsed to 0×0 once the sidebar
  consumed the available width, intercepting clicks. SVG now uses
  `position: absolute; inset: 0` against the existing relative parent.

### Changed

- The 5-color accent picker (grimoire / arcane / ember / thornwood /
  bloodmoon) and the 6-preset background-color picker are gone. Existing
  user theme selections fall back to dark mode silently — no migration
  needed.

### Bug fixes during the release

These didn't ship as user-visible bugs in 1.0 — they were regressions
introduced and resolved within the 1.0.1 release window — but they're
recorded here for posterity.

- RLS recursion between `notes_select` and `note_permissions_select` was
  returning 500 from PostgREST and breaking all note loading. Fixed by
  routing the `note_permissions` policy through a SECURITY DEFINER helper
  (`note_author(uuid)`) so it never reads from `notes` directly.
- React error #185 (max update depth exceeded) on every page that used
  the new Zustand selectors, caused by `s.permissions[id] ?? []`
  returning a fresh empty array each call. Fixed by routing through a
  module-level `EMPTY_PERMS` constant.
- The Share popover closed itself on the same `mousedown` that opened it.
  Outside-click listener now attaches on the next tick.

### Database migrations

Run these in the Supabase SQL editor in order:

1. `supabase/migrations/20260521_note_permissions.sql` — new
   `note_permissions` table with RLS + backfill from the legacy
   `visible_to_players` / `player_editable` columns.
2. `supabase/migrations/20260521_note_permissions_fix_recursion.sql` —
   hotfix for the RLS recursion described above.
3. `supabase/migrations/20260521_npc_stat_blocks.sql` — adds
   `stat_block` (JSONB) and `stat_block_visible` (boolean) to `npcs`.

The application falls back gracefully on rows that pre-date each
migration; you can run them at any time after pulling 1.0.1.

## [1.0.0] — Initial release

Multiplayer GM companion for D&D 5e: notes, party tracker, initiative,
map board, NPC tracker, spells, items, shop, statblocks, homebrew,
session transcription, and SRD rules. Supabase-backed, real-time across
all players in a campaign.

[1.0.1]: https://github.com/cmlostek/grimoire/releases/tag/v1.0.1
[1.0.0]: https://github.com/cmlostek/grimoire/releases/tag/v1.0.0
