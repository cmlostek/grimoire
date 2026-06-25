/**
 * Cross-surface PC HP sync.
 *
 * The character sheet, party page, initiative panel, and map all carry
 * their own HP fields. When a PC's HP changes on any of them, propagate
 * to the others so a hit at the table updates every surface at once.
 *
 * - Initiative combatants are matched to party members by case-insensitive
 *   name (the initiative roster has no `party_member_id` column yet).
 * - Map tokens are matched by `owner_user_id` (or name fallback) so a
 *   player who owns one PC gets HP synced even if their token uses a
 *   nickname. Tokens with no owner are treated as NPCs and left alone.
 * - Each store's update fn short-circuits no-op patches, so the
 *   propagation chain terminates after one round of writes.
 * - If a target store hasn't loaded yet (e.g. the user is editing HP on
 *   the character sheet without ever visiting the map page), the sync
 *   falls back to a direct Supabase write — the other surface's local
 *   state picks the change up via realtime once it mounts.
 *
 * Imports of the peer stores are dynamic to keep this module loadable
 * from any of them without a static circular dependency.
 */

import { supabase } from '../lib/supabase';

type SyncSource = 'party' | 'initiative' | 'map';

type TokenDataRow = {
  emoji?: string;
  hp?: number;
  maxHp?: number;
  damageLog?: unknown;
  conditions?: unknown;
};

async function getCampaignId(): Promise<string | null> {
  const { useSession } = await import('./session/sessionStore');
  return useSession.getState().campaignId;
}

export async function syncPcHpAfterChange(opts: {
  source: SyncSource;
  name?: string | null;
  ownerUserId?: string | null;
  hp?: number;
  maxHp?: number;
}) {
  if (opts.hp === undefined && opts.maxHp === undefined) return;

  const lc = opts.name?.trim().toLowerCase() ?? null;

  // ── Party ───────────────────────────────────────────────────────────────
  if (opts.source !== 'party' && (lc || opts.ownerUserId)) {
    const { useParty } = await import('./party/partyStore');
    const party = useParty.getState().party;
    const member = party.find((p) => {
      if (lc && p.name.trim().toLowerCase() === lc) return true;
      if (opts.ownerUserId && p.owner_user_id === opts.ownerUserId) return true;
      return false;
    });
    if (member) {
      const patch: Record<string, number> = {};
      if (opts.hp !== undefined && member.hp !== opts.hp) patch.hp = opts.hp;
      if (opts.maxHp !== undefined && member.maxHp !== opts.maxHp) patch.maxHp = opts.maxHp;
      if (Object.keys(patch).length) {
        useParty.getState().updatePartyMember(member.id, patch);
      }
    } else if (opts.ownerUserId) {
      // Party isn't loaded — write straight to the DB so the change still
      // lands. The party page picks it up via realtime once it mounts.
      const campaignId = await getCampaignId();
      if (campaignId) {
        const { data: rows } = await supabase
          .from('party_members')
          .select('id, hp_current, hp_max')
          .eq('campaign_id', campaignId)
          .eq('owner_user_id', opts.ownerUserId);
        for (const r of rows ?? []) {
          const row = r as { id: string; hp_current: number; hp_max: number };
          const dbPatch: Record<string, number> = {};
          if (opts.hp !== undefined && row.hp_current !== opts.hp) dbPatch.hp_current = opts.hp;
          if (opts.maxHp !== undefined && row.hp_max !== opts.maxHp) dbPatch.hp_max = opts.maxHp;
          if (Object.keys(dbPatch).length) {
            await supabase.from('party_members').update(dbPatch).eq('id', row.id);
          }
        }
      }
    }
  }

  // ── Initiative ─────────────────────────────────────────────────────────
  if (opts.source !== 'initiative' && lc) {
    const { useInitiativeStore } = await import('./initiative/initiativeStore');
    const init = useInitiativeStore.getState();
    const combatant = init.combatants.find(
      (c) => c.isPC && c.name.trim().toLowerCase() === lc,
    );
    if (combatant) {
      const patch: Record<string, number> = {};
      if (opts.hp !== undefined && combatant.hp !== opts.hp) patch.hp = opts.hp;
      if (opts.maxHp !== undefined && combatant.maxHp !== opts.maxHp) patch.maxHp = opts.maxHp;
      if (Object.keys(patch).length) {
        init.update(combatant.id, patch);
      }
    } else {
      // Initiative panel isn't open — write to the DB so it's right when
      // someone opens it. Match by lowercase name + is_pc.
      const campaignId = await getCampaignId();
      if (campaignId) {
        const { data: rows } = await supabase
          .from('initiative_entries')
          .select('id, name, hp, max_hp, is_pc')
          .eq('campaign_id', campaignId)
          .eq('is_pc', true);
        for (const r of rows ?? []) {
          const row = r as { id: string; name: string; hp: number; max_hp: number };
          if (row.name.trim().toLowerCase() !== lc) continue;
          const dbPatch: Record<string, number> = {};
          if (opts.hp !== undefined && row.hp !== opts.hp) dbPatch.hp = opts.hp;
          if (opts.maxHp !== undefined && row.max_hp !== opts.maxHp) dbPatch.max_hp = opts.maxHp;
          if (Object.keys(dbPatch).length) {
            await supabase.from('initiative_entries').update(dbPatch).eq('id', row.id);
          }
        }
      }
    }
  }

  // ── Map tokens ─────────────────────────────────────────────────────────
  if (opts.source !== 'map') {
    const { useMap } = await import('./map/mapStore');
    const map = useMap.getState();
    let matched = false;
    for (const t of map.tokens) {
      const nameMatch = lc && t.name.trim().toLowerCase() === lc;
      const ownerMatch = opts.ownerUserId && t.owner_user_id === opts.ownerUserId;
      if (!nameMatch && !ownerMatch) continue;
      matched = true;
      const patch: Partial<{ hp: number; maxHp: number }> = {};
      if (opts.hp !== undefined && t.hp !== opts.hp) patch.hp = opts.hp;
      if (opts.maxHp !== undefined && t.maxHp !== opts.maxHp) patch.maxHp = opts.maxHp;
      if (Object.keys(patch).length) {
        map.updateToken(t.id, patch);
      }
    }
    if (!matched && (lc || opts.ownerUserId)) {
      // Map page isn't open — patch matching token rows directly. The data
      // column is jsonb; fetch + merge so we don't clobber emoji / damageLog
      // / conditions while updating hp / maxHp.
      const campaignId = await getCampaignId();
      if (campaignId) {
        const { data: rows } = await supabase
          .from('map_tokens')
          .select('id, label, owner_user_id, data')
          .eq('campaign_id', campaignId);
        for (const r of rows ?? []) {
          const row = r as {
            id: string;
            label: string;
            owner_user_id: string | null;
            data: TokenDataRow | null;
          };
          const nameMatch = lc && row.label.trim().toLowerCase() === lc;
          const ownerMatch = opts.ownerUserId && row.owner_user_id === opts.ownerUserId;
          if (!nameMatch && !ownerMatch) continue;
          const data: TokenDataRow = { ...(row.data ?? {}) };
          let changed = false;
          if (opts.hp !== undefined && data.hp !== opts.hp) {
            data.hp = opts.hp;
            changed = true;
          }
          if (opts.maxHp !== undefined && data.maxHp !== opts.maxHp) {
            data.maxHp = opts.maxHp;
            changed = true;
          }
          if (changed) {
            await supabase.from('map_tokens').update({ data }).eq('id', row.id);
          }
        }
      }
    }
  }
}
