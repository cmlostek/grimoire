-- =============================================
-- Chat messages — party chat with whispers, mentions, edit/delete
-- =============================================

create table if not exists chat_messages (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references campaigns(id) on delete cascade,
  sender_id    uuid not null default auth.uid(),
  body         text not null,
  mentions     uuid[] not null default '{}',
  whisper_to   uuid[],
  edited_at    timestamptz,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists chat_messages_campaign_created_idx
  on chat_messages (campaign_id, created_at desc);

create index if not exists chat_messages_whisper_to_idx
  on chat_messages using gin (whisper_to);

alter table chat_messages enable row level security;

-- SELECT: campaign members can read public messages; whispers only visible
-- to sender and recipients. RLS is the source of truth — never trust the
-- client to filter whispers.
drop policy if exists chat_messages_select on chat_messages;
create policy chat_messages_select on chat_messages for select to authenticated
  using (
    is_member(campaign_id)
    and (
      whisper_to is null
      or sender_id = auth.uid()
      or auth.uid() = any(whisper_to)
    )
  );

drop policy if exists chat_messages_insert on chat_messages;
create policy chat_messages_insert on chat_messages for insert to authenticated
  with check (is_member(campaign_id) and sender_id = auth.uid());

-- UPDATE: senders can edit their own messages (body/edited_at) or soft-delete
-- them. GMs can soft-delete any message in their campaign for moderation.
-- Hard deletes are not allowed via RLS (no DELETE policy).
drop policy if exists chat_messages_update on chat_messages;
create policy chat_messages_update on chat_messages for update to authenticated
  using (sender_id = auth.uid() or is_gm(campaign_id))
  with check (sender_id = auth.uid() or is_gm(campaign_id));

alter publication supabase_realtime add table chat_messages;
