alter table npcs
  add column if not exists stat_block jsonb not null default '{}'::jsonb,
  add column if not exists stat_block_visible boolean not null default false;
