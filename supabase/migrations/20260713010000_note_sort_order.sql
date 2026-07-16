-- =============================================
-- Notes: per-user drag-to-reorder in the sidebar.
-- =============================================
-- Stores the whole ordered id array per (user, folder) rather than a
-- numeric sort_order per note — campaigns have at most a few dozen notes,
-- so rewriting the array on every drag is simple and cheap, and avoids
-- fractional-index bookkeeping. Purely personal view state: RLS is a
-- single "own rows only" policy, no GM bypass needed since there's no
-- sharing involved.

create table if not exists note_sort_order (
  user_id uuid not null,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  folder_key text not null,        -- a folder's id, or 'root'
  order_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, campaign_id, folder_key)
);

alter table note_sort_order enable row level security;

drop policy if exists note_sort_order_all on note_sort_order;
create policy note_sort_order_all on note_sort_order for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
