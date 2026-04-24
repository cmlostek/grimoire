# ⚔️ GM Screen
-- Built with Claude Opus 4.6 and Opus 4.7
A real-time, multiplayer GM companion for running **D&D 5e** campaigns in the browser. Built for game masters who want a single, fast screen that handles everything — notes, party tracking, combat, maps, spells, shops, and more — with live sync across all players at the table.

> **Live demo:** [your-deployment.vercel.app](https://your-deployment.vercel.app)

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Supabase Setup](#supabase-setup)
  - [Local Development](#local-development)
  - [Deploying to Vercel](#deploying-to-vercel)
- [Note Syntax Reference](#note-syntax-reference)
- [Multiplayer & Permissions](#multiplayer--permissions)
- [Project Structure](#project-structure)

---

## Features

### 📓 Notes
A full campaign journal with live Obsidian-style markdown editing. Syntax markers hide when you move the cursor away, leaving only clean rendered text.

- **Hierarchical folders** with colour coding and per-folder player visibility controls
- **Per-note icons** — 16 thematic icons (town, dungeon, ship, skull, crown…) in themed colours
- **Three permission levels** per note: GM Only · View Only (blue eye) · Editable (green eye)
- **Custom decorator syntax** for tagging content inline (locations, milestones, artifacts, secrets — see [Note Syntax Reference](#note-syntax-reference))
- **Wiki links** `[[Note Name]]` with autocomplete and broken-link indicators
- **Secrets** `{{hidden text}}` rendered as interactive lock/reveal cards; players only see revealed ones
- **Inline dice rolls** `$1d20 + 5$` — click to roll directly into the dice panel
- **Search & sort** — alphabetical or chronological sidebar ordering

### 🎲 Dice
- Standard dice: d4, d6, d8, d10, d12, d20, d100
- **Advantage / Disadvantage** — rolls 2d20 and shows the dropped die
- Modifier input with +/− buttons
- Custom **roll labels** for tracking what each roll was for
- Natural 20 / Natural 1 detection with colour coding
- **Quick Dice panel** — compact float accessible from any screen

### ⚔️ Initiative Tracker
- Add combatants with name, initiative, HP, and AC
- Auto-sort by initiative roll
- Advance turns with round counter
- Adjust HP inline during combat
- PC flag to distinguish players from monsters

### 🗺️ Map Board
- Upload any background image as a battle map
- Toggle grid overlay with configurable cell size
- **Tokens** with emoji, custom colour rings, and player labels
- **Area-of-effect shapes** — circles, squares, cones with adjustable size and colour
- **Ruler** for measuring distances
- Drag-and-drop token positioning

### 👥 Party
- Add characters manually or **import from D&D Beyond JSON**
- Track HP (current / max / temp), AC, initiative bonus, passive perception
- Full ability scores, saving throws, skills, languages, and features
- Players can claim and edit their own character; GMs can edit all
- **Hover cards** on `@{Player Name}` references in notes — see full stats inline

### 📚 Rules Reference
- Full **SRD 5.1** rules browser with search
- **Conditions** reference (poisoned, charmed, stunned…)
- Read-only reference; always available as a sidebar

### 🧙 Homebrew
- Create custom **monsters, items, and spells**
- Full stat block editor with traits, actions, bonus/legendary actions
- Mark homebrew as campaign-visible to share with players
- Clone any entry as a template

### 🛒 Shops
- Build named merchant inventories from any SRD or homebrew item
- Set per-item stock and price
- **Random stock generator** — fills a shop with 8–16 random items at randomised quantities
- Search items within the active shop

### 🔮 Spells & Items Browsers
- 300+ SRD spells filterable by level, school, ritual, and concentration
- Full equipment and magic item tables, sortable by rarity
- Homebrew appears inline alongside SRD content

### 🎙️ Transcription
- **Speech-to-text** session journal using the browser Web Speech API
- Real-time interim and final transcript display
- Link recordings directly to campaign notes
- Transcript history with timestamps and search

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| **Framework** | React 19 | Concurrent rendering, server components future-proofing |
| **Build** | Vite 8 + TypeScript 6 | Sub-second HMR, strict type checking |
| **Styling** | Tailwind CSS 3 | Utility-first, zero dead CSS in production |
| **State** | Zustand 5 | Minimal boilerplate, per-feature stores with `loadForCampaign` pattern |
| **Backend** | Supabase | Postgres + Row-Level Security + real-time `postgres_changes` subscriptions |
| **Auth** | Supabase Auth | Email/password, persistent sessions |
| **Editor** | CodeMirror 6 | Extensible token-based live markdown rendering (Obsidian-style) |
| **Markdown** | react-markdown + remark-gfm | GFM tables, task lists, strikethrough |
| **Routing** | React Router 7 | SPA routing with Vercel rewrite fallback |
| **Icons** | Lucide React | Consistent 2px-stroke SVG icon set |
| **Deployment** | Vercel | Zero-config, automatic HTTPS, SPA rewrite |

### Architecture notes

- **Feature-store pattern:** each feature (`notes`, `party`, `map`…) has a co-located Zustand store with a `loadForCampaign(campaignId)` action. The active campaign ID is stored in a root session store; switching campaigns triggers all feature stores to reload.
- **Row-Level Security:** all Supabase tables enforce RLS so players can only read/write data belonging to their campaign and matching their role (`gm` or `player`).
- **Realtime:** each store subscribes to `postgres_changes` for its table, filtered by `campaign_id`. A `useVisibilityReload` hook re-triggers `loadForCampaign` on tab focus to recover from stale WebSocket connections.
- **Live editor:** the Notes editor is built on CodeMirror 6 `ViewPlugin` + `WidgetType`. Markdown syntax markers are hidden via `Decoration.replace()` when the cursor is off that line, and custom decorator tokens (`@{…}`, `{{…}}`, `[[…]]`, etc.) are similarly hidden off-cursor, revealing only the rendered content.

---

## Getting Started

### Prerequisites

- **Node.js 18+** — [nodejs.org](https://nodejs.org/)
- **npm** (ships with Node) or your preferred package manager
- A **Supabase project** (free tier is fine) — [supabase.com](https://supabase.com/)

### Supabase Setup

#### 1. Create a project

Sign in to [app.supabase.com](https://app.supabase.com), create a new project, and note your **Project URL** and **anon public key** from *Settings → API*.

#### 2. Run the schema

Open the **SQL Editor** in your Supabase dashboard. Paste the contents of [`supabase/schema.sql`](supabase/schema.sql) and run each numbered section in order. The schema creates:

| Table | Purpose |
|---|---|
| `campaigns` | Campaign names and join codes |
| `campaign_members` | User ↔ campaign membership with `gm` / `player` role |
| `notes` | Campaign notes with visibility and edit-permission flags |
| `note_folders` | Hierarchical folder structure |
| `party_members` | Character data per campaign |
| `initiative_entries` | Combat tracker state |
| `map_tokens` | Map token positions and properties |
| `homebrew_monsters` | Custom monsters |
| `homebrew_items` | Custom items |
| `homebrew_spells` | Custom spells |
| `transcripts` | Session speech-to-text recordings |

#### 3. Optional: pending migrations

The file [`supabase/migrations/20260422_campaign_settings_and_note_columns.sql`](supabase/migrations/20260422_campaign_settings_and_note_columns.sql) adds two columns that enable cross-device syncing of features added after the initial schema:

```sql
-- Adds per-note icon and player-editable flag
ALTER TABLE notes ADD COLUMN IF NOT EXISTS icon TEXT;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS player_editable BOOLEAN DEFAULT FALSE;

-- Adds campaign-level settings (folder visibility, page hiding)
CREATE TABLE IF NOT EXISTS campaign_settings ( … );
```

Run this migration in the SQL Editor if you are starting from a fresh database (the schema.sql will be updated to include these in a future release).

#### 4. Enable email auth

In your Supabase dashboard go to *Authentication → Providers* and make sure **Email** is enabled. For local development, disable email confirmation under *Authentication → Settings* so you can sign up immediately without checking email.

### Local Development

```bash
# 1. Clone the repo
git clone https://github.com/cmlostek/dnd-gm.git
cd dnd-gm

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env.local
```

Edit `.env.local` and fill in your Supabase credentials:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

```bash
# 4. Start the dev server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Create an account, then create a campaign. Share the 6-character **join code** with your players so they can sign up and join.

**Other commands:**

```bash
npm run build    # Type-check + production bundle → dist/
npm run preview  # Serve the production bundle locally
```

### Deploying to Vercel

1. Push the repo to GitHub.
2. Import the project at [vercel.com/new](https://vercel.com/new).
3. Under **Environment Variables**, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Click **Deploy**. The [`vercel.json`](vercel.json) rewrite (`/* → /index.html`) is already configured for SPA routing.

Subsequent pushes to `main` deploy automatically.

---

## Note Syntax Reference

The note editor supports custom inline syntax on top of standard markdown. Syntax markers are **hidden when your cursor is on a different line** — move the cursor to a line to see and edit the raw syntax.

### Markdown (standard)

```markdown
# Heading 1
## Heading 2
### Heading 3

**bold**   *italic*   `inline code`

- Bullet list
1. Ordered list

> Blockquote

| Col A | Col B |
|-------|-------|
| cell  | cell  |
```

### Custom Decorators

| Syntax | Renders as | Use for |
|--------|-----------|---------|
| `&{The Hall of Noon}` | 🟠 Orange badge | Locations — click to open the matching note |
| `@{Aria Swiftwind}` | 🟢 Green badge | Player refs — hover to see character stats |
| `?{The heir must be found}` | 🔴 Pink badge | Plot dependencies / conditions |
| `!{The Siege Begins}` | 🔵 Blue badge | Milestone events |
| `${The Sunblade}` | 🟢 Green badge | Artifacts & key items |
| `%%Only I can see this%%` | ◽ Gray italic | GM-only inline comments |
| `[[Goblin King]]` | 🔗 Blue underline | Wiki link to another note |
| `$1d20 + 5$` | 🎲 Dice chip | Click-to-roll inline formula |

### Secrets

```
{{This text is hidden from players until revealed}}
{{!This text is already revealed to players}}
```

Secrets render as interactive cards in the preview. As GM you can click **Reveal / Hide** to toggle player visibility. Players only ever see revealed secrets — locked ones are invisible to them entirely.

Secrets can contain **markdown formatting** including headings, bold, and bullet lists.

### Wiki Links

Type `[[` to open autocomplete — start typing a note name and select from the dropdown. Broken links (target note doesn't exist) render in gray. Clicking a valid link navigates directly to that note.

---

## Multiplayer & Permissions

### Campaigns and roles

Every user belongs to one or more campaigns. Within each campaign they are either:

| Role | Can do |
|---|---|
| **GM** | Everything — create/delete notes & folders, control map, manage party, configure shops, set permissions |
| **Player** | See notes marked *View Only* or *Editable*, edit notes marked *Editable*, claim and edit their own party character, view the map |

### Joining a campaign

1. GM creates a campaign → receives a 6-character join code (e.g. `X4K9MR`)
2. Players sign up / sign in, click **Join campaign**, enter the code
3. Players choose a display name for that campaign

### Note permissions

Each note has one of three visibility levels, shown as an icon in the sidebar:

| Icon | Level | Players see | Players can edit |
|------|-------|------------|-----------------|
| *(none)* | GM Only | ✗ | ✗ |
| 🔵 Blue eye | View Only | ✓ | ✗ |
| 🟢 Green eye | Editable | ✓ | ✓ |

Click the permission badge in the note header to cycle through levels.

### Real-time sync

All data syncs in real time via Supabase `postgres_changes` subscriptions. Changes made by the GM (moving a map token, updating a party member's HP, revealing a secret) appear instantly on all connected player screens — no refresh needed.

---

## Project Structure

```
src/
├── features/
│   ├── dice/          # Dice roller + quick-dice panel + store
│   ├── homebrew/      # Custom monsters, items, spells
│   ├── initiative/    # Combat tracker
│   ├── items/         # SRD + homebrew item browser
│   ├── map/           # Tactical map board
│   ├── notes/         # Note editor, folders, wiki, decorators
│   │   ├── LiveEditor.tsx      # CodeMirror 6 live markdown editor
│   │   ├── decorators.ts       # remark plugin for note syntax
│   │   ├── notesStore.ts       # Zustand store + Supabase sync
│   │   └── wikiIndex.ts        # Wiki link index builder
│   ├── party/         # Character roster
│   ├── rules/         # SRD 5.1 reference
│   ├── session/       # Auth, campaigns, join flow
│   ├── shops/         # Merchant inventory manager
│   ├── spells/        # SRD + homebrew spell browser
│   └── transcription/ # Speech-to-text session notes
├── hooks/
│   └── useVisibilityReload.ts  # Re-fetch on tab focus
├── lib/
│   └── supabase.ts             # Supabase client singleton
├── data/                       # SRD 5.1 JSON (spells, items, monsters, rules)
└── index.css                   # Global styles + markdown + decorator classes
supabase/
├── schema.sql                  # Full database schema with RLS
└── migrations/                 # Incremental schema changes
```
