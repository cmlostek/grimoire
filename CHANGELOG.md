# Changelog

All notable changes to Grimoire are documented in this file. Format based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning follows
[SemVer](https://semver.org/).

## [1.0.2] — 2026-05-27

A light-mode contrast pass. Dark mode shipped first and most surfaces
hard-coded shades tuned for a dark backdrop; flipping to light exposed a
long tail of unreadable elements. Every fix below is scoped to
`html.light` (or routed through a new mode-aware CSS variable) and
leaves dark mode untouched.

### Fixed

- **Disabled buttons (Sign in, Roll).** Tailwind's `disabled:` variants
  compile to their own selectors, so the existing `.bg-slate-800` light-
  mode override didn't catch `disabled:bg-slate-800` — the buttons
  rendered as dark slate with dark-grey text. Added matching
  `disabled:` overrides.
- **Sidebar nav active row.** The selected page used `bg-slate-800` +
  `var(--ac-200)`, which in light mode produced washed-out blue on a
  barely-tinted background. New `--nav-active-bg` / `--nav-active-fg`
  CSS variables flip to dark slate text on a pale-blue fill in light
  mode; dark mode keeps the original slate-800 + sky-200.
- **`bg-slate-700` "active" pills.** NPC status filter pills, the icon
  picker, the quick-dice toggle, and the auth tabs all use
  `bg-slate-700` for the selected state — left dark in the original
  light-mode pass, producing dark-on-dark with our darkened text.
  Remapped `.bg-slate-700` (and the hover variant) to `#cbd5e1`.
- **Active auth tab text.** "Sign in" / "Create account" labels used
  `--ac-200` for the active color, which was too pale on the pale-blue
  tab tint. New `--auth-tab-active-fg` variable darkens it to slate-800
  in light mode without touching the sidebar nav's use of `--ac-200`.
- **`PageHeader` strip.** The page header used `bg-slate-900/50`, an
  opacity variant Tailwind compiles to its own class that escaped the
  base `.bg-slate-900` override and rendered as a dull grey band. Made
  `bg-slate-900/50` and `bg-slate-900/40` transparent in light mode so
  the header blends into the panel.
- **Markdown tables in Rules.** `.markdown-body th` had a hard-coded
  dark-slate fill; combined with our darkened markdown body text, the
  Rules charts rendered as dark text on dark cells. Flipped the table
  chrome (th bg, td/th borders, hr, h1 underline, link color) to light
  values.
- **CodeMirror text selection.** Highlighting note text used a 50%-alpha
  navy that bled into the darkened editor text. Selection background
  flips to a pale sky (`#bae6fd`) in light mode.
- **Note decorator dark-text variants.** Every decorator class
  (`note-loc`, `note-dep`, `note-milestone`, `note-link`, `note-dice`,
  `note-artifact`, plus the secret-block chrome and `.csw-*` widget
  parts) was using a 300-level pastel tuned for dark backgrounds. Added
  `html.light` overrides that drop each one to the 700/800 shade of its
  hue, so the alpha-tinted background still reads as "the X color" but
  the text is legible on the white note canvas. Both rendered markdown
  (`.note-*`) and the live editor (`.cm-d-*` / `.cm-secret-widget`) are
  covered.
- **Initiative tracker cards.** The active-combatant row and "Now
  Acting" summary card used `color-mix(..., #0f172a)` to tint
  themselves with the accent, hardcoding the dark base. In light mode
  the blend still produced a near-black surface that swallowed the
  newly-darkened text. Routed through a new `--surface-elev` variable
  (slate-900 in dark, white in light) so both surfaces flip to a pale
  accent wash.
- **`@{Player}` mention color.** Pale green-300 mention text washed
  out on the light surface. Routed through `--deco-player-fg`
  (green-300 dark / green-800 light); both the CodeMirror token and
  the markdown render path consume it.
- **Note editor surface.** The CodeMirror editor baked its background,
  text, heading, and inline-code colors into the JS theme so the
  light-mode CSS layer couldn't reach them — the editor stayed dark on
  an otherwise light page. Routed those five values through CSS
  variables (`--editor-bg`, `--editor-fg`, `--editor-heading`,
  `--editor-code-bg`, `--editor-code-fg`) so the editor flips with the
  app without a re-mount.
- **Sky-tinted accent text.** Party cards and other surfaces used
  `text-sky-200` / `text-sky-300` for character names and stat values;
  the previous light-mode surface overrides only touched `text-slate-*`,
  so the pale sky was effectively unreadable on the slate-100 panel.
  Overrode `text-sky-{50,100,200,300}` to slate-900 in light mode, and
  `text-sky-400` (plus hovers) to a slightly bluer slate (`#1e3a8a`)
  so the accent character is preserved without losing legibility.

### Changed

- **Artifact decorator color.** Switched from green (`#86efac` / `#166534`)
  to pink (`#f9a8d4` dark / `#9d174d` light). Green was already used by
  `@{player}` mentions, so the two read as the same color class at a
  glance — pink keeps the "item" decorator visually distinct.
- **Roll button text.** The Dice page Roll button used `text-slate-950`
  on its sky-700 fill, rendering as near-black on dark blue in both
  modes. Switched to `text-white` for direct contrast.
- **Switch-campaign icon.** The sidebar footer "Switch campaign" button
  shared the `LogOut` icon with "Sign out", making them visually
  identical. Swapped in `ArrowLeftRight` and dropped the rose hover
  tint — the action is non-destructive (it returns to the campaign
  picker).

### Notes

No database migrations and no schema changes. All edits are CSS variable
plumbing or TSX className/icon swaps; deploy is a straight `vercel
--prod` after pulling main.

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

[1.0.2]: https://github.com/cmlostek/grimoire/releases/tag/v1.0.2
[1.0.1]: https://github.com/cmlostek/grimoire/releases/tag/v1.0.1
[1.0.0]: https://github.com/cmlostek/grimoire/releases/tag/v1.0.0
