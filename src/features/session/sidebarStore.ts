import { create } from 'zustand';

/**
 * Per-user sidebar preferences (transient between sessions only for the open
 * state; the auto-expand toggle is persisted to localStorage).
 *
 * When `hoverExpand` is on, the sidebar grows from the 56px icon rail to its
 * full width on mouseover / focus. When off, the sidebar stays narrow and the
 * user navigates via icons + tooltips only.
 */
const HOVER_KEY = 'grimoire:sidebar-hover-expand';

function readInitial(): boolean {
  const v = localStorage.getItem(HOVER_KEY);
  // Default on — matches the behaviour shipped with the rail.
  return v === null ? true : v === '1';
}

interface SidebarState {
  hoverExpand: boolean;
  setHoverExpand: (v: boolean) => void;
}

export const useSidebar = create<SidebarState>((set) => ({
  hoverExpand: readInitial(),
  setHoverExpand: (v) => {
    localStorage.setItem(HOVER_KEY, v ? '1' : '0');
    set({ hoverExpand: v });
  },
}));
