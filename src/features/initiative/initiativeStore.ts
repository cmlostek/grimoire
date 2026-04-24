import { create } from 'zustand';
import { supabase } from '../../lib/supabase';

export type Condition = { name: string; rounds: number | null };

export type InitiativeCombatant = {
  id: string;
  name: string;
  initiative: number;
  hp: number;
  maxHp: number;
  ac: number;
  isPC: boolean;
  conditions: Condition[];
  turnOrder: number;
};

export const CONDITIONS: { name: string; color: string }[] = [
  { name: 'Blinded',       color: '#64748b' },
  { name: 'Charmed',       color: '#f472b6' },
  { name: 'Deafened',      color: '#94a3b8' },
  { name: 'Exhaustion',    color: '#f59e0b' },
  { name: 'Frightened',    color: '#fb923c' },
  { name: 'Grappled',      color: '#eab308' },
  { name: 'Incapacitated', color: '#ef4444' },
  { name: 'Invisible',     color: '#7dd3fc' },
  { name: 'Paralyzed',     color: '#dc2626' },
  { name: 'Petrified',     color: '#a8a29e' },
  { name: 'Poisoned',      color: '#4ade80' },
  { name: 'Prone',         color: '#c084fc' },
  { name: 'Restrained',    color: '#f97316' },
  { name: 'Stunned',       color: '#a78bfa' },
  { name: 'Unconscious',   color: '#9f1239' },
];

type Row = Record<string, unknown>;

function rowTo(r: Row): InitiativeCombatant {
  return {
    id: r.id as string,
    name: r.name as string,
    initiative: r.initiative as number,
    hp: r.hp as number,
    maxHp: r.max_hp as number,
    ac: r.ac as number,
    isPC: r.is_pc as boolean,
    conditions: (r.conditions as Condition[]) ?? [],
    turnOrder: r.turn_order as number,
  };
}

const ROUND_KEY = 'grimoire:init:round';
const TURN_KEY  = 'grimoire:init:turn';

type CombatantPatch = Partial<Pick<InitiativeCombatant, 'name' | 'initiative' | 'hp' | 'maxHp' | 'ac' | 'conditions'>>;

interface InitiativeState {
  combatants: InitiativeCombatant[];
  round: number;
  turnIndex: number;
  campaignId: string | null;
  loaded: boolean;

  loadForCampaign(id: string): Promise<void>;
  subscribe(id: string): () => void;
  clear(): void;

  add(c: Omit<InitiativeCombatant, 'id' | 'conditions' | 'turnOrder'>): Promise<void>;
  update(id: string, patch: CombatantPatch): Promise<void>;
  remove(id: string): Promise<void>;
  next(): void;
  reset(): Promise<void>;
  sort(): Promise<void>;
  addCondition(combatantId: string, cond: Condition): Promise<void>;
  removeCondition(combatantId: string, name: string): Promise<void>;
}

export const useInitiativeStore = create<InitiativeState>((set, get) => ({
  combatants: [],
  round: parseInt(localStorage.getItem(ROUND_KEY) ?? '1') || 1,
  turnIndex: parseInt(localStorage.getItem(TURN_KEY) ?? '0') || 0,
  campaignId: null,
  loaded: false,

  loadForCampaign: async (id) => {
    const { data } = await supabase
      .from('initiative_entries')
      .select('*')
      .eq('campaign_id', id)
      .order('turn_order');
    set({ combatants: (data ?? []).map(rowTo), campaignId: id, loaded: true });
  },

  subscribe: (id) => {
    const ch = supabase
      .channel(`init:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'initiative_entries', filter: `campaign_id=eq.${id}` },
        ({ eventType, new: r, old }) => {
          if (eventType === 'INSERT')
            set((s) => ({ combatants: [...s.combatants, rowTo(r as Row)].sort((a, b) => a.turnOrder - b.turnOrder) }));
          else if (eventType === 'UPDATE')
            set((s) => ({ combatants: s.combatants.map((c) => c.id === (r as Row).id ? rowTo(r as Row) : c) }));
          else if (eventType === 'DELETE')
            set((s) => ({ combatants: s.combatants.filter((c) => c.id !== (old as Row).id) }));
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  },

  clear: () => set({ combatants: [], loaded: false, campaignId: null }),

  add: async (c) => {
    const { campaignId, combatants } = get();
    if (!campaignId) return;
    const { data, error } = await supabase
      .from('initiative_entries')
      .insert({
        campaign_id: campaignId,
        name: c.name,
        initiative: c.initiative,
        hp: c.hp,
        max_hp: c.maxHp,
        ac: c.ac,
        is_pc: c.isPC,
        conditions: [],
        turn_order: combatants.length,
      })
      .select()
      .single();
    if (error) { console.error('Initiative add failed:', error); alert(`Failed to add combatant: ${error.message}`); return; }
    if (data) set((s) => ({ combatants: [...s.combatants, rowTo(data as Row)] }));
  },

  update: async (id, patch) => {
    const dbPatch: Record<string, unknown> = {};
    if (patch.name      !== undefined) dbPatch.name       = patch.name;
    if (patch.initiative!== undefined) dbPatch.initiative = patch.initiative;
    if (patch.hp        !== undefined) dbPatch.hp         = patch.hp;
    if (patch.maxHp     !== undefined) dbPatch.max_hp     = patch.maxHp;
    if (patch.ac        !== undefined) dbPatch.ac         = patch.ac;
    if (patch.conditions!== undefined) dbPatch.conditions = patch.conditions;
    set((s) => ({ combatants: s.combatants.map((c) => c.id === id ? { ...c, ...patch } : c) }));
    await supabase.from('initiative_entries').update(dbPatch).eq('id', id);
  },

  remove: async (id) => {
    set((s) => ({ combatants: s.combatants.filter((c) => c.id !== id) }));
    await supabase.from('initiative_entries').delete().eq('id', id);
  },

  next: () => {
    const { combatants, round, turnIndex, update } = get();
    if (!combatants.length) return;
    const ni = turnIndex + 1;
    if (ni >= combatants.length) {
      // End of round — decrement timed conditions on every combatant
      for (const c of combatants) {
        if (!c.conditions.length) continue;
        const next = c.conditions
          .map((cd) => cd.rounds === null ? cd : { ...cd, rounds: cd.rounds - 1 })
          .filter((cd) => cd.rounds === null || cd.rounds > 0);
        if (next.length !== c.conditions.length) update(c.id, { conditions: next });
      }
      const newRound = round + 1;
      localStorage.setItem(ROUND_KEY, String(newRound));
      localStorage.setItem(TURN_KEY, '0');
      set({ round: newRound, turnIndex: 0 });
    } else {
      localStorage.setItem(TURN_KEY, String(ni));
      set({ turnIndex: ni });
    }
  },

  reset: async () => {
    const { campaignId } = get();
    if (campaignId) await supabase.from('initiative_entries').delete().eq('campaign_id', campaignId);
    localStorage.setItem(ROUND_KEY, '1');
    localStorage.setItem(TURN_KEY, '0');
    set({ combatants: [], round: 1, turnIndex: 0 });
  },

  sort: async () => {
    const { combatants } = get();
    const sorted = [...combatants].sort((a, b) => b.initiative - a.initiative);
    await Promise.all(sorted.map((c, i) => supabase.from('initiative_entries').update({ turn_order: i }).eq('id', c.id)));
    localStorage.setItem(TURN_KEY, '0');
    set({ combatants: sorted.map((c, i) => ({ ...c, turnOrder: i })), turnIndex: 0 });
  },

  addCondition: async (combatantId, cond) => {
    const c = get().combatants.find((x) => x.id === combatantId);
    if (!c || c.conditions.some((x) => x.name === cond.name)) return;
    await get().update(combatantId, { conditions: [...c.conditions, cond] });
  },

  removeCondition: async (combatantId, name) => {
    const c = get().combatants.find((x) => x.id === combatantId);
    if (!c) return;
    await get().update(combatantId, { conditions: c.conditions.filter((x) => x.name !== name) });
  },
}));
