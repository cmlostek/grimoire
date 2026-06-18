-- =============================================
-- User profiles (global, one row per auth user) + avatars storage bucket
-- =============================================
-- Profiles are global rather than per-campaign because per-user prefs that
-- don't vary by campaign live here (avatar today; could grow to default
-- display_name, language, etc.). RLS allows everyone to *read* any profile —
-- avatars are public-ish — but only the owner can write their own row.

create table if not exists user_profiles (
  user_id     uuid primary key,
  avatar_path text,
  updated_at  timestamptz not null default now()
);

alter table user_profiles enable row level security;

drop policy if exists user_profiles_select on user_profiles;
create policy user_profiles_select on user_profiles for select to authenticated using (true);

drop policy if exists user_profiles_insert on user_profiles;
create policy user_profiles_insert on user_profiles for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists user_profiles_update on user_profiles;
create policy user_profiles_update on user_profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists user_profiles_delete on user_profiles;
create policy user_profiles_delete on user_profiles for delete to authenticated
  using (user_id = auth.uid());

alter publication supabase_realtime add table user_profiles;


-- ── Avatars storage bucket ───────────────────────────────────────────────
-- Public bucket so <img src> can render without a presigned URL. Writes are
-- gated by the policies below: each user can only put files under a folder
-- named after their auth.uid().

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
  on storage.objects for select to public
  using (bucket_id = 'avatars');

drop policy if exists "avatars_owner_write" on storage.objects;
create policy "avatars_owner_write"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_owner_update" on storage.objects;
create policy "avatars_owner_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_owner_delete" on storage.objects;
create policy "avatars_owner_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
