-- =============================================
-- D&D GM Screen — Campaign Collaboration Schema
-- =============================================
-- Run each numbered section SEPARATELY in the Supabase SQL Editor.
-- (Select the section, press Run. Then move to the next one.)
-- Safe to re-run each section.
-- =============================================


-- =============================================
-- SECTION 1 — Tables
-- =============================================

create table if not exists campaigns (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  join_code   text not null unique,
  created_by  uuid not null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists campaign_members (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references campaigns(id) on delete cascade,
  user_id       uuid not null default auth.uid(),
  display_name  text not null,
  role          text not null check (role in ('gm','player')),
  joined_at     timestamptz not null default now(),
  unique (campaign_id, user_id)
);
create index if not exists campaign_members_by_campaign on campaign_members(campaign_id);

create table if not exists notes (
  id                 uuid primary key default gen_random_uuid(),
  campaign_id        uuid not null references campaigns(id) on delete cascade,
  title              text not null default 'Untitled',
  body               text not null default '',
  visible_to_players boolean not null default false,
  owner_user_id      uuid,
  created_by         uuid not null default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists notes_campaign_idx on notes(campaign_id);

create table if not exists party_members (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references campaigns(id) on delete cascade,
  owner_user_id uuid,
  name          text not null,
  class         text,
  race          text,
  level         int not null default 1,
  hp_current    int not null default 0,
  hp_max        int not null default 0,
  ac            int not null default 10,
  notes         text,
  data          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists party_members_campaign_idx on party_members(campaign_id);

create table if not exists map_state (
  campaign_id    uuid primary key references campaigns(id) on delete cascade,
  background_url text,
  grid_size      int not null default 50,
  width          int not null default 1000,
  height         int not null default 1000,
  data           jsonb not null default '{}'::jsonb,
  updated_at     timestamptz not null default now()
);

create table if not exists map_tokens (
  id                  uuid primary key default gen_random_uuid(),
  campaign_id         uuid not null references campaigns(id) on delete cascade,
  owner_user_id       uuid,
  label               text not null,
  color               text not null default '#f87171',
  x                   double precision not null default 0,
  y                   double precision not null default 0,
  hidden_from_players boolean not null default false,
  size                int not null default 1,
  data                jsonb not null default '{}'::jsonb,
  updated_at          timestamptz not null default now()
);
create index if not exists map_tokens_campaign_idx on map_tokens(campaign_id);

create table if not exists homebrew (
  id                 uuid primary key default gen_random_uuid(),
  campaign_id        uuid not null references campaigns(id) on delete cascade,
  kind               text not null,
  name               text not null,
  visible_to_players boolean not null default false,
  data               jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists homebrew_campaign_idx on homebrew(campaign_id);

create table if not exists shop_items (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references campaigns(id) on delete cascade,
  name         text not null,
  price_gp     numeric(10,2) not null default 0,
  stock        int not null default 0,
  description  text,
  data         jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now()
);
create index if not exists shop_items_campaign_idx on shop_items(campaign_id);

create table if not exists stat_blocks (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references campaigns(id) on delete cascade,
  name         text not null,
  data         jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now()
);
create index if not exists stat_blocks_campaign_idx on stat_blocks(campaign_id);

create table if not exists transcripts (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references campaigns(id) on delete cascade,
  note_id      uuid references notes(id) on delete set null,
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  body         text not null default ''
);
create index if not exists transcripts_campaign_idx on transcripts(campaign_id);


-- =============================================
-- SECTION 2 — Helper functions
-- =============================================

create or replace function public.is_member(p_campaign uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $func$
  select exists (
    select 1 from campaign_members
    where campaign_id = p_campaign and user_id = auth.uid()
  );
$func$;

create or replace function public.is_gm(p_campaign uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $func$
  select exists (
    select 1 from campaign_members
    where campaign_id = p_campaign and user_id = auth.uid() and role = 'gm'
  );
$func$;


-- =============================================
-- SECTION 3 — Enable RLS
-- =============================================

alter table campaigns         enable row level security;
alter table campaign_members  enable row level security;
alter table notes             enable row level security;
alter table party_members     enable row level security;
alter table map_state         enable row level security;
alter table map_tokens        enable row level security;
alter table homebrew          enable row level security;
alter table shop_items        enable row level security;
alter table stat_blocks       enable row level security;
alter table transcripts       enable row level security;


-- =============================================
-- SECTION 4 — Policies: campaigns + campaign_members
-- =============================================

drop policy if exists campaigns_select on campaigns;
create policy campaigns_select on campaigns for select to authenticated using (true);

drop policy if exists campaigns_insert on campaigns;
create policy campaigns_insert on campaigns for insert to authenticated with check (auth.uid() = created_by);

drop policy if exists campaigns_update on campaigns;
create policy campaigns_update on campaigns for update to authenticated using (is_gm(id)) with check (is_gm(id));

drop policy if exists campaigns_delete on campaigns;
create policy campaigns_delete on campaigns for delete to authenticated using (is_gm(id));

drop policy if exists members_select on campaign_members;
create policy members_select on campaign_members for select to authenticated using (is_member(campaign_id));

drop policy if exists members_insert on campaign_members;
create policy members_insert on campaign_members for insert to authenticated with check (user_id = auth.uid());

drop policy if exists members_update on campaign_members;
create policy members_update on campaign_members for update to authenticated using (user_id = auth.uid() or is_gm(campaign_id));

drop policy if exists members_delete on campaign_members;
create policy members_delete on campaign_members for delete to authenticated using (user_id = auth.uid() or is_gm(campaign_id));


-- =============================================
-- SECTION 5 — Policies: notes + party_members
-- =============================================

drop policy if exists notes_select on notes;
create policy notes_select on notes for select to authenticated
  using (is_gm(campaign_id) or (is_member(campaign_id) and (visible_to_players or owner_user_id = auth.uid())));

drop policy if exists notes_insert on notes;
create policy notes_insert on notes for insert to authenticated
  with check (is_gm(campaign_id) or (is_member(campaign_id) and owner_user_id = auth.uid()));

drop policy if exists notes_update on notes;
create policy notes_update on notes for update to authenticated
  using (is_gm(campaign_id) or (is_member(campaign_id) and owner_user_id = auth.uid()))
  with check (is_gm(campaign_id) or (is_member(campaign_id) and owner_user_id = auth.uid()));

drop policy if exists notes_delete on notes;
create policy notes_delete on notes for delete to authenticated
  using (is_gm(campaign_id) or (is_member(campaign_id) and owner_user_id = auth.uid()));

drop policy if exists party_select on party_members;
create policy party_select on party_members for select to authenticated using (is_member(campaign_id));

drop policy if exists party_insert on party_members;
create policy party_insert on party_members for insert to authenticated with check (is_gm(campaign_id));

drop policy if exists party_update on party_members;
create policy party_update on party_members for update to authenticated using (is_gm(campaign_id) or (is_member(campaign_id) and (owner_user_id is null or owner_user_id = auth.uid()))) with check (is_gm(campaign_id) or (is_member(campaign_id) and owner_user_id = auth.uid()));

drop policy if exists party_delete on party_members;
create policy party_delete on party_members for delete to authenticated using (is_gm(campaign_id));


-- =============================================
-- SECTION 6 — Policies: map + homebrew + shop + statblocks + transcripts
-- =============================================

drop policy if exists map_state_select on map_state;
create policy map_state_select on map_state for select to authenticated using (is_member(campaign_id));

drop policy if exists map_state_all on map_state;
create policy map_state_all on map_state for all to authenticated using (is_gm(campaign_id)) with check (is_gm(campaign_id));

drop policy if exists map_tokens_select on map_tokens;
create policy map_tokens_select on map_tokens for select to authenticated using (is_gm(campaign_id) or (is_member(campaign_id) and not hidden_from_players));

drop policy if exists map_tokens_insert on map_tokens;
create policy map_tokens_insert on map_tokens for insert to authenticated with check (is_gm(campaign_id));

drop policy if exists map_tokens_update on map_tokens;
create policy map_tokens_update on map_tokens for update to authenticated using (is_gm(campaign_id) or (is_member(campaign_id) and owner_user_id = auth.uid() and not hidden_from_players)) with check (is_gm(campaign_id) or (is_member(campaign_id) and owner_user_id = auth.uid() and not hidden_from_players));

drop policy if exists map_tokens_delete on map_tokens;
create policy map_tokens_delete on map_tokens for delete to authenticated using (is_gm(campaign_id));

drop policy if exists homebrew_select on homebrew;
create policy homebrew_select on homebrew for select to authenticated using (is_gm(campaign_id) or (is_member(campaign_id) and visible_to_players));

drop policy if exists homebrew_write on homebrew;
create policy homebrew_write on homebrew for all to authenticated using (is_gm(campaign_id)) with check (is_gm(campaign_id));

drop policy if exists shop_select on shop_items;
create policy shop_select on shop_items for select to authenticated using (is_member(campaign_id));

drop policy if exists shop_write on shop_items;
create policy shop_write on shop_items for all to authenticated using (is_gm(campaign_id)) with check (is_gm(campaign_id));

drop policy if exists statblocks_all on stat_blocks;
create policy statblocks_all on stat_blocks for all to authenticated using (is_gm(campaign_id)) with check (is_gm(campaign_id));

drop policy if exists transcripts_all on transcripts;
create policy transcripts_all on transcripts for all to authenticated using (is_gm(campaign_id)) with check (is_gm(campaign_id));


-- =============================================
-- SECTION 7 — updated_at trigger (OPTIONAL — skip if it errors)
-- =============================================

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $func$
begin
  new.updated_at = now();
  return new;
end;
$func$;

drop trigger if exists campaigns_touch     on campaigns;
create trigger campaigns_touch     before update on campaigns     for each row execute function touch_updated_at();

drop trigger if exists notes_touch         on notes;
create trigger notes_touch         before update on notes         for each row execute function touch_updated_at();

drop trigger if exists party_members_touch on party_members;
create trigger party_members_touch before update on party_members for each row execute function touch_updated_at();

drop trigger if exists map_state_touch     on map_state;
create trigger map_state_touch     before update on map_state     for each row execute function touch_updated_at();

drop trigger if exists map_tokens_touch    on map_tokens;
create trigger map_tokens_touch    before update on map_tokens    for each row execute function touch_updated_at();

drop trigger if exists homebrew_touch      on homebrew;
create trigger homebrew_touch      before update on homebrew      for each row execute function touch_updated_at();

drop trigger if exists shop_items_touch    on shop_items;
create trigger shop_items_touch    before update on shop_items    for each row execute function touch_updated_at();

drop trigger if exists stat_blocks_touch   on stat_blocks;
create trigger stat_blocks_touch   before update on stat_blocks   for each row execute function touch_updated_at();


-- =============================================
-- SECTION 7b — note_folders (hierarchical folder tree per campaign)
-- Run this section once.
-- =============================================

create table if not exists note_folders (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references campaigns(id) on delete cascade,
  parent_id    uuid references note_folders(id) on delete cascade,
  name         text not null default 'New Folder',
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists note_folders_campaign_idx on note_folders(campaign_id);
create index if not exists note_folders_parent_idx on note_folders(parent_id);

alter table note_folders enable row level security;

drop policy if exists note_folders_select on note_folders;
create policy note_folders_select on note_folders for select to authenticated using (is_member(campaign_id));

-- Members can create folders; only GMs can update or delete them
drop policy if exists note_folders_write on note_folders;
drop policy if exists note_folders_insert on note_folders;
drop policy if exists note_folders_update on note_folders;
drop policy if exists note_folders_delete on note_folders;
create policy note_folders_insert on note_folders for insert to authenticated
  with check (is_member(campaign_id));
create policy note_folders_update on note_folders for update to authenticated
  using (is_gm(campaign_id)) with check (is_gm(campaign_id));
create policy note_folders_delete on note_folders for delete to authenticated
  using (is_gm(campaign_id));

drop trigger if exists note_folders_touch on note_folders;
create trigger note_folders_touch before update on note_folders for each row execute function touch_updated_at();

-- Add folder_id to notes if missing
alter table notes add column if not exists folder_id uuid references note_folders(id) on delete set null;
create index if not exists notes_folder_idx on notes(folder_id);


-- =============================================
-- SECTION 8 — Realtime publication (OPTIONAL)
-- Ignore "relation is already member of publication" errors — that just means
-- that table is already subscribed.
-- =============================================

alter publication supabase_realtime add table campaigns;
alter publication supabase_realtime add table campaign_members;
alter publication supabase_realtime add table notes;
alter publication supabase_realtime add table party_members;
alter publication supabase_realtime add table map_state;
alter publication supabase_realtime add table map_tokens;
alter publication supabase_realtime add table homebrew;
alter publication supabase_realtime add table shop_items;
alter publication supabase_realtime add table stat_blocks;
alter publication supabase_realtime add table transcripts;
alter publication supabase_realtime add table note_folders;
