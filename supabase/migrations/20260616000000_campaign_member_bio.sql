-- =============================================
-- Campaign member bio — a short freeform description of the player /
-- character that the player owns and edits on their dashboard.
-- =============================================

alter table campaign_members
  add column if not exists bio text not null default '';
