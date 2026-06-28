import { supabase } from '../../lib/supabase';

/**
 * Campaign export — gather every campaign-scoped table into a single JSON
 * snapshot the GM can download for backup or off-platform archival.
 *
 * Intentionally excludes chat_messages and transcripts (large, private, and
 * not what most GMs want in a backup). Includes party / notes / npcs /
 * homebrew / settings / maps / initiative — the rebuildable content.
 *
 * Output shape — pinned to `version` so future imports can branch on it:
 *
 *   {
 *     version: 1,
 *     exportedAt: ISO timestamp,
 *     campaign: { id, name, join_code, created_at, … },
 *     members: [...campaign_members rows],
 *     settings: { ...campaign_settings.settings },
 *     party: [...party_members rows],
 *     notes: [...notes rows],
 *     noteFolders: [...note_folders rows],
 *     npcs: [...npcs rows],
 *     homebrew: [...homebrew rows],
 *     initiative: [...initiative_entries rows],
 *     mapState: { ...map_state row | null },
 *     mapTokens: [...map_tokens rows],
 *   }
 */
export type CampaignExport = {
  version: 1;
  exportedAt: string;
  campaign: Record<string, unknown> | null;
  members: Record<string, unknown>[];
  settings: Record<string, unknown> | null;
  party: Record<string, unknown>[];
  notes: Record<string, unknown>[];
  noteFolders: Record<string, unknown>[];
  npcs: Record<string, unknown>[];
  homebrew: Record<string, unknown>[];
  initiative: Record<string, unknown>[];
  mapState: Record<string, unknown> | null;
  /** Added after the original export was implemented — older snapshots
   *  may omit this key and the import path treats absence as "no scenes". */
  mapScenes?: Record<string, unknown>[];
  mapTokens: Record<string, unknown>[];
};

async function fetchAll(table: string, campaignId: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase.from(table).select('*').eq('campaign_id', campaignId);
  if (error) {
    // Soft-fail per-table — if one table doesn't exist or fails RLS the rest
    // of the export still works.
    return [];
  }
  return (data ?? []) as Record<string, unknown>[];
}

export async function buildCampaignExport(campaignId: string): Promise<CampaignExport> {
  const [
    campaignRow,
    members,
    settingsRow,
    party,
    notes,
    noteFolders,
    npcs,
    homebrew,
    initiative,
    mapStateRow,
    mapScenes,
    mapTokens,
  ] = await Promise.all([
    supabase.from('campaigns').select('*').eq('id', campaignId).maybeSingle().then((r) => r.data),
    fetchAll('campaign_members', campaignId),
    supabase.from('campaign_settings').select('settings').eq('campaign_id', campaignId).maybeSingle().then((r) => r.data),
    fetchAll('party_members', campaignId),
    fetchAll('notes', campaignId),
    fetchAll('note_folders', campaignId),
    fetchAll('npcs', campaignId),
    fetchAll('homebrew', campaignId),
    fetchAll('initiative_entries', campaignId),
    supabase.from('map_state').select('*').eq('campaign_id', campaignId).maybeSingle().then((r) => r.data),
    fetchAll('map_scenes', campaignId),
    fetchAll('map_tokens', campaignId),
  ]);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    campaign: (campaignRow as Record<string, unknown>) ?? null,
    members,
    settings: (settingsRow as { settings?: Record<string, unknown> } | null)?.settings ?? null,
    party,
    notes,
    noteFolders,
    npcs,
    homebrew,
    initiative,
    mapState: (mapStateRow as Record<string, unknown>) ?? null,
    mapScenes,
    mapTokens,
  };
}

/** Build the export, JSON-encode, and trigger a browser download. */
export async function downloadCampaignExport(campaignId: string, campaignName: string | null) {
  const data = await buildCampaignExport(campaignId);
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = (campaignName ?? 'campaign').replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `grimoire-${safeName}-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Allow the browser to finish the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return data;
}
