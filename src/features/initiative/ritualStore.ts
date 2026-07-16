import { create } from 'zustand';
import { supabase } from '../../lib/supabase';

/** A castable-in-N countdown shared with the whole table. Surfaced in the
 *  initiative tracker; links back to the caster's character sheet + map token.
 *
 *  - 'rounds'  → roundsRemaining ticks down on the GM's Next (see initiativeStore).
 *  - 'minutes' → expiresAt is absolute; each client derives the remaining time
 *                from the wall clock, so nothing needs to sync per second. */
export type RitualMode = 'rounds' | 'minutes';

export type Ritual = {
  id: string;
  ownerUserId: string | null;
  partyMemberId: string | null;
  casterName: string;
  spellName: string;
  mode: RitualMode;
  roundsRemaining: number | null;
  expiresAt: string | null;
};

type Row = Record<string, unknown>;

function rowToRitual(r: Row): Ritual {
  return {
    id: r.id as string,
    ownerUserId: (r.owner_user_id as string) ?? null,
    partyMemberId: (r.party_member_id as string) ?? null,
    casterName: (r.caster_name as string) ?? '',
    spellName: (r.spell_name as string) ?? '',
    mode: (r.mode as RitualMode) ?? 'rounds',
    roundsRemaining: (r.rounds_remaining as number | null) ?? null,
    expiresAt: (r.expires_at as string | null) ?? null,
  };
}

export type NewRitual = {
  ownerUserId: string | null;
  partyMemberId: string | null;
  casterName: string;
  spellName: string;
  mode: RitualMode;
  /** rounds mode: number of rounds until castable. */
  rounds?: number;
  /** minutes mode: duration in minutes until castable. */
  minutes?: number;
};

interface RitualState {
  rituals: Ritual[];
  campaignId: string | null;
  loaded: boolean;

  loadForCampaign(id: string): Promise<void>;
  subscribe(id: string): () => void;
  clear(): void;

  add(r: NewRitual): Promise<void>;
  remove(id: string): Promise<void>;
  /** Decrement every rounds-mode ritual by one (floored at 0). Called from the
   *  GM's initiative Next at the end of a round so the countdown syncs to all
   *  clients via realtime. */
  tickRound(campaignId: string): Promise<void>;
}

export const useRitualStore = create<RitualState>((set, get) => ({
  rituals: [],
  campaignId: null,
  loaded: false,

  loadForCampaign: async (id) => {
    const { data } = await supabase
      .from('ritual_countdowns')
      .select('*')
      .eq('campaign_id', id)
      .order('created_at');
    set({ rituals: (data ?? []).map(rowToRitual), campaignId: id, loaded: true });
  },

  subscribe: (id) => {
    const ch = supabase
      .channel(`ritual:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ritual_countdowns', filter: `campaign_id=eq.${id}` },
        ({ eventType, new: r, old }) => {
          if (eventType === 'INSERT') {
            const next = rowToRitual(r as Row);
            set((s) =>
              s.rituals.some((x) => x.id === next.id)
                ? s
                : { rituals: [...s.rituals, next] },
            );
          } else if (eventType === 'UPDATE') {
            set((s) => ({ rituals: s.rituals.map((x) => x.id === (r as Row).id ? rowToRitual(r as Row) : x) }));
          } else if (eventType === 'DELETE') {
            set((s) => ({ rituals: s.rituals.filter((x) => x.id !== (old as Row).id) }));
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  },

  clear: () => set({ rituals: [], loaded: false, campaignId: null }),

  add: async (r) => {
    const { campaignId } = get();
    if (!campaignId) return;
    const roundsRemaining = r.mode === 'rounds' ? Math.max(0, Math.round(r.rounds ?? 0)) : null;
    const expiresAt =
      r.mode === 'minutes'
        ? new Date(Date.now() + Math.max(0, (r.minutes ?? 0)) * 60_000).toISOString()
        : null;
    const { data } = await supabase
      .from('ritual_countdowns')
      .insert({
        campaign_id: campaignId,
        owner_user_id: r.ownerUserId,
        party_member_id: r.partyMemberId,
        caster_name: r.casterName,
        spell_name: r.spellName,
        mode: r.mode,
        rounds_remaining: roundsRemaining,
        expires_at: expiresAt,
      })
      .select()
      .single();
    if (data) {
      const next = rowToRitual(data as Row);
      set((s) =>
        s.rituals.some((x) => x.id === next.id) ? s : { rituals: [...s.rituals, next] },
      );
    }
  },

  remove: async (id) => {
    set((s) => ({ rituals: s.rituals.filter((x) => x.id !== id) }));
    await supabase.from('ritual_countdowns').delete().eq('id', id);
  },

  tickRound: async (campaignId) => {
    const active = get().rituals.filter(
      (r) => r.mode === 'rounds' && r.roundsRemaining !== null && r.roundsRemaining > 0,
    );
    if (!active.length) return;
    // Optimistic local decrement; persist each so players see the countdown
    // move even though only the GM's client drives Next.
    set((s) => ({
      rituals: s.rituals.map((r) =>
        r.mode === 'rounds' && r.roundsRemaining !== null && r.roundsRemaining > 0
          ? { ...r, roundsRemaining: r.roundsRemaining - 1 }
          : r,
      ),
    }));
    await Promise.all(
      active.map((r) =>
        supabase
          .from('ritual_countdowns')
          .update({ rounds_remaining: (r.roundsRemaining as number) - 1 })
          .eq('id', r.id)
          .eq('campaign_id', campaignId),
      ),
    );
  },
}));
