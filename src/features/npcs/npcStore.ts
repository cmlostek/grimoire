import { create } from 'zustand';
import { supabase } from '../../lib/supabase';

export type NPCStatus = 'alive' | 'dead' | 'captured' | 'unknown' | 'missing';

/**
 * Stat block — modeled after the 5e SRD monster format. Every field is
 * optional so the GM can scaffold an NPC quickly without filling everything.
 * Free-form text fields (traits, actions, skills, senses) hold short
 * markdown-ish strings rather than a structured array.
 */
export type NpcStatBlock = {
  creatureType?: string;
  ac?: number;
  hpCurrent?: number;
  hpMax?: number;
  hitDice?: string;
  speed?: string;
  str?: number;
  dex?: number;
  con?: number;
  int?: number;
  wis?: number;
  cha?: number;
  skills?: string;
  senses?: string;
  damageResistances?: string;
  damageImmunities?: string;
  conditionImmunities?: string;
  languages?: string;
  cr?: string;
  traits?: string;
  actions?: string;
};

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
  statBlock: NpcStatBlock;
  statBlockVisible: boolean;
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

export type NpcPermission = {
  npc_id: string;
  user_id: string;
  can_view: boolean;
};

export const EMPTY_PERMS: readonly NpcPermission[] = Object.freeze([]);

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
    // stat_block / stat_block_visible were added in 20260521_npc_stat_blocks.sql.
    // Fall back to safe defaults for older rows or pre-migration runs.
    statBlock: (r.stat_block as NpcStatBlock | null) ?? {},
    statBlockVisible: (r.stat_block_visible as boolean | null) ?? false,
  };
}

type NpcPatch = Partial<Omit<NPC, 'id' | 'campaignId'>>;

interface NpcState {
  npcs: NPC[];
  activeNpcId: string | null;
  loaded: boolean;
  /** Per-NPC permission rows, keyed by NPC id. */
  permissions: Record<string, NpcPermission[]>;

  loadForCampaign(id: string): Promise<void>;
  subscribe(id: string): () => void;
  clear(): void;

  create(campaignId: string, data: NpcPatch): Promise<void>;
  update(id: string, patch: NpcPatch): Promise<void>;
  remove(id: string): Promise<void>;
  setActive(id: string | null): void;
  /** Replace the per-user view matrix for an NPC. */
  setNpcPermissions(npcId: string, rows: NpcPermission[]): Promise<void>;
}

export const useNpcStore = create<NpcState>((set, get) => ({
  npcs: [],
  activeNpcId: null,
  loaded: false,
  permissions: {},

  loadForCampaign: async (id) => {
    const { data } = await supabase
      .from('npcs')
      .select('*')
      .eq('campaign_id', id)
      .order('created_at');
    const npcs = (data ?? []).map(rowTo);

    // Pull per-user perms for the loaded set. Missing table (pre-migration)
    // is tolerated — the share popover still works, perms just stay empty.
    let permissions: Record<string, NpcPermission[]> = {};
    if (npcs.length > 0) {
      const ids = npcs.map((n) => n.id);
      const { data: permRows, error } = await supabase
        .from('npc_permissions')
        .select('*')
        .in('npc_id', ids);
      if (!error && permRows) {
        for (const r of permRows as NpcPermission[]) {
          (permissions[r.npc_id] ||= []).push(r);
        }
      }
    }

    set({ npcs, permissions, loaded: true });
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
            set((s) => ({
              npcs: s.npcs.filter((n) => n.id !== (old as Row).id),
              permissions: Object.fromEntries(Object.entries(s.permissions).filter(([k]) => k !== (old as Row).id)),
            }));
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'npc_permissions' },
        ({ eventType, new: r, old }) => {
          const permissions = { ...get().permissions };
          if (eventType === 'DELETE') {
            const o = old as Partial<NpcPermission>;
            if (!o.npc_id) return;
            permissions[o.npc_id] = (permissions[o.npc_id] ?? []).filter((p) => p.user_id !== o.user_id);
          } else {
            const row = r as NpcPermission;
            const existing = (permissions[row.npc_id] ?? []).filter((p) => p.user_id !== row.user_id);
            permissions[row.npc_id] = [...existing, row];
          }
          set({ permissions });
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  },

  clear: () => set({ npcs: [], loaded: false, activeNpcId: null, permissions: {} }),

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
    if (patch.statBlock         !== undefined) dbPatch.stat_block         = patch.statBlock;
    if (patch.statBlockVisible  !== undefined) dbPatch.stat_block_visible = patch.statBlockVisible;
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

  setNpcPermissions: async (npcId, rows) => {
    const cleaned = rows.filter((r) => r.can_view);
    const prev = get().permissions[npcId] ?? [];

    // Optimistic local update.
    set((s) => ({ permissions: { ...s.permissions, [npcId]: cleaned } }));

    // Replace-all: delete existing rows for this NPC, insert the new set.
    const delRes = await supabase.from('npc_permissions').delete().eq('npc_id', npcId);
    if (delRes.error && !/relation .* does not exist/i.test(delRes.error.message)) {
      set((s) => ({ permissions: { ...s.permissions, [npcId]: prev } }));
      return;
    }
    if (cleaned.length > 0) {
      const insRes = await supabase.from('npc_permissions').insert(cleaned);
      if (insRes.error && !/relation .* does not exist/i.test(insRes.error.message)) {
        set((s) => ({ permissions: { ...s.permissions, [npcId]: prev } }));
        return;
      }
    }
  },
}));
