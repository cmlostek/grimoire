-- =============================================
-- Campaign member color — per-player chat color
-- =============================================
-- Default '#94a3b8' (slate-400) is the same neutral color used as the
-- placeholder elsewhere. Players can update their own row (existing
-- members_update policy covers this).

alter table campaign_members
  add column if not exists color text not null default '#94a3b8';
