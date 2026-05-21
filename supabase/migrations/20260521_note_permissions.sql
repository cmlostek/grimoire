-- =============================================
-- Per-user note permissions (v1.0.1)
-- =============================================
-- Replaces the boolean-pair (visible_to_players, player_editable) with a
-- per-user view/edit matrix. The old columns remain for backwards-compat
-- and are kept in sync by an INSERT-on-first-share migration below; they
-- will be dropped in v1.0.2 once all clients are updated.

CREATE TABLE IF NOT EXISTS note_permissions (
  note_id   UUID    NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  user_id   UUID    NOT NULL,
  can_view  BOOLEAN NOT NULL DEFAULT FALSE,
  can_edit  BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (note_id, user_id)
);

CREATE INDEX IF NOT EXISTS note_permissions_user_idx ON note_permissions(user_id);

ALTER TABLE note_permissions ENABLE ROW LEVEL SECURITY;

-- Helper: campaign for a note (used in policies below).
-- SECURITY DEFINER so RLS on `notes` doesn't recursively block the lookup
-- (a user we're sharing TO may not yet have row access to the note itself).
CREATE OR REPLACE FUNCTION public.note_campaign(p_note UUID)
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
  SELECT campaign_id FROM notes WHERE id = p_note;
$func$;

-- Members of the campaign can read permission rows that name them, plus
-- the GM and the note's author can read all rows for their notes.
DROP POLICY IF EXISTS note_permissions_select ON note_permissions;
CREATE POLICY note_permissions_select ON note_permissions
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR is_gm(note_campaign(note_id))
    OR EXISTS (
      SELECT 1 FROM notes n
      WHERE n.id = note_id AND n.owner_user_id = auth.uid()
    )
  );

-- Only the note's author or a GM can write permission rows.
DROP POLICY IF EXISTS note_permissions_write ON note_permissions;
CREATE POLICY note_permissions_write ON note_permissions
  FOR ALL TO authenticated
  USING (
    is_gm(note_campaign(note_id))
    OR EXISTS (
      SELECT 1 FROM notes n
      WHERE n.id = note_id AND n.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    is_gm(note_campaign(note_id))
    OR EXISTS (
      SELECT 1 FROM notes n
      WHERE n.id = note_id AND n.owner_user_id = auth.uid()
    )
  );

ALTER PUBLICATION supabase_realtime ADD TABLE note_permissions;

-- =============================================
-- Update notes RLS to consult note_permissions
-- =============================================

DROP POLICY IF EXISTS notes_select ON notes;
CREATE POLICY notes_select ON notes FOR SELECT TO authenticated
  USING (
    is_gm(campaign_id)
    OR (is_member(campaign_id) AND owner_user_id = auth.uid())
    -- Legacy: visible_to_players still works until the column is dropped.
    OR (is_member(campaign_id) AND visible_to_players)
    -- New: explicit per-user view grant.
    OR EXISTS (
      SELECT 1 FROM note_permissions p
      WHERE p.note_id = notes.id AND p.user_id = auth.uid() AND p.can_view
    )
  );

DROP POLICY IF EXISTS notes_update ON notes;
CREATE POLICY notes_update ON notes FOR UPDATE TO authenticated
  USING (
    is_gm(campaign_id)
    OR (is_member(campaign_id) AND owner_user_id = auth.uid())
    -- Legacy: player_editable column.
    OR (is_member(campaign_id) AND visible_to_players AND COALESCE(player_editable, FALSE))
    -- New: explicit per-user edit grant.
    OR EXISTS (
      SELECT 1 FROM note_permissions p
      WHERE p.note_id = notes.id AND p.user_id = auth.uid() AND p.can_edit
    )
  )
  WITH CHECK (
    is_gm(campaign_id)
    OR (is_member(campaign_id) AND owner_user_id = auth.uid())
    OR (is_member(campaign_id) AND visible_to_players AND COALESCE(player_editable, FALSE))
    OR EXISTS (
      SELECT 1 FROM note_permissions p
      WHERE p.note_id = notes.id AND p.user_id = auth.uid() AND p.can_edit
    )
  );

-- =============================================
-- One-time backfill from legacy boolean pair
-- =============================================
-- For every note that was previously shared with all players, create an
-- explicit per-user row so the new matrix UI shows accurate state.
INSERT INTO note_permissions (note_id, user_id, can_view, can_edit)
SELECT
  n.id,
  m.user_id,
  TRUE,
  COALESCE(n.player_editable, FALSE)
FROM notes n
JOIN campaign_members m
  ON m.campaign_id = n.campaign_id
  AND m.role = 'player'
WHERE n.visible_to_players = TRUE
  AND m.user_id <> COALESCE(n.owner_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
ON CONFLICT (note_id, user_id) DO NOTHING;
