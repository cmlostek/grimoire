import { create } from 'zustand';
import { supabase } from '../../lib/supabase';

export type SharedHomebrewKind = 'item' | 'spell';

export type SharedHomebrew = {
  id: string;
  campaign_id: string;
  kind: SharedHomebrewKind;
  name: string;
  visible_to_players: boolean;
  data: Record<string, unknown>;
  source_id: string | null;
};

type Row = {
  id: string;
  campaign_id: string;
  kind: string;
  name: string;
  visible_to_players: boolean;
  data: Record<string, unknown>;
};

function rowToShared(r: Row): SharedHomebrew {
  const source = (r.data?.source_id as string | undefined) ?? null;
  return {
    id: r.id,
    campaign_id: r.campaign_id,
    kind: r.kind as SharedHomebrewKind,
    name: r.name,
    visible_to_players: r.visible_to_players,
    data: r.data,
    source_id: source,
  };
}

type State = {
  items: SharedHomebrew[];
  spells: SharedHomebrew[];
  loaded: boolean;
  error: string | null;

  loadForCampaign: (campaignId: string) => Promise<void>;
  subscribe: (campaignId: string) => () => void;
  clear: () => void;

  shareItem: (campaignId: string, sourceId: string, name: string, snapshot: Record<string, unknown>) => Promise<void>;
  shareSpell: (campaignId: string, sourceId: string, name: string, snapshot: Record<string, unknown>) => Promise<void>;
  unshareBySource: (sourceId: string) => Promise<void>;
  setVisible: (id: string, visible: boolean) => Promise<void>;
};

export const useSharedHomebrew = create<State>((set, get) => ({
  items: [],
  spells: [],
  loaded: false,
  error: null,

  loadForCampaign: async (campaignId) => {
    set({ loaded: false, error: null });
    const { data, error } = await supabase
      .from('homebrew')
      .select('*')
      .eq('campaign_id', campaignId);
    if (error) {
      set({ error: error.message, loaded: true });
      return;
    }
    const all = ((data ?? []) as Row[]).map(rowToShared);
    set({
      items: all.filter((r) => r.kind === 'item'),
      spells: all.filter((r) => r.kind === 'spell'),
      loaded: true,
    });
  },

  subscribe: (campaignId) => {
    const channel = supabase
      .channel(`homebrew:${campaignId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'homebrew', filter: `campaign_id=eq.${campaignId}` },
        (payload) => {
          const { items, spells } = get();
          if (payload.eventType === 'DELETE') {
            const old = payload.old as Partial<Row>;
            set({
              items: items.filter((x) => x.id !== old.id),
              spells: spells.filter((x) => x.id !== old.id),
            });
            return;
          }
          const next = rowToShared(payload.new as Row);
          const bucket = next.kind === 'item' ? items : spells;
          const updated = bucket.some((x) => x.id === next.id)
            ? bucket.map((x) => (x.id === next.id ? next : x))
            : [...bucket, next];
          if (next.kind === 'item') set({ items: updated });
          else set({ spells: updated });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  },

  clear: () => set({ items: [], spells: [], loaded: false, error: null }),

  shareItem: async (campaignId, sourceId, name, snapshot) => {
    const existing = get().items.find((x) => x.source_id === sourceId);
    const data = { ...snapshot, source_id: sourceId };
    if (existing) {
      const { error } = await supabase
        .from('homebrew')
        .update({ name, data, visible_to_players: true })
        .eq('id', existing.id);
      if (error) set({ error: error.message });
    } else {
      const { error } = await supabase.from('homebrew').insert({
        campaign_id: campaignId,
        kind: 'item',
        name,
        data,
        visible_to_players: true,
      });
      if (error) set({ error: error.message });
    }
  },

  shareSpell: async (campaignId, sourceId, name, snapshot) => {
    const existing = get().spells.find((x) => x.source_id === sourceId);
    const data = { ...snapshot, source_id: sourceId };
    if (existing) {
      const { error } = await supabase
        .from('homebrew')
        .update({ name, data, visible_to_players: true })
        .eq('id', existing.id);
      if (error) set({ error: error.message });
    } else {
      const { error } = await supabase.from('homebrew').insert({
        campaign_id: campaignId,
        kind: 'spell',
        name,
        data,
        visible_to_players: true,
      });
      if (error) set({ error: error.message });
    }
  },

  unshareBySource: async (sourceId) => {
    const items = get().items.filter((x) => x.source_id === sourceId);
    const spells = get().spells.filter((x) => x.source_id === sourceId);
    const all = [...items, ...spells];
    if (all.length === 0) return;
    const { error } = await supabase
      .from('homebrew')
      .delete()
      .in('id', all.map((r) => r.id));
    if (error) set({ error: error.message });
  },

  setVisible: async (id, visible) => {
    const { error } = await supabase
      .from('homebrew')
      .update({ visible_to_players: visible })
      .eq('id', id);
    if (error) set({ error: error.message });
  },
}));
