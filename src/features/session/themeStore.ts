import { create } from 'zustand';

export type Theme = 'grimoire' | 'arcane' | 'ember' | 'thornwood' | 'bloodmoon';

const THEME_KEY = 'grimoire:theme';

export const THEMES: Record<Theme, { label: string; swatch: string; ac200: string; ac400: string; ac600: string; ac700: string; ac900: string }> = {
  grimoire:  { label: 'Grimoire',  swatch: '#a78bfa', ac200: '#ddd6fe', ac400: '#a78bfa', ac600: '#7c3aed', ac700: '#6d28d9', ac900: '#2e1065' },
  arcane:    { label: 'Arcane',    swatch: '#38bdf8', ac200: '#bae6fd', ac400: '#38bdf8', ac600: '#0284c7', ac700: '#0369a1', ac900: '#0c4a6e' },
  ember:     { label: 'Ember',     swatch: '#fbbf24', ac200: '#fde68a', ac400: '#fbbf24', ac600: '#d97706', ac700: '#b45309', ac900: '#451a03' },
  thornwood: { label: 'Thornwood', swatch: '#34d399', ac200: '#a7f3d0', ac400: '#34d399', ac600: '#059669', ac700: '#047857', ac900: '#064e3b' },
  bloodmoon: { label: 'Bloodmoon', swatch: '#fb7185', ac200: '#fecdd3', ac400: '#fb7185', ac600: '#e11d48', ac700: '#be123c', ac900: '#4c0519' },
};

function applyTheme(theme: Theme) {
  const t = THEMES[theme];
  const s = document.documentElement.style;
  s.setProperty('--ac-200', t.ac200);
  s.setProperty('--ac-400', t.ac400);
  s.setProperty('--ac-600', t.ac600);
  s.setProperty('--ac-700', t.ac700);
  s.setProperty('--ac-900', t.ac900);
}

const _init = (localStorage.getItem(THEME_KEY) as Theme | null) ?? 'grimoire';
applyTheme(_init);

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

export const useTheme = create<ThemeState>((set) => ({
  theme: _init,
  setTheme: (theme) => {
    localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme);
    set({ theme });
  },
}));
