-- =============================================
-- NPC stat blocks (v1.0.1)
-- =============================================
-- Adds a per-NPC stat block (JSONB) plus a separate visibility flag so the
-- GM can reveal an NPC's identity while keeping their stats hidden, or vice
-- versa. The existing `visible_to_players` continues to gate whether the
-- player can see the NPC entry at all.

ALTER TABLE npcs
  ADD COLUMN IF NOT EXISTS stat_block          JSONB   NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS stat_block_visible  BOOLEAN NOT NULL DEFAULT FALSE;
