-- =============================================
-- Initiative state — sync the turn pointer (round + whose turn it is).
-- =============================================
-- The combatant rows live in initiative_entries and already sync via realtime,
-- but the *pointer* (current round + active turn index) used to live only in
-- each client's localStorage. That meant players never saw the turn advance —
-- their "Acting" highlight and round counter were frozen. This table holds the
-- shared pointer: the GM writes it on Next/Sort/Reset, everyone reads it.

create table if not exists initiative_state (
  campaign_id  uuid primary key references campaigns(id) on delete cascade,
  round        int not null default 1,
  turn_index   int not null default 0,
  updated_at   timestamptz not null default now()
);

alter table initiative_state enable row level security;

-- Every campaign member can read the current round/turn.
drop policy if exists initiative_state_select on initiative_state;
create policy initiative_state_select on initiative_state
  for select to authenticated
  using (is_member(campaign_id));

-- Only the GM advances the encounter.
drop policy if exists initiative_state_write on initiative_state;
create policy initiative_state_write on initiative_state
  for all to authenticated
  using (is_gm(campaign_id)) with check (is_gm(campaign_id));

drop trigger if exists initiative_state_touch on initiative_state;
create trigger initiative_state_touch before update on initiative_state
  for each row execute function touch_updated_at();

alter publication supabase_realtime add table initiative_state;
