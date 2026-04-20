import { create } from 'zustand';
import { supabase } from '../../lib/supabase';

export type MapToken = {
  id: string;
  owner_user_id: string | null;
  name: string;
  x: number;
  y: number;
  color: string;
  emoji?: string;
  size: number;
  hidden_from_players: boolean;
};

export type MapShape =
  | { id: string; kind: 'circle'; x: number; y: number; r: number; color: string }
  | { id: string; kind: 'square'; x: number; y: number; w: number; h: number; color: string }
  | { id: string; kind: 'cone'; x: number; y: number; dx: number; dy: number; color: string };

type StateData = {
  show_grid?: boolean;
  shapes?: MapShape[];
};

export type MapState = {
  background_url: string | null;
  grid_size: number;
  show_grid: boolean;
  shapes: MapShape[];
};

type TokenRow = {
  id: string;
  campaign_id: string;
  owner_user_id: string | null;
  label: string;
  color: string;
  x: number;
  y: number;
  hidden_from_players: boolean;
  size: number;
  data: { emoji?: string } | null;
};

type StateRow = {
  campaign_id: string;
  background_url: string | null;
  grid_size: number;
  data: StateData | null;
};

const DEFAULT_STATE: MapState = {
  background_url: null,
  grid_size: 50,
  show_grid: true,
  shapes: [],
};

function rowToToken(r: TokenRow): MapToken {
  return {
    id: r.id,
    owner_user_id: r.owner_user_id,
    name: r.label,
    x: r.x,
    y: r.y,
    color: r.color,
    emoji: r.data?.emoji,
    size: r.size,
    hidden_from_players: r.hidden_from_players,
  };
}

function rowToState(r: StateRow): MapState {
  const d = r.data ?? {};
  return {
    background_url: r.background_url,
    grid_size: r.grid_size,
    show_grid: d.show_grid ?? true,
    shapes: d.shapes ?? [],
  };
}

type MapStore = {
  state: MapState;
  tokens: MapToken[];
  loaded: boolean;
  error: string | null;

  loadForCampaign: (campaignId: string) => Promise<void>;
  subscribe: (campaignId: string) => () => void;
  clear: () => void;

  setBackground: (campaignId: string, url: string | null) => Promise<void>;
  setGridSize: (campaignId: string, size: number) => Promise<void>;
  setShowGrid: (campaignId: string, show: boolean) => Promise<void>;
  addShape: (campaignId: string, shape: MapShape) => Promise<void>;
  removeShape: (campaignId: string, shapeId: string) => Promise<void>;
  clearShapes: (campaignId: string) => Promise<void>;

  addToken: (campaignId: string, t: Omit<MapToken, 'id'>) => Promise<string | null>;
  updateToken: (id: string, patch: Partial<MapToken>) => Promise<void>;
  removeToken: (id: string) => Promise<void>;
};

async function upsertStateData(campaignId: string, mutate: (d: StateData) => StateData) {
  const { data, error } = await supabase
    .from('map_state')
    .select('data')
    .eq('campaign_id', campaignId)
    .maybeSingle();
  if (error) throw error;
  const next = mutate((data?.data ?? {}) as StateData);
  const { error: upErr } = await supabase
    .from('map_state')
    .upsert({ campaign_id: campaignId, data: next }, { onConflict: 'campaign_id' });
  if (upErr) throw upErr;
}

export const useMap = create<MapStore>((set, get) => ({
  state: DEFAULT_STATE,
  tokens: [],
  loaded: false,
  error: null,

  loadForCampaign: async (campaignId) => {
    set({ loaded: false, error: null });
    try {
      const [stateRes, tokensRes] = await Promise.all([
        supabase.from('map_state').select('*').eq('campaign_id', campaignId).maybeSingle(),
        supabase.from('map_tokens').select('*').eq('campaign_id', campaignId),
      ]);
      if (stateRes.error) throw stateRes.error;
      if (tokensRes.error) throw tokensRes.error;
      const st = stateRes.data ? rowToState(stateRes.data as StateRow) : DEFAULT_STATE;
      const tokens = ((tokensRes.data ?? []) as TokenRow[]).map(rowToToken);
      set({ state: st, tokens, loaded: true });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), loaded: true });
    }
  },

  subscribe: (campaignId) => {
    const channel = supabase
      .channel(`map:${campaignId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'map_state', filter: `campaign_id=eq.${campaignId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            set({ state: DEFAULT_STATE });
          } else {
            set({ state: rowToState(payload.new as StateRow) });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'map_tokens', filter: `campaign_id=eq.${campaignId}` },
        (payload) => {
          const { tokens } = get();
          if (payload.eventType === 'INSERT') {
            const t = rowToToken(payload.new as TokenRow);
            if (!tokens.find((x) => x.id === t.id)) set({ tokens: [...tokens, t] });
          } else if (payload.eventType === 'UPDATE') {
            const t = rowToToken(payload.new as TokenRow);
            set({ tokens: tokens.map((x) => (x.id === t.id ? t : x)) });
          } else if (payload.eventType === 'DELETE') {
            const old = payload.old as Partial<TokenRow>;
            set({ tokens: tokens.filter((x) => x.id !== old.id) });
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  },

  clear: () => set({ state: DEFAULT_STATE, tokens: [], loaded: false, error: null }),

  setBackground: async (campaignId, url) => {
    const prev = get().state;
    set({ state: { ...prev, background_url: url } });
    const { error } = await supabase
      .from('map_state')
      .upsert({ campaign_id: campaignId, background_url: url }, { onConflict: 'campaign_id' });
    if (error) set({ state: prev, error: error.message });
  },

  setGridSize: async (campaignId, size) => {
    const prev = get().state;
    set({ state: { ...prev, grid_size: size } });
    const { error } = await supabase
      .from('map_state')
      .upsert({ campaign_id: campaignId, grid_size: size }, { onConflict: 'campaign_id' });
    if (error) set({ state: prev, error: error.message });
  },

  setShowGrid: async (campaignId, show) => {
    const prev = get().state;
    set({ state: { ...prev, show_grid: show } });
    try {
      await upsertStateData(campaignId, (d) => ({ ...d, show_grid: show }));
    } catch (e) {
      set({ state: prev, error: e instanceof Error ? e.message : String(e) });
    }
  },

  addShape: async (campaignId, shape) => {
    const prev = get().state;
    set({ state: { ...prev, shapes: [...prev.shapes, shape] } });
    try {
      await upsertStateData(campaignId, (d) => ({
        ...d,
        shapes: [...(d.shapes ?? []), shape],
      }));
    } catch (e) {
      set({ state: prev, error: e instanceof Error ? e.message : String(e) });
    }
  },

  removeShape: async (campaignId, shapeId) => {
    const prev = get().state;
    set({ state: { ...prev, shapes: prev.shapes.filter((s) => s.id !== shapeId) } });
    try {
      await upsertStateData(campaignId, (d) => ({
        ...d,
        shapes: (d.shapes ?? []).filter((s) => s.id !== shapeId),
      }));
    } catch (e) {
      set({ state: prev, error: e instanceof Error ? e.message : String(e) });
    }
  },

  clearShapes: async (campaignId) => {
    const prev = get().state;
    set({ state: { ...prev, shapes: [] } });
    try {
      await upsertStateData(campaignId, (d) => ({ ...d, shapes: [] }));
    } catch (e) {
      set({ state: prev, error: e instanceof Error ? e.message : String(e) });
    }
  },

  addToken: async (campaignId, t) => {
    const { data, error } = await supabase
      .from('map_tokens')
      .insert({
        campaign_id: campaignId,
        owner_user_id: t.owner_user_id,
        label: t.name,
        color: t.color,
        x: t.x,
        y: t.y,
        hidden_from_players: t.hidden_from_players,
        size: t.size,
        data: t.emoji ? { emoji: t.emoji } : {},
      })
      .select()
      .single();
    if (error || !data) {
      set({ error: error?.message ?? 'Failed to add token' });
      return null;
    }
    const token = rowToToken(data as TokenRow);
    set((s) => ({ tokens: [...s.tokens, token] }));
    return token.id;
  },

  updateToken: async (id, patch) => {
    const prev = get().tokens.find((x) => x.id === id);
    if (!prev) return;
    const next = { ...prev, ...patch };
    set((s) => ({ tokens: s.tokens.map((x) => (x.id === id ? next : x)) }));

    const row: Record<string, unknown> = {};
    if ('name' in patch) row.label = next.name;
    if ('color' in patch) row.color = next.color;
    if ('x' in patch) row.x = next.x;
    if ('y' in patch) row.y = next.y;
    if ('size' in patch) row.size = next.size;
    if ('owner_user_id' in patch) row.owner_user_id = next.owner_user_id;
    if ('hidden_from_players' in patch) row.hidden_from_players = next.hidden_from_players;
    if ('emoji' in patch) row.data = next.emoji ? { emoji: next.emoji } : {};

    const { error } = await supabase.from('map_tokens').update(row).eq('id', id);
    if (error) {
      set((s) => ({
        tokens: s.tokens.map((x) => (x.id === id ? prev : x)),
        error: error.message,
      }));
    }
  },

  removeToken: async (id) => {
    const prev = get().tokens;
    set((s) => ({ tokens: s.tokens.filter((x) => x.id !== id) }));
    const { error } = await supabase.from('map_tokens').delete().eq('id', id);
    if (error) set({ tokens: prev, error: error.message });
  },
}));
