/**
 * Campaign-level settings: page visibility, folder visibility, folder colors.
 *
 * Primary storage: Supabase `campaign_settings` table (upsert).
 * Fallback: localStorage per campaign ID (works without any DB migration).
 *
 * SQL migration to run for full cross-device support:
 *
 *   CREATE TABLE IF NOT EXISTS campaign_settings (
 *     campaign_id UUID PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
 *     settings    JSONB NOT NULL DEFAULT '{}'
 *   );
 *   ALTER TABLE campaign_settings ENABLE ROW LEVEL SECURITY;
 *   CREATE POLICY "Members read settings"  ON campaign_settings FOR SELECT
 *     USING (EXISTS (
 *       SELECT 1 FROM campaign_members
 *       WHERE campaign_id = campaign_settings.campaign_id AND user_id = auth.uid()
 *     ));
 *   CREATE POLICY "GM write settings" ON campaign_settings FOR ALL
 *     USING (EXISTS (
 *       SELECT 1 FROM campaign_members
 *       WHERE campaign_id = campaign_settings.campaign_id
 *         AND user_id = auth.uid() AND role = 'gm'
 *     ));
 */
import { create } from 'zustand';
import { supabase } from '../../lib/supabase';

export type CampaignSettings = {
  /** Nav path slugs hidden from non-GM players (e.g. 'shop', 'spells'). */
  hiddenPages: string[];
  /** Folder IDs hidden from non-GM players. */
  hiddenFolderIds: string[];
  /** folderId → hex color string. */
  folderColors: Record<string, string>;
};

export const DEFAULTS: CampaignSettings = {
  hiddenPages: [],
  hiddenFolderIds: [],
  folderColors: {},
};

const lsKey = (cid: string) => `dnd-gm:campaignSettings:${cid}`;

function lsLoad(cid: string): CampaignSettings {
  try {
    const raw = localStorage.getItem(lsKey(cid));
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

function lsSave(cid: string, s: CampaignSettings) {
  localStorage.setItem(lsKey(cid), JSON.stringify(s));
}

async function sbUpsert(cid: string, s: CampaignSettings) {
  try {
    await supabase
      .from('campaign_settings')
      .upsert({ campaign_id: cid, settings: s }, { onConflict: 'campaign_id' });
  } catch {
    /* table may not exist yet — localStorage is the fallback */
  }
}

type SettingsState = {
  settings: CampaignSettings;
  campaignId: string | null;

  load: (cid: string) => Promise<void>;
  subscribe: (cid: string) => () => void;

  togglePage: (page: string) => void;
  toggleFolder: (folderId: string) => void;
  setFolderColor: (folderId: string, color: string | null) => void;
};

export const useCampaignSettings = create<SettingsState>((set, get) => ({
  settings: DEFAULTS,
  campaignId: null,

  load: async (cid) => {
    set({ campaignId: cid });
    // Instant local read so UI is never empty
    set({ settings: lsLoad(cid) });

    try {
      const { data, error } = await supabase
        .from('campaign_settings')
        .select('settings')
        .eq('campaign_id', cid)
        .maybeSingle();
      if (error) return; // table doesn't exist yet
      if (data?.settings) {
        const merged = { ...DEFAULTS, ...(data.settings as Partial<CampaignSettings>) };
        lsSave(cid, merged);
        set({ settings: merged });
      }
    } catch {
      /* fail silently */
    }
  },

  subscribe: (cid) => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`campaign_settings:${cid}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'campaign_settings',
            filter: `campaign_id=eq.${cid}`,
          },
          (payload) => {
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              const s = (payload.new as { settings: CampaignSettings }).settings;
              const merged = { ...DEFAULTS, ...s };
              lsSave(cid, merged);
              set({ settings: merged });
            }
          }
        )
        .subscribe();
    } catch {
      /* realtime may not be enabled */
    }
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  },

  togglePage: (page) => {
    const { settings, campaignId } = get();
    const hiddenPages = settings.hiddenPages.includes(page)
      ? settings.hiddenPages.filter((p) => p !== page)
      : [...settings.hiddenPages, page];
    const next = { ...settings, hiddenPages };
    set({ settings: next });
    if (campaignId) {
      lsSave(campaignId, next);
      sbUpsert(campaignId, next);
    }
  },

  toggleFolder: (folderId) => {
    const { settings, campaignId } = get();
    const hiddenFolderIds = settings.hiddenFolderIds.includes(folderId)
      ? settings.hiddenFolderIds.filter((id) => id !== folderId)
      : [...settings.hiddenFolderIds, folderId];
    const next = { ...settings, hiddenFolderIds };
    set({ settings: next });
    if (campaignId) {
      lsSave(campaignId, next);
      sbUpsert(campaignId, next);
    }
  },

  setFolderColor: (folderId, color) => {
    const { settings, campaignId } = get();
    const folderColors = { ...settings.folderColors };
    if (color) folderColors[folderId] = color;
    else delete folderColors[folderId];
    const next = { ...settings, folderColors };
    set({ settings: next });
    if (campaignId) {
      lsSave(campaignId, next);
      sbUpsert(campaignId, next);
    }
  },
}));
