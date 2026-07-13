-- =============================================
-- Notes: transfer ownership between players.
-- =============================================
-- Adds a narrowly-scoped SECURITY DEFINER RPC for reassigning a note's
-- owner_user_id. Deliberately NOT done by loosening the notes_update RLS
-- policy: that policy's `with check` clause re-validates the *new* row, and
-- its only unconditional branch is is_gm(campaign_id) — a non-GM owner
-- reassigning ownership away from themselves would fail every other branch
-- (owner_user_id = auth.uid() no longer holds for the new row) and be
-- silently rejected. Loosening `with check` generally would also let anyone
-- with mere note_permissions.can_edit reassign ownership, a privilege
-- escalation. This function does its own explicit auth check instead,
-- matching the existing is_gm/is_member/note_author SECURITY DEFINER
-- convention already used throughout schema.sql.

create or replace function public.transfer_note_ownership(p_note_id uuid, p_new_owner uuid)
returns void
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_campaign_id uuid;
  v_owner_user_id uuid;
begin
  select campaign_id, owner_user_id into v_campaign_id, v_owner_user_id
  from notes where id = p_note_id;

  if v_campaign_id is null then
    raise exception 'note not found';
  end if;

  -- Only the GM/co-GM, or the note's *current* owner, may hand it off.
  if not (public.is_gm(v_campaign_id) or v_owner_user_id = auth.uid()) then
    raise exception 'not authorized to transfer this note';
  end if;

  if not exists (
    select 1 from campaign_members
    where campaign_id = v_campaign_id and user_id = p_new_owner
  ) then
    raise exception 'new owner is not a member of this campaign';
  end if;

  update notes set owner_user_id = p_new_owner, updated_at = now()
  where id = p_note_id;
end;
$func$;

grant execute on function public.transfer_note_ownership(uuid, uuid) to authenticated;
