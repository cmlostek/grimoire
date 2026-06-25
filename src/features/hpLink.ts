/**
 * Cross-surface PC HP sync.
 *
 * The character sheet, party page, initiative panel, and map all carry
 * their own HP fields. When a PC's HP changes on any of them, propagate
 * to the others so a hit at the table updates every surface at once.
 *
 * - Initiative combatants are matched to party members by case-insensitive
 *   name (the initiative roster has no `party_member_id` column yet).
 * - Map tokens are matched by `owner_user_id` so a player who owns one PC
 *   gets HP synced even if their token uses a nickname.
 * - Each store's update is guarded by a value-equality check so the
 *   propagation chain terminates after one round of writes.
 *
 * Imports are dynamic to keep this module loadable from any of the three
 * stores without creating a static circular dependency at module load.
 */

type SyncSource = 'party' | 'initiative' | 'map';

export async function syncPcHpAfterChange(opts: {
  source: SyncSource;
  name?: string | null;
  ownerUserId?: string | null;
  hp?: number;
  maxHp?: number;
}) {
  if (opts.hp === undefined && opts.maxHp === undefined) return;

  const lc = opts.name?.trim().toLowerCase() ?? null;

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
    }
  }

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
    }
  }

  if (opts.source !== 'map') {
    const { useMap } = await import('./map/mapStore');
    const map = useMap.getState();
    for (const t of map.tokens) {
      const nameMatch = lc && t.name.trim().toLowerCase() === lc;
      const ownerMatch = opts.ownerUserId && t.owner_user_id === opts.ownerUserId;
      if (!nameMatch && !ownerMatch) continue;
      const patch: Partial<{ hp: number; maxHp: number }> = {};
      if (opts.hp !== undefined && t.hp !== opts.hp) patch.hp = opts.hp;
      if (opts.maxHp !== undefined && t.maxHp !== opts.maxHp) patch.maxHp = opts.maxHp;
      if (Object.keys(patch).length) {
        map.updateToken(t.id, patch);
      }
    }
  }
}
