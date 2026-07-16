-- =============================================
-- Ritual countdowns — shared castable-in-N countdown surfaced in Initiative.
-- =============================================
-- A caster starts a ritual that becomes castable after a number of combat
-- rounds or a wall-clock duration. Everyone in the campaign sees it in the
-- initiative tracker; the caster (owner) or a GM can start/dismiss one.
--
--   mode = 'rounds'   → rounds_remaining decremented by the GM's Next at the
--                       end of each round (mirrors timed conditions). 0 = ready.
--   mode = 'minutes'  → expires_at is an absolute timestamp; every client
--                       derives the remaining time from the wall clock. No
--                       server ticking, so it stays in sync automatically.
--
-- party_member_id links back to the character sheet (nullable so a ritual can
-- outlive the row it referenced). owner_user_id drives RLS writes and lets the
-- map focus the caster's token.

create table if not exists ritual_countdowns (
  id               uuid primary key default gen_random_uuid(),
  campaign_id      uuid not null references campaigns(id) on delete cascade,
  owner_user_id    uuid references auth.users(id) on delete set null,
  party_member_id  uuid references party_members(id) on delete set null,
  caster_name      text not null default '',
  spell_name       text not null default '',
  mode             text not null default 'rounds' check (mode in ('rounds', 'minutes')),
  rounds_remaining int,
  expires_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists ritual_countdowns_campaign_idx on ritual_countdowns(campaign_id);

alter table ritual_countdowns enable row level security;

-- Any campaign member can see active rituals.
drop policy if exists ritual_countdowns_select on ritual_countdowns;
create policy ritual_countdowns_select on ritual_countdowns
  for select to authenticated
  using (is_member(campaign_id));

-- The caster who owns the ritual, or any GM, can start/update/dismiss it.
drop policy if exists ritual_countdowns_write on ritual_countdowns;
create policy ritual_countdowns_write on ritual_countdowns
  for all to authenticated
  using (is_gm(campaign_id) or owner_user_id = auth.uid())
  with check (is_gm(campaign_id) or owner_user_id = auth.uid());

drop trigger if exists ritual_countdowns_touch on ritual_countdowns;
create trigger ritual_countdowns_touch before update on ritual_countdowns
  for each row execute function touch_updated_at();

alter publication supabase_realtime add table ritual_countdowns;
