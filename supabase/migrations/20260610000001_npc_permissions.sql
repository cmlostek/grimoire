create table if not exists npc_permissions (
  npc_id    uuid not null references npcs(id) on delete cascade,
  user_id   uuid not null,
  can_view  boolean not null default false,
  primary key (npc_id, user_id)
);
create index if not exists npc_permissions_user_idx on npc_permissions(user_id);

alter table npc_permissions enable row level security;

create or replace function public.npc_campaign(p_npc uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$ select campaign_id from npcs where id = p_npc $$;

drop policy if exists npc_perms_select on npc_permissions;
create policy npc_perms_select on npc_permissions for select to authenticated
  using (is_gm(npc_campaign(npc_id)) or user_id = auth.uid());

drop policy if exists npc_perms_write on npc_permissions;
create policy npc_perms_write on npc_permissions for all to authenticated
  using (is_gm(npc_campaign(npc_id)))
  with check (is_gm(npc_campaign(npc_id)));

drop policy if exists npcs_select on npcs;
create policy npcs_select on npcs for select to authenticated
  using (
    is_gm(campaign_id)
    or (is_member(campaign_id) and visible_to_players = true)
    or exists (
      select 1 from npc_permissions p
      where p.npc_id = npcs.id and p.user_id = auth.uid() and p.can_view = true
    )
  );

alter publication supabase_realtime add table npc_permissions;
