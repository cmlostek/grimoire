import { create } from 'zustand';
import { supabase } from '../../lib/supabase';

export type Gold = { pp: number; gp: number; ep: number; sp: number; cp: number };
export type DeathSaves = { successes: number; failures: number };

/** A line item in a character's inventory. Links back to a SRD or homebrew
 *  catalog entry by id, but stores the display `name` inline so the row
 *  still renders if the source is later removed. */
export type InventoryItem = {
  /** Local-only uuid for React keys. */
  id: string;
  /** Catalog source kind. `custom` means a freeform user-typed entry. */
  sourceKind: 'srd-item' | 'srd-spell' | 'item' | 'spell' | 'custom';
  /** Catalog id — SRD index slug for SRD entries, uuid for homebrew. */
  sourceId?: string;
  name: string;
  qty: number;
  equipped: boolean;
};

export type PartyMember = {
  id: string;
  owner_user_id: string | null;
  name: string;
  player?: string;
  race: string;
  classSummary: string;
  level: number;
  ac: number;
  hp: number;
  maxHp: number;
  tempHp: number;
  speed: string;
  initiativeBonus: number;
  passivePerception: number;
  passiveInvestigation: number;
  passiveInsight: number;
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  saves: string;
  skills: string;
  languages: string;
  ddbUrl?: string;
  notes?: string;
  source: 'manual' | 'ddb-json' | 'json';
  // Phase A character-sheet fields (all optional — older rows default sensibly).
  xp?: number;
  gold?: Gold;
  deathSaves?: DeathSaves;
  /** Skill keys (see SKILLS in CharacterSheet) the character is proficient in. */
  skillProfs?: string[];
  /** Ability keys ('str' | 'dex' | ...) the character is save-proficient in. */
  saveProfs?: string[];
  /** Carried items, weapons, magic items, and known spells. */
  inventory?: InventoryItem[];
};

export const DEFAULT_GOLD: Gold = { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };
export const DEFAULT_DEATH_SAVES: DeathSaves = { successes: 0, failures: 0 };

type Row = {
  id: string;
  campaign_id: string;
  owner_user_id: string | null;
  name: string;
  class: string | null;
  race: string | null;
  level: number;
  hp_current: number;
  hp_max: number;
  ac: number;
  notes: string | null;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

function rowToMember(r: Row): PartyMember {
  const d = (r.data ?? {}) as Partial<PartyMember>;
  return {
    id: r.id,
    owner_user_id: r.owner_user_id,
    name: r.name,
    race: r.race ?? d.race ?? '',
    classSummary: r.class ?? d.classSummary ?? '',
    level: r.level,
    ac: r.ac,
    hp: r.hp_current,
    maxHp: r.hp_max,
    tempHp: d.tempHp ?? 0,
    speed: d.speed ?? '30 ft.',
    initiativeBonus: d.initiativeBonus ?? 0,
    passivePerception: d.passivePerception ?? 10,
    passiveInvestigation: d.passiveInvestigation ?? 10,
    passiveInsight: d.passiveInsight ?? 10,
    str: d.str ?? 10,
    dex: d.dex ?? 10,
    con: d.con ?? 10,
    int: d.int ?? 10,
    wis: d.wis ?? 10,
    cha: d.cha ?? 10,
    saves: d.saves ?? '',
    skills: d.skills ?? '',
    languages: d.languages ?? 'Common',
    player: d.player,
    ddbUrl: d.ddbUrl,
    notes: r.notes ?? d.notes ?? undefined,
    source: d.source ?? 'manual',
    xp: d.xp ?? 0,
    gold: d.gold ?? { ...DEFAULT_GOLD },
    deathSaves: d.deathSaves ?? { ...DEFAULT_DEATH_SAVES },
    skillProfs: d.skillProfs ?? [],
    saveProfs: d.saveProfs ?? [],
    inventory: d.inventory ?? [],
  };
}

function memberToInsert(campaignId: string, m: Omit<PartyMember, 'id' | 'owner_user_id'>) {
  const { name, race, classSummary, level, hp, maxHp, ac, notes, ...rest } = m;
  return {
    campaign_id: campaignId,
    name,
    class: classSummary,
    race,
    level,
    hp_current: hp,
    hp_max: maxHp,
    ac,
    notes: notes ?? null,
    data: { ...rest, race, classSummary },
  };
}

function patchToUpdate(
  current: PartyMember,
  patch: Partial<PartyMember>
): Partial<Row> {
  const merged = { ...current, ...patch };
  const out: Partial<Row> = {};
  if ('name' in patch) out.name = merged.name;
  if ('classSummary' in patch) out.class = merged.classSummary;
  if ('race' in patch) out.race = merged.race;
  if ('level' in patch) out.level = merged.level;
  if ('hp' in patch) out.hp_current = merged.hp;
  if ('maxHp' in patch) out.hp_max = merged.maxHp;
  if ('ac' in patch) out.ac = merged.ac;
  if ('notes' in patch) out.notes = merged.notes ?? null;
  if ('owner_user_id' in patch) out.owner_user_id = merged.owner_user_id;

  const dataKeys: (keyof PartyMember)[] = [
    'tempHp', 'speed', 'initiativeBonus',
    'passivePerception', 'passiveInvestigation', 'passiveInsight',
    'str', 'dex', 'con', 'int', 'wis', 'cha',
    'saves', 'skills', 'languages', 'player', 'ddbUrl', 'source',
    'race', 'classSummary',
    'xp', 'gold', 'deathSaves', 'skillProfs', 'saveProfs', 'inventory',
  ];
  const needsDataUpdate = dataKeys.some((k) => k in patch);
  if (needsDataUpdate) {
    const { id: _id, owner_user_id: _o, ...rest } = merged;
    out.data = rest as unknown as Record<string, unknown>;
  }
  return out;
}

type PartyState = {
  party: PartyMember[];
  loaded: boolean;
  error: string | null;

  loadForCampaign: (campaignId: string) => Promise<void>;
  subscribe: (campaignId: string) => () => void;
  clear: () => void;

  addPartyMember: (campaignId: string, m: Omit<PartyMember, 'id' | 'owner_user_id'>) => Promise<string | null>;
  updatePartyMember: (id: string, patch: Partial<PartyMember>) => Promise<void>;
  removePartyMember: (id: string) => Promise<void>;
  claim: (id: string) => Promise<void>;
  unclaim: (id: string) => Promise<void>;
};

export const useParty = create<PartyState>((set, get) => ({
  party: [],
  loaded: false,
  error: null,

  loadForCampaign: async (campaignId) => {
    set({ loaded: false, error: null });
    const { data, error } = await supabase
      .from('party_members')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: true });
    if (error) {
      set({ error: error.message, loaded: true });
      return;
    }
    set({
      party: ((data ?? []) as Row[]).map(rowToMember),
      loaded: true,
    });
  },

  subscribe: (campaignId) => {
    const channel = supabase
      .channel(`party:${campaignId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'party_members', filter: `campaign_id=eq.${campaignId}` },
        (payload) => {
          const { party } = get();
          if (payload.eventType === 'INSERT') {
            const m = rowToMember(payload.new as Row);
            if (!party.find((x) => x.id === m.id)) {
              set({ party: [...party, m] });
            }
          } else if (payload.eventType === 'UPDATE') {
            const m = rowToMember(payload.new as Row);
            set({ party: party.map((x) => (x.id === m.id ? m : x)) });
          } else if (payload.eventType === 'DELETE') {
            const old = payload.old as Partial<Row>;
            set({ party: party.filter((x) => x.id !== old.id) });
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  },

  clear: () => set({ party: [], loaded: false, error: null }),

  addPartyMember: async (campaignId, m) => {
    const { data, error } = await supabase
      .from('party_members')
      .insert(memberToInsert(campaignId, m))
      .select()
      .single();
    if (error || !data) {
      set({ error: error?.message ?? 'Failed to add character' });
      return null;
    }
    const member = rowToMember(data as Row);
    set((s) => ({ party: [...s.party, member] }));
    return member.id;
  },

  updatePartyMember: async (id, patch) => {
    const prev = get().party.find((p) => p.id === id);
    if (!prev) return;
    const optimistic = { ...prev, ...patch };
    set((s) => ({ party: s.party.map((p) => (p.id === id ? optimistic : p)) }));
    const update = patchToUpdate(prev, patch);
    const { data, error } = await supabase
      .from('party_members')
      .update(update)
      .eq('id', id)
      .select()
      .single();
    if (error) {
      set((s) => ({
        party: s.party.map((p) => (p.id === id ? prev : p)),
        error: error.message,
      }));
    } else if (data) {
      const saved = rowToMember(data as Row);
      set((s) => ({ party: s.party.map((p) => (p.id === id ? saved : p)) }));
    }
  },

  removePartyMember: async (id) => {
    const prev = get().party;
    set((s) => ({ party: s.party.filter((p) => p.id !== id) }));
    const { error } = await supabase.from('party_members').delete().eq('id', id);
    if (error) set({ party: prev, error: error.message });
  },

  claim: async (id) => {
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return;
    await get().updatePartyMember(id, { owner_user_id: uid });
  },

  unclaim: async (id) => {
    await get().updatePartyMember(id, { owner_user_id: null });
  },
}));
