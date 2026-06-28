import { create } from 'zustand';

/**
 * Per-user palette for the "Game Master" / "Co-GM" / "Player" role labels
 * that appear on the Dashboard, the member roster and the whisper picker.
 *
 * Personal preference only — stored in localStorage, never synced to other
 * players. Changing it tints the labels in the user's own view (e.g. so a
 * GM who plays in a campaign as a player can colour-code which slot they're
 * in across sessions).
 */
const KEY_GM = 'grimoire:role-color-gm';
const KEY_COGM = 'grimoire:role-color-cogm';
const KEY_PLAYER = 'grimoire:role-color-player';

export const DEFAULT_GM_COLOR = '#34d399'; // emerald-400
export const DEFAULT_COGM_COLOR = '#a78bfa'; // violet-400
export const DEFAULT_PLAYER_COLOR = '#38bdf8'; // sky-400

/** Convenience swatch palette surfaced in the picker UI. Includes the
 *  defaults plus a spread of other Tailwind 400-level hues so the user has
 *  visually distinct options without the picker turning into a colour
 *  wheel. */
export const ROLE_COLOR_SWATCHES = [
  '#34d399', // emerald
  '#38bdf8', // sky
  '#a78bfa', // violet
  '#f472b6', // pink
  '#fbbf24', // amber
  '#f87171', // red
  '#fb923c', // orange
  '#facc15', // yellow
  '#2dd4bf', // teal
  '#94a3b8', // slate
  '#fafafa', // off-white
];

function read(key: string, fallback: string): string {
  const v = localStorage.getItem(key);
  return v && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback;
}

interface RoleColorsState {
  gm: string;
  cogm: string;
  player: string;
  setRoleColor: (role: 'gm' | 'cogm' | 'player', color: string) => void;
  resetRoleColors: () => void;
}

export const useRoleColors = create<RoleColorsState>((set) => ({
  gm: read(KEY_GM, DEFAULT_GM_COLOR),
  cogm: read(KEY_COGM, DEFAULT_COGM_COLOR),
  player: read(KEY_PLAYER, DEFAULT_PLAYER_COLOR),
  setRoleColor: (role, color) => {
    const key = role === 'gm' ? KEY_GM : role === 'cogm' ? KEY_COGM : KEY_PLAYER;
    localStorage.setItem(key, color);
    set({ [role]: color } as Pick<RoleColorsState, 'gm' | 'cogm' | 'player'>);
  },
  resetRoleColors: () => {
    localStorage.removeItem(KEY_GM);
    localStorage.removeItem(KEY_COGM);
    localStorage.removeItem(KEY_PLAYER);
    set({ gm: DEFAULT_GM_COLOR, cogm: DEFAULT_COGM_COLOR, player: DEFAULT_PLAYER_COLOR });
  },
}));

/** Resolve a role string to the user's chosen colour, falling back to the
 *  default if the role isn't one of the three known values. */
export function roleColor(role: string | null | undefined, store: { gm: string; cogm: string; player: string }): string {
  if (role === 'gm') return store.gm;
  if (role === 'cogm') return store.cogm;
  return store.player;
}
