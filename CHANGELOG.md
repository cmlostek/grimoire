# Changelog

All notable changes to Grimoire are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.0.1] - 2026-04-24

### Fixed
- **Multiline secrets**: Live editor now correctly highlights `{{secret blocks}}` that span multiple lines — previously the highlight would stop at the first newline
- **Number inputs**: HP, Max HP, and AC fields in the initiative tracker no longer snap to `0` when cleared mid-type; values are committed only on blur
- **Initiative sort**: Sorting combatants by initiative now correctly awaits all Supabase turn-order updates before updating local state
- **Silent add failures**: Adding a combatant or NPC now surfaces a descriptive error message if the Supabase operation fails, rather than silently doing nothing
- **Folder color picker**: Color swatches are now rendered via a portal so they are never clipped by the sidebar's scroll container, even when a folder is at the bottom of a long list

### Updated
- **Map tool auto-reset**: After placing a token or finishing a shape (circle, square, cone), the active tool automatically returns to the cursor/select mode — no more manually switching back
- **Dice roll sound**: Rolling dice now plays a short procedural rattle sound via the Web Audio API; requires no audio files and fails silently if audio is unavailable
- **Shop icons**: Each shop can now be assigned a type icon (General, Weapons, Alchemy, Exchange, Scrolls, Armor, Jeweler, Goods) — hover a shop in the sidebar to change it
- **Shop archiving**: Shops can be archived (hidden) individually using the eye-off icon on hover; a toggle in the sidebar header reveals or hides archived shops
- **Background color tinting**: The chosen background color now tints all structural surfaces (cards, inputs, sidebars) and borders throughout the app, creating a fully cohesive color palette
- **Note icon color**: Note icons now have a separate color picker (a small dot below the icon in the editor header) independent of the icon type — 12 preset colors with a reset option; persisted locally and to DB via migration `20260424_note_icon_color.sql`
- **Delete campaigns**: GMs can now permanently delete a campaign from the campaign picker — hover any GM campaign to reveal the delete button; requires confirmation before proceeding

---

## [1.0.0] - 2026-04-20

### Added
- **Grimoire rebrand**: Renamed from "GM Screen" to "Grimoire" throughout the app and title
- **5-theme accent system**: Grimoire (violet), Arcane (sky), Ember (amber), Thornwood (emerald), Bloodmoon (rose) — persisted to localStorage, applied immediately on load
- **NPC tracker**: Full NPC management panel with name, faction, status, location, notes, and icon; GM/player visibility model backed by Supabase RLS (unrevealed NPCs are invisible at the DB level)
- **Initiative tracker**: 15 standard D&D 5e conditions with optional round countdowns; conditions tick down automatically at end of each round; realtime sync via Supabase
- **Realtime multiplayer**: Notes, Party, Map, Transcription, and Homebrew all sync live across connected players via Supabase `postgres_changes`
