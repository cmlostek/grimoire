import { create } from 'zustand';

/**
 * Theming has two independent axes:
 *   - `mode`  — dark / light surface palette (the html.light overrides in
 *               index.css do the heavy lifting for light).
 *   - `theme` — accent colour, one of five. In dark mode this swaps both the
 *               accent ramp (var(--ac-*)) and a per-colour surface tint (the
 *               `theme-<colour>` class overrides in index.css). The colour
 *               themes are a dark-mode-only feature, so picking one implies
 *               dark mode; light mode always uses the pale-blue accent.
 */
export type Mode = 'dark' | 'light';
export type Theme = 'blue' | 'red' | 'green' | 'purple' | 'teal';

/** Ordered list with display labels + swatch colours for the Settings picker. */
export const THEMES: { id: Theme; label: string; swatch: string }[] = [
  { id: 'blue', label: 'Blue', swatch: '#38bdf8' },
  { id: 'red', label: 'Red', swatch: '#f87171' },
  { id: 'green', label: 'Green', swatch: '#34d399' },
  { id: 'purple', label: 'Purple', swatch: '#a78bfa' },
  { id: 'teal', label: 'Teal', swatch: '#2dd4bf' },
];

const THEME_IDS: Theme[] = ['blue', 'red', 'green', 'purple', 'teal'];

const MODE_KEY = 'grimoire:mode';
const THEME_KEY = 'grimoire:colorTheme';

type Ramp = { ac200: string; ac400: string; ac600: string; ac700: string; ac900: string };

/** Dark-mode accent ramps consumed by inline styles (var(--ac-*)) app-wide. */
const DARK_ACCENTS: Record<Theme, Ramp> = {
  blue:   { ac200: '#bae6fd', ac400: '#38bdf8', ac600: '#0284c7', ac700: '#0369a1', ac900: '#0c4a6e' },
  red:    { ac200: '#fecaca', ac400: '#f87171', ac600: '#dc2626', ac700: '#b91c1c', ac900: '#7f1d1d' },
  green:  { ac200: '#a7f3d0', ac400: '#34d399', ac600: '#059669', ac700: '#047857', ac900: '#064e3b' },
  purple: { ac200: '#ddd6fe', ac400: '#a78bfa', ac600: '#7c3aed', ac700: '#6d28d9', ac900: '#4c1d95' },
  teal:   { ac200: '#99f6e4', ac400: '#2dd4bf', ac600: '#0d9488', ac700: '#0f766e', ac900: '#134e4b' },
};

/** Light mode keeps the single pale-blue accent it shipped with. */
const LIGHT_ACCENT: Ramp = { ac200: '#1e3a8a', ac400: '#2563eb', ac600: '#3b82f6', ac700: '#60a5fa', ac900: '#dbeafe' };

function apply(mode: Mode, theme: Theme) {
  const root = document.documentElement;
  const a = mode === 'light' ? LIGHT_ACCENT : DARK_ACCENTS[theme];
  root.style.setProperty('--ac-200', a.ac200);
  root.style.setProperty('--ac-400', a.ac400);
  root.style.setProperty('--ac-600', a.ac600);
  root.style.setProperty('--ac-700', a.ac700);
  root.style.setProperty('--ac-900', a.ac900);
  root.classList.toggle('light', mode === 'light');
  root.classList.toggle('dark', mode === 'dark');
  // Surface-tint class drives the per-theme background overrides in index.css.
  // Only applied in dark mode; blue is neutral slate, so it needs no class.
  for (const t of THEME_IDS) {
    root.classList.toggle(`theme-${t}`, mode === 'dark' && theme !== 'blue' && t === theme);
  }
}

function readInitialMode(): Mode {
  const v = localStorage.getItem(MODE_KEY);
  return v === 'light' || v === 'dark' ? v : 'dark';
}
function readInitialTheme(): Theme {
  const v = localStorage.getItem(THEME_KEY);
  return THEME_IDS.includes(v as Theme) ? (v as Theme) : 'blue';
}

const _mode = readInitialMode();
const _theme = readInitialTheme();
apply(_mode, _theme);

interface ThemeState {
  mode: Mode;
  theme: Theme;
  setMode: (m: Mode) => void;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

export const useTheme = create<ThemeState>((set, get) => ({
  mode: _mode,
  theme: _theme,
  setMode: (mode) => {
    localStorage.setItem(MODE_KEY, mode);
    apply(mode, get().theme);
    set({ mode });
  },
  setTheme: (theme) => {
    // Colour themes are dark-mode only — selecting one implies dark mode.
    localStorage.setItem(THEME_KEY, theme);
    localStorage.setItem(MODE_KEY, 'dark');
    apply('dark', theme);
    set({ theme, mode: 'dark' });
  },
  toggle: () => {
    const next: Mode = get().mode === 'dark' ? 'light' : 'dark';
    get().setMode(next);
  },
}));
