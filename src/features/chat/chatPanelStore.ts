import { create } from 'zustand';

type ChatPanelStore = {
  open: boolean;
  toggle: () => void;
  openPanel: () => void;
  close: () => void;
  /**
   * The whisper recipient currently locked in on the composer, by user_id.
   * Lives at the panel-store level (instead of local Composer state) so other
   * surfaces — e.g. clicking a member on the dashboard — can imperatively
   * start a whisper.
   */
  whisperTargetId: string | null;
  setWhisperTarget: (userId: string | null) => void;
};

export const useChatPanel = create<ChatPanelStore>((set) => ({
  open: false,
  toggle: () => set((s) => ({ open: !s.open })),
  openPanel: () => set({ open: true }),
  close: () => set({ open: false }),
  whisperTargetId: null,
  setWhisperTarget: (userId) => set({ whisperTargetId: userId }),
}));
