import { create } from 'zustand';

type QuickDiceStore = {
  open: boolean;
  toggle: () => void;
  close: () => void;
};

export const useQuickDice = create<QuickDiceStore>((set) => ({
  open: false,
  toggle: () => set((s) => ({ open: !s.open })),
  close: () => set({ open: false }),
}));
