-- =============================================
-- Campaign spectator access — read-only cross-campaign browsing.
-- =============================================
-- Lets a user browse (never edit) a campaign they aren't a member of, as
-- long as they share at least one campaign with someone who IS a member of
-- it. This powers the Dashboard's member-profile popover ("their other
-- campaigns") and the read-only spectator view opened from it. Purely
-- additive: every change below is an `or` clause appended to an existing
-- SELECT policy, so is_member()/is_gm() access is unaffected and no
-- insert/update/delete policy changes anywhere.
--
-- Known limitation: members_select below grants visibility per-row based on
-- the row's own user_id, so the roster of a spectated campaign only shows
-- members the viewer independently shares a campaign with — not
-- necessarily every member of that campaign. Acceptable for v1.

create or replace function public.shares_campaign_with(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $func$
  select exists (
    select 1 from campaign_members mine
    join campaign_members theirs on theirs.campaign_id = mine.campaign_id
    where mine.user_id = auth.uid() and theirs.user_id = p_user
  );
$func$;

create or replace function public.is_spectator(p_campaign uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $func$
  select exists (
    select 1 from campaign_members target
    where target.campaign_id = p_campaign
      and public.shares_campaign_with(target.user_id)
  );
$func$;

-- campaign_members: see any row belonging to someone you already share a
-- campaign with — this is what lets the profile popover list every
-- campaign that person belongs to, not just mutual ones.
drop policy if exists members_select on campaign_members;
create policy members_select on campaign_members for select to authenticated
  using (is_member(campaign_id) or shares_campaign_with(user_id));

-- party_members has no visible_to_players gate today (already fully
-- visible to members), so spectators get the same.
drop policy if exists party_select on party_members;
create policy party_select on party_members for select to authenticated
  using (is_member(campaign_id) or is_spectator(campaign_id));

drop policy if exists npcs_select on npcs;
create policy npcs_select on npcs for select to authenticated
  using (
    is_gm(campaign_id)
    or (is_member(campaign_id) and visible_to_players = true)
    or (is_spectator(campaign_id) and visible_to_players = true)
  );

drop policy if exists notes_select on notes;
create policy notes_select on notes for select to authenticated
  using (
    is_gm(campaign_id)
    or (is_member(campaign_id) and owner_user_id = auth.uid())
    or (is_member(campaign_id) and visible_to_players)
    or (is_spectator(campaign_id) and visible_to_players)
    or exists (
      select 1 from note_permissions p
      where p.note_id = notes.id and p.user_id = auth.uid() and p.can_view
    )
  );
