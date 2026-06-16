import { create } from 'zustand';

type ChatPanelStore = {
  open: boolean;
  toggle: () => void;
  openPanel: () => void;
  close: () => void;
};

export const useChatPanel = create<ChatPanelStore>((set) => ({
  open: false,
  toggle: () => set((s) => ({ open: !s.open })),
  openPanel: () => set({ open: true }),
  close: () => set({ open: false }),
}));
