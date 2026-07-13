import { supabase } from '../../lib/supabase';
import type { CampaignExport } from './exportCampaign';

/**
 * Campaign import — load a JSON file produced by exportCampaign and
 * recreate it as a NEW campaign owned by the signed-in user. We never
 * overwrite an existing campaign, so the user can safely import without
 * worrying about losing what's already there.
 *
 * ID handling:
 *   - A fresh campaign id + join code are generated.
 *   - Folders, notes, NPCs, homebrew, party, initiative, map scenes and
 *     map tokens all get fresh uuids, with foreign-key references
 *     (parent_id, folder_id, scene_id, active_scene_id, …) rewritten
 *     through a per-table old→new map so referential integrity holds.
 *   - All owner_user_id columns are nulled (party claims, note authors)
 *     except notes, which get reassigned to the importer so they show
 *     up under "your notes" on the new campaign.
 *
 * Skipped from the export by design:
 *   - campaign_members (other than the importer) — those users may not
 *     exist in this account; new players join via the new join code.
 *   - note_permissions — same reason; reset on the new campaign.
 *   - chat_messages and transcripts — never exported in the first place.
 */
export type ImportResult = {
  campaignId: string;
  campaignName: string;
  joinCode: string;
  counts: {
    folders: number;
    notes: number;
    party: number;
    npcs: number;
    homebrew: number;
    initiative: number;
    scenes: number;
    tokens: number;
  };
};

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function randomJoinCode(n = 6) {
  let out = '';
  for (let i = 0; i < n; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

const uid = () => crypto.randomUUID();

/** Drop columns the destination row owns: id (we generate new), campaign_id
 *  (set per insert), created_at / updated_at (DB defaults to now()). */
function stripRow<T extends Record<string, unknown>>(row: T): Partial<T> {
  const { id: _id, campaign_id: _c, created_at: _ca, updated_at: _ua, ...rest } = row as Record<string, unknown>;
  return rest as Partial<T>;
}

export type ImportProgress = (phase: string) => void;

/** Read a File handle and parse it as a CampaignExport, raising a clear
 *  error if the file doesn't look like our export shape. */
export async function parseExportFile(file: File): Promise<CampaignExport> {
  let text: string;
  try {
    text = await file.text();
  } catch (e) {
    throw new Error(`Could not read file: ${e instanceof Error ? e.message : String(e)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`File is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  const obj = parsed as Partial<CampaignExport>;
  if (!obj || typeof obj !== 'object' || obj.version !== 1) {
    throw new Error('Not a Grimoire campaign export (missing or unknown version field).');
  }
  return obj as CampaignExport;
}

export async function importCampaignFromExport(
  data: CampaignExport,
  onProgress?: ImportProgress,
): Promise<ImportResult> {
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw new Error(`Auth: ${userErr.message}`);
  const userId = userRes.user?.id;
  if (!userId) throw new Error('Not signed in.');

  const sourceName =
    ((data.campaign as Record<string, unknown> | null)?.name as string | undefined) ??
    'Imported campaign';
  const newName = `${sourceName} (Imported)`;

  onProgress?.('Creating campaign');

  // 1. Create the campaign. A new join code is generated even if the source
  //    had one — codes are unique campaign-wide and we want a fresh shareable
  //    code for the imported instance.
  let joinCode = randomJoinCode();
  let campaignId: string;
  // Retry once on the (vanishingly rare) join-code collision.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: c, error } = await supabase
      .from('campaigns')
      .insert({ name: newName, join_code: joinCode })
      .select()
      .single();
    if (!error && c) {
      campaignId = c.id as string;
      break;
    }
    if (error && error.code === '23505' && attempt < 2) {
      joinCode = randomJoinCode();
      continue;
    }
    throw new Error(`Create campaign: ${error?.message ?? 'unknown error'}`);
  }
  // The loop above either sets campaignId or throws, but TS can't see that.
  campaignId = campaignId!;

  // 2. Add the importer as GM so subsequent inserts pass the is_gm() RLS
  //    checks. The display name comes from the source's campaigns.created_by
  //    member row if we can spot it; otherwise default to "GM".
  const sourceMembers = (data.members ?? []) as Record<string, unknown>[];
  const sourceGm = sourceMembers.find((m) => m.role === 'gm') ?? sourceMembers[0];
  const displayName = (sourceGm?.display_name as string | undefined) ?? 'GM';

  onProgress?.('Joining as GM');
  const { error: memberErr } = await supabase.from('campaign_members').insert({
    campaign_id: campaignId,
    user_id: userId,
    display_name: displayName,
    role: 'gm',
  });
  if (memberErr) throw new Error(`Add GM: ${memberErr.message}`);

  // 3. Campaign settings — copy the blob, scoped to the new campaign.
  if (data.settings && typeof data.settings === 'object') {
    onProgress?.('Settings');
    const { error } = await supabase
      .from('campaign_settings')
      .upsert(
        { campaign_id: campaignId, settings: data.settings },
        { onConflict: 'campaign_id' },
      );
    if (error) throw new Error(`Settings: ${error.message}`);
  }

  // 4. Note folders. Pre-generate every new id so a single pass can rewrite
  //    parent_id alongside the row.
  const folderMap = new Map<string, string>();
  const sourceFolders = data.noteFolders ?? [];
  for (const f of sourceFolders) folderMap.set(f.id as string, uid());
  const newFolders = sourceFolders.map((f) => {
    const oldParent = f.parent_id as string | null;
    return {
      ...stripRow(f),
      id: folderMap.get(f.id as string)!,
      campaign_id: campaignId,
      parent_id: oldParent ? folderMap.get(oldParent) ?? null : null,
    };
  });
  if (newFolders.length) {
    onProgress?.(`Note folders (${newFolders.length})`);
    const { error } = await supabase.from('note_folders').insert(newFolders);
    if (error) throw new Error(`Folders: ${error.message}`);
  }

  // 5. Notes. Reassign authorship to the importer so the new GM is the
  //    canonical owner. folder_id remapped through the folder map.
  const noteMap = new Map<string, string>();
  const sourceNotes = data.notes ?? [];
  for (const n of sourceNotes) noteMap.set(n.id as string, uid());
  const newNotes = sourceNotes.map((n) => {
    const oldFolderId = n.folder_id as string | null;
    return {
      ...stripRow(n),
      id: noteMap.get(n.id as string)!,
      campaign_id: campaignId,
      folder_id: oldFolderId ? folderMap.get(oldFolderId) ?? null : null,
      owner_user_id: userId,
    };
  });
  if (newNotes.length) {
    onProgress?.(`Notes (${newNotes.length})`);
    const { error } = await supabase.from('notes').insert(newNotes);
    if (error) throw new Error(`Notes: ${error.message}`);
  }

  // 6. Party — null out owner_user_id so players re-claim on the new
  //    campaign. Their claim flow rebinds the row to their account.
  const sourceParty = data.party ?? [];
  const newParty = sourceParty.map((p) => ({
    ...stripRow(p),
    campaign_id: campaignId,
    owner_user_id: null,
  }));
  if (newParty.length) {
    onProgress?.(`Party (${newParty.length})`);
    const { error } = await supabase.from('party_members').insert(newParty);
    if (error) throw new Error(`Party: ${error.message}`);
  }

  // 7. NPCs.
  const sourceNpcs = data.npcs ?? [];
  const newNpcs = sourceNpcs.map((n) => ({
    ...stripRow(n),
    campaign_id: campaignId,
  }));
  if (newNpcs.length) {
    onProgress?.(`NPCs (${newNpcs.length})`);
    const { error } = await supabase.from('npcs').insert(newNpcs);
    if (error) throw new Error(`NPCs: ${error.message}`);
  }

  // 8. Homebrew.
  const sourceHb = data.homebrew ?? [];
  const newHb = sourceHb.map((h) => ({ ...stripRow(h), campaign_id: campaignId }));
  if (newHb.length) {
    onProgress?.(`Homebrew (${newHb.length})`);
    const { error } = await supabase.from('homebrew').insert(newHb);
    if (error) throw new Error(`Homebrew: ${error.message}`);
  }

  // 9. Initiative entries.
  const sourceInit = data.initiative ?? [];
  const newInit = sourceInit.map((i) => ({ ...stripRow(i), campaign_id: campaignId }));
  if (newInit.length) {
    onProgress?.(`Initiative (${newInit.length})`);
    const { error } = await supabase.from('initiative_entries').insert(newInit);
    if (error) throw new Error(`Initiative: ${error.message}`);
  }

  // 10. Map scenes — only present in exports from 1.1.0 onwards. Pre-allocate
  //     new ids so map_state.active_scene_id and map_tokens.scene_id can be
  //     remapped in one pass without a second round-trip.
  const sceneMap = new Map<string, string>();
  const sourceScenes = data.mapScenes ?? [];
  for (const s of sourceScenes) sceneMap.set(s.id as string, uid());
  const newScenes = sourceScenes.map((s) => ({
    ...stripRow(s),
    id: sceneMap.get(s.id as string)!,
    campaign_id: campaignId,
  }));
  if (newScenes.length) {
    onProgress?.(`Map scenes (${newScenes.length})`);
    const { error } = await supabase.from('map_scenes').insert(newScenes);
    if (error) throw new Error(`Map scenes: ${error.message}`);
  }

  // 11. Map state — single row keyed by campaign_id. Rewrite active /
  //     preview scene pointers through the scene map; the preview pointer
  //     gets nulled so the new GM lands on the active scene first.
  if (data.mapState) {
    onProgress?.('Map state');
    const ms = data.mapState as Record<string, unknown>;
    const oldActive = ms.active_scene_id as string | null;
    const { error } = await supabase.from('map_state').upsert(
      {
        ...stripRow(ms),
        campaign_id: campaignId,
        active_scene_id: oldActive ? sceneMap.get(oldActive) ?? null : null,
        gm_preview_scene_id: null,
      },
      { onConflict: 'campaign_id' },
    );
    if (error) throw new Error(`Map state: ${error.message}`);
  }

  // 12. Map tokens — remap scene_id through the scene map, null owner so
  //     players re-place their PC tokens on the new campaign.
  const sourceTokens = data.mapTokens ?? [];
  const newTokens = sourceTokens.map((t) => {
    const oldScene = t.scene_id as string | null;
    return {
      ...stripRow(t),
      campaign_id: campaignId,
      scene_id: oldScene ? sceneMap.get(oldScene) ?? null : null,
      owner_user_id: null,
    };
  });
  if (newTokens.length) {
    onProgress?.(`Map tokens (${newTokens.length})`);
    const { error } = await supabase.from('map_tokens').insert(newTokens);
    if (error) throw new Error(`Map tokens: ${error.message}`);
  }

  return {
    campaignId,
    campaignName: newName,
    joinCode,
    counts: {
      folders: newFolders.length,
      notes: newNotes.length,
      party: newParty.length,
      npcs: newNpcs.length,
      homebrew: newHb.length,
      initiative: newInit.length,
      scenes: newScenes.length,
      tokens: newTokens.length,
    },
  };
}
