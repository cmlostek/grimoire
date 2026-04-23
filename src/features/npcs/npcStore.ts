import { create } from 'zustand';
import { supabase } from '../../lib/supabase';

export type NPCStatus = 'alive' | 'dead' | 'captured' | 'unknown' | 'missing';

export type NPC = {
  id: string;
  campaignId: string;
  name: string;
  faction: string;
  factionColor: string;
  location: string;
  status: NPCStatus;
  notes: string;
  visibleToPlayers: boolean;
  icon: string;
  linkedNoteId: string | null;
};

export const STATUS_COLORS: Record<NPCStatus, string> = {
  alive:    '#4ade80',
  dead:     '#f87171',
  captured: '#fb923c',
  unknown:  '#94a3b8',
  missing:  '#fbbf24',
};

export const FACTION_COLORS = [
  '#475569', '#0369a1', '#047857', '#b45309',
  '#be123c', '#6d28d9', '#0f766e', '#c2410c',
];

type Row = Record<string, unknown>;

function rowTo(r: Row): NPC {
  return {
    id: r.id as string,
    campaignId: r.campaign_id as string,
    name: r.name as string,
    faction: r.faction as string,
    factionColor: r.faction_color as string,
    location: r.location as string,
    status: r.status as NPCStatus,
    notes: r.notes as string,
    visibleToPlayers: r.visible_to_players as boolean,
    icon: r.icon as string,
    linkedNoteId: r.linked_note_id as string | null,
  };
}

type NpcPatch = Partial<Omit<NPC, 'id' | 'campaignId'>>;

interface NpcState {
  npcs: NPC[];
  activeNpcId: string | null;
  loaded: boolean;

  loadForCampaign(id: string): Promise<void>;
  subscribe(id: string): () => void;
  clear(): void;

  create(campaignId: string, data: NpcPatch): Promise<void>;
  update(id: string, patch: NpcPatch): Promise<void>;
  remove(id: string): Promise<void>;
  setActive(id: string | null): void;
}

export const useNpcStore = create<NpcState>((set, get) => ({
  npcs: [],
  activeNpcId: null,
  loaded: false,

  loadForCampaign: async (id) => {
    const { data } = await supabase
      .from('npcs')
      .select('*')
      .eq('campaign_id', id)
      .order('created_at');
    set({ npcs: (data ?? []).map(rowTo), loaded: true });
  },

  subscribe: (id) => {
    const ch = supabase
      .channel(`npcs:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'npcs', filter: `campaign_id=eq.${id}` },
        ({ eventType, new: r, old }) => {
          if (eventType === 'INSERT')
            set((s) => ({ npcs: [...s.npcs, rowTo(r as Row)] }));
          else if (eventType === 'UPDATE')
            set((s) => ({ npcs: s.npcs.map((n) => n.id === (r as Row).id ? rowTo(r as Row) : n) }));
          else if (eventType === 'DELETE')
            set((s) => ({ npcs: s.npcs.filter((n) => n.id !== (old as Row).id) }));
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  },

  clear: () => set({ npcs: [], loaded: false, activeNpcId: null }),

  create: async (campaignId, data) => {
    const { data: row } = await supabase
      .from('npcs')
      .insert({
        campaign_id: campaignId,
        name: data.name ?? 'New NPC',
        faction: data.faction ?? '',
        faction_color: data.factionColor ?? FACTION_COLORS[0],
        location: data.location ?? '',
        status: data.status ?? 'unknown',
        notes: data.notes ?? '',
        visible_to_players: data.visibleToPlayers ?? false,
        icon: data.icon ?? 'user',
        linked_note_id: data.linkedNoteId ?? null,
      })
      .select()
      .single();
    if (row) {
      const npc = rowTo(row as Row);
      set((s) => ({ npcs: [...s.npcs, npc], activeNpcId: npc.id }));
    }
  },

  update: async (id, patch) => {
    const dbPatch: Record<string, unknown> = {};
    if (patch.name              !== undefined) dbPatch.name               = patch.name;
    if (patch.faction           !== undefined) dbPatch.faction            = patch.faction;
    if (patch.factionColor      !== undefined) dbPatch.faction_color      = patch.factionColor;
    if (patch.location          !== undefined) dbPatch.location           = patch.location;
    if (patch.status            !== undefined) dbPatch.status             = patch.status;
    if (patch.notes             !== undefined) dbPatch.notes              = patch.notes;
    if (patch.visibleToPlayers  !== undefined) dbPatch.visible_to_players = patch.visibleToPlayers;
    if (patch.icon              !== undefined) dbPatch.icon               = patch.icon;
    if (patch.linkedNoteId      !== undefined) dbPatch.linked_note_id     = patch.linkedNoteId;
    set((s) => ({ npcs: s.npcs.map((n) => n.id === id ? { ...n, ...patch } : n) }));
    await supabase.from('npcs').update(dbPatch).eq('id', id);
  },

  remove: async (id) => {
    set((s) => ({
      npcs: s.npcs.filter((n) => n.id !== id),
      activeNpcId: s.activeNpcId === id ? (s.npcs.find((n) => n.id !== id)?.id ?? null) : s.activeNpcId,
    }));
    await supabase.from('npcs').delete().eq('id', id);
  },

  setActive: (id) => set({ activeNpcId: id }),
}));
