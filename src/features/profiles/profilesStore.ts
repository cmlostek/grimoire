import { create } from 'zustand';
import { supabase } from '../../lib/supabase';
import type { CampaignSummary } from '../session/sessionStore';

export type UserProfile = {
  userId: string;
  avatarPath: string | null;
};

/** Resolve a storage path stored in `user_profiles.avatar_path` to a public URL. */
export function avatarPublicUrl(path: string | null): string | null {
  if (!path) return null;
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Every campaign a given user belongs to, as visible to the caller under
 * RLS: their own campaigns fully, plus (via `shares_campaign_with`) any
 * campaign belonging to someone the caller already shares a campaign with.
 * Powers the Dashboard member-profile popover's "their campaigns" list.
 * Fetched fresh on demand rather than cached in the store.
 */
export async function fetchUserCampaigns(userId: string): Promise<CampaignSummary[]> {
  const { data, error } = await supabase
    .from('campaign_members')
    .select('role, display_name, campaigns!inner(id, name, join_code)')
    .eq('user_id', userId);
  if (error) {
    console.error('[profiles] fetchUserCampaigns failed', error);
    return [];
  }
  return (data ?? []).map((row) => {
    const c = row.campaigns as unknown as { id: string; name: string; join_code: string };
    return {
      id: c.id,
      name: c.name,
      join_code: c.join_code,
      role: row.role as CampaignSummary['role'],
      display_name: row.display_name as string,
    };
  });
}

interface State {
  profiles: Record<string, UserProfile>;
  /** Lazily fetch profiles for user_ids we haven't seen yet. */
  loadFor: (userIds: string[]) => Promise<void>;
  /** Patch the local cache after an upload/remove so the UI updates immediately. */
  setLocal: (userId: string, avatarPath: string | null) => void;
}

export const useProfiles = create<State>((set, get) => ({
  profiles: {},

  loadFor: async (userIds) => {
    if (userIds.length === 0) return;
    const known = get().profiles;
    const missing = Array.from(new Set(userIds)).filter((uid) => !(uid in known));
    if (missing.length === 0) return;

    const { data, error } = await supabase
      .from('user_profiles')
      .select('user_id, avatar_path')
      .in('user_id', missing);
    if (error) {
      console.error('[profiles] load failed', error);
      return;
    }

    const next = { ...get().profiles };
    // Initialise missing ids as "no profile" so we don't refetch them every render.
    for (const uid of missing) next[uid] = { userId: uid, avatarPath: null };
    for (const row of data ?? []) {
      next[row.user_id as string] = {
        userId: row.user_id as string,
        avatarPath: (row.avatar_path as string | null) ?? null,
      };
    }
    set({ profiles: next });
  },

  setLocal: (userId, avatarPath) => {
    set((s) => ({
      profiles: { ...s.profiles, [userId]: { userId, avatarPath } },
    }));
  },
}));
