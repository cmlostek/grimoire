import { create } from 'zustand';
import { supabase } from '../../lib/supabase';

export type Transcript = {
  id: string;
  campaign_id: string;
  note_id: string | null;
  started_at: string;
  ended_at: string | null;
  body: string;
};

type TranscriptionState = {
  transcripts: Transcript[];
  loaded: boolean;
  error: string | null;

  loadForCampaign: (campaignId: string) => Promise<void>;
  createTranscript: (campaignId: string, body: string, noteId: string | null) => Promise<string | null>;
  deleteTranscript: (id: string) => Promise<void>;
  linkToNote: (id: string, noteId: string | null) => Promise<void>;
};

export const useTranscripts = create<TranscriptionState>((set, get) => ({
  transcripts: [],
  loaded: false,
  error: null,

  loadForCampaign: async (campaignId) => {
    set({ loaded: false, error: null });
    const { data, error } = await supabase
      .from('transcripts')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('started_at', { ascending: false });
    if (error) {
      set({ error: error.message, loaded: true });
      return;
    }
    set({ transcripts: (data ?? []) as Transcript[], loaded: true });
  },

  createTranscript: async (campaignId, body, noteId) => {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('transcripts')
      .insert({
        campaign_id: campaignId,
        body,
        note_id: noteId,
        started_at: now,
        ended_at: now,
      })
      .select()
      .single();
    if (error || !data) {
      set({ error: error?.message ?? 'Failed to save transcript' });
      return null;
    }
    set((s) => ({ transcripts: [data as Transcript, ...s.transcripts] }));
    return (data as Transcript).id;
  },

  deleteTranscript: async (id) => {
    const prev = get().transcripts;
    set((s) => ({ transcripts: s.transcripts.filter((t) => t.id !== id) }));
    const { error } = await supabase.from('transcripts').delete().eq('id', id);
    if (error) set({ transcripts: prev, error: error.message });
  },

  linkToNote: async (id, noteId) => {
    const prev = get().transcripts.find((t) => t.id === id);
    if (!prev) return;
    set((s) => ({
      transcripts: s.transcripts.map((t) => (t.id === id ? { ...t, note_id: noteId } : t)),
    }));
    const { error } = await supabase.from('transcripts').update({ note_id: noteId }).eq('id', id);
    if (error) set({ error: error.message });
  },
}));
