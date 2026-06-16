import { create } from 'zustand';
import { supabase } from '../../lib/supabase';

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
