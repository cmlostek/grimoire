import { create } from 'zustand';

/**
 * v1.0.1: replaced the previous 5-accent / 6-background picker matrix with a
 * single dark/light mode toggle. Both modes share a blue accent — dark uses
 * the saturated Arcane blue (the original default), light uses a pale,
 * desaturated variant that pairs with off-white surfaces.
 */
export type Mode = 'dark' | 'light';

const MODE_KEY = 'grimoire:mode';

/** Accent ramp consumed by inline styles (var(--ac-*)) across the app. */
const ACCENTS: Record<Mode, { ac200: string; ac400: string; ac600: string; ac700: string; ac900: string }> = {
  dark:  { ac200: '#bae6fd', ac400: '#38bdf8', ac600: '#0284c7', ac700: '#0369a1', ac900: '#0c4a6e' },
  light: { ac200: '#1e3a8a', ac400: '#2563eb', ac600: '#3b82f6', ac700: '#60a5fa', ac900: '#dbeafe' },
};

function applyMode(mode: Mode) {
  const root = document.documentElement;
  const a = ACCENTS[mode];
  root.style.setProperty('--ac-200', a.ac200);
  root.style.setProperty('--ac-400', a.ac400);
  root.style.setProperty('--ac-600', a.ac600);
  root.style.setProperty('--ac-700', a.ac700);
  root.style.setProperty('--ac-900', a.ac900);
  // Toggle `light` class so CSS surface overrides in index.css can match.
  root.classList.toggle('light', mode === 'light');
  root.classList.toggle('dark', mode === 'dark');
}

// Migrate the old `grimoire:theme` key (which named one of five color themes)
// into the new binary mode. Any prior value collapses to 'dark' — the only
// real change is removing the picker UI from the sidebar.
function readInitialMode(): Mode {
  const v = localStorage.getItem(MODE_KEY);
  if (v === 'light' || v === 'dark') return v;
  return 'dark';
}

const _init = readInitialMode();
applyMode(_init);

interface ThemeState {
  mode: Mode;
  setMode: (m: Mode) => void;
  toggle: () => void;
}

export const useTheme = create<ThemeState>((set, get) => ({
  mode: _init,
  setMode: (mode) => {
    localStorage.setItem(MODE_KEY, mode);
    applyMode(mode);
    set({ mode });
  },
  toggle: () => {
    const next: Mode = get().mode === 'dark' ? 'light' : 'dark';
    get().setMode(next);
  },
}));
