# D&D GM Screen

Browser-based GM screen for running D&D 5e games: dice, initiative, party, notes, maps, spell/item/shop browsers, stat blocks, homebrew, and SRD 5.1 rules + conditions reference.

## Requirements

- [Node.js](https://nodejs.org/) 18 or newer (ships with `npm`)

## Boot it up

From this directory:

```bash
npm install
npm run dev
```

Vite will print a local URL (usually `http://localhost:5173`) — open it in your browser.

All data (party, notes, shops, etc.) is saved to your browser's local storage, so refreshing keeps your state.

## Other commands

- `npm run build` — type-check and produce a production bundle in `dist/`
- `npm run preview` — serve the built bundle locally

## Tech

React 19 · Vite · TypeScript · Tailwind · Zustand · react-markdown · SRD 5.1 content
