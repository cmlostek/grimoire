import { create } from 'zustand';
import { supabase } from '../../lib/supabase';

const STORAGE_KEY = 'dnd-gm:campaignId';
const NAME_KEY = 'dnd-gm:displayName';

export type Role = 'gm' | 'player';

export type CampaignSummary = {
  id: string;
  name: string;
  join_code: string;
  role: Role;
  display_name: string;
};

type SessionState = {
  userId: string | null;
  campaignId: string | null;
  campaignName: string | null;
  joinCode: string | null;
  role: Role | null;
  displayName: string | null;
  loading: boolean;
  error: string | null;
  myCampaigns: CampaignSummary[];

  bootstrap: () => Promise<void>;
  refreshMyCampaigns: () => Promise<void>;
  createCampaign: (name: string, displayName: string) => Promise<void>;
  joinCampaign: (code: string, displayName: string) => Promise<void>;
  switchToCampaign: (campaignId: string) => Promise<void>;
  leaveCurrent: () => void;
};

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function randomJoinCode(n = 6) {
  let out = '';
  for (let i = 0; i < n; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

async function ensureAuth(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) return session.user.id;
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user) throw error ?? new Error('Anonymous sign-in failed');
  return data.user.id;
}

export const useSession = create<SessionState>((set, get) => ({
  userId: null,
  campaignId: null,
  campaignName: null,
  joinCode: null,
  role: null,
  displayName: null,
  loading: true,
  error: null,
  myCampaigns: [],

  refreshMyCampaigns: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) {
      set({ myCampaigns: [] });
      return;
    }
    const { data, error } = await supabase
      .from('campaign_members')
      .select('role, display_name, campaigns!inner(id, name, join_code, updated_at)')
      .eq('user_id', uid)
      .order('updated_at', { referencedTable: 'campaigns', ascending: false });
    if (error) {
      set({ error: error.message });
      return;
    }
    const rows = (data ?? []).map((row) => {
      const c = row.campaigns as unknown as { id: string; name: string; join_code: string };
      return {
        id: c.id,
        name: c.name,
        join_code: c.join_code,
        role: row.role as Role,
        display_name: row.display_name as string,
      };
    });
    set({ myCampaigns: rows });
  },

  switchToCampaign: async (campaignId) => {
    const uid = get().userId ?? (await ensureAuth());
    const { data: mem, error } = await supabase
      .from('campaign_members')
      .select('role, display_name, campaigns!inner(id, name, join_code)')
      .eq('campaign_id', campaignId)
      .eq('user_id', uid)
      .maybeSingle();
    if (error) {
      set({ error: error.message });
      return;
    }
    if (!mem) {
      set({ error: 'You are not a member of that campaign.' });
      return;
    }
    const campaign = mem.campaigns as unknown as { id: string; name: string; join_code: string };
    localStorage.setItem(STORAGE_KEY, campaign.id);
    localStorage.setItem(NAME_KEY, mem.display_name as string);
    set({
      userId: uid,
      campaignId: campaign.id,
      campaignName: campaign.name,
      joinCode: campaign.join_code,
      role: mem.role as Role,
      displayName: mem.display_name as string,
      error: null,
    });
  },

  bootstrap: async () => {
    set({ loading: true, error: null });
    try {
      const uid = await ensureAuth();
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        set({ userId: uid, loading: false });
        return;
      }
      const { data: mem, error } = await supabase
        .from('campaign_members')
        .select('role, display_name, campaigns!inner(id, name, join_code)')
        .eq('campaign_id', stored)
        .eq('user_id', uid)
        .maybeSingle();
      if (error) throw error;
      if (!mem) {
        localStorage.removeItem(STORAGE_KEY);
        set({ userId: uid, loading: false });
        return;
      }
      const campaign = mem.campaigns as unknown as { id: string; name: string; join_code: string };
      set({
        userId: uid,
        campaignId: campaign.id,
        campaignName: campaign.name,
        joinCode: campaign.join_code,
        role: mem.role as Role,
        displayName: mem.display_name,
        loading: false,
      });
      get().refreshMyCampaigns();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ error: msg, loading: false });
    }
  },

  createCampaign: async (name, displayName) => {
    set({ loading: true, error: null });
    try {
      const uid = get().userId ?? (await ensureAuth());
      const code = randomJoinCode();
      const { data: campaign, error: cErr } = await supabase
        .from('campaigns')
        .insert({ name, join_code: code })
        .select()
        .single();
      if (cErr) throw cErr;
      const { error: mErr } = await supabase.from('campaign_members').insert({
        campaign_id: campaign.id,
        user_id: uid,
        display_name: displayName,
        role: 'gm',
      });
      if (mErr) throw mErr;
      localStorage.setItem(STORAGE_KEY, campaign.id);
      localStorage.setItem(NAME_KEY, displayName);
      set({
        userId: uid,
        campaignId: campaign.id,
        campaignName: campaign.name,
        joinCode: campaign.join_code,
        role: 'gm',
        displayName,
        loading: false,
      });
      get().refreshMyCampaigns();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ error: msg, loading: false });
    }
  },

  joinCampaign: async (code, displayName) => {
    set({ loading: true, error: null });
    try {
      const uid = get().userId ?? (await ensureAuth());
      const upper = code.trim().toUpperCase();
      const { data: campaign, error: cErr } = await supabase
        .from('campaigns')
        .select('id, name, join_code')
        .eq('join_code', upper)
        .maybeSingle();
      if (cErr) throw cErr;
      if (!campaign) throw new Error(`No campaign with code "${upper}"`);
      const { data: existing } = await supabase
        .from('campaign_members')
        .select('role')
        .eq('campaign_id', campaign.id)
        .eq('user_id', uid)
        .maybeSingle();
      let role: Role = 'player';
      if (existing) {
        role = existing.role as Role;
      } else {
        const { error: mErr } = await supabase.from('campaign_members').insert({
          campaign_id: campaign.id,
          user_id: uid,
          display_name: displayName,
          role: 'player',
        });
        if (mErr) throw mErr;
      }
      localStorage.setItem(STORAGE_KEY, campaign.id);
      localStorage.setItem(NAME_KEY, displayName);
      set({
        userId: uid,
        campaignId: campaign.id,
        campaignName: campaign.name,
        joinCode: campaign.join_code,
        role,
        displayName,
        loading: false,
      });
      get().refreshMyCampaigns();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ error: msg, loading: false });
    }
  },

  leaveCurrent: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({
      campaignId: null,
      campaignName: null,
      joinCode: null,
      role: null,
      displayName: null,
      error: null,
    });
  },
}));

export function rememberedDisplayName(): string {
  return localStorage.getItem(NAME_KEY) ?? '';
}
