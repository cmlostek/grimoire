-- =============================================
-- Hotfix: break RLS recursion between notes and note_permissions
-- =============================================
-- The original 20260521_note_permissions migration created policies where
-- notes_select had an EXISTS subquery on note_permissions, and
-- note_permissions_select had an EXISTS subquery back on notes. Postgres
-- detects the loop and returns 500 to PostgREST on every SELECT.
--
-- Fix: add a SECURITY DEFINER helper `note_author(uuid)` (matching the
-- existing `note_campaign(uuid)` pattern) and rewrite the note_permissions
-- policies to use it, so they never read from `notes` directly.

CREATE OR REPLACE FUNCTION public.note_author(p_note UUID)
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
  SELECT owner_user_id FROM notes WHERE id = p_note;
$func$;

DROP POLICY IF EXISTS note_permissions_select ON note_permissions;
CREATE POLICY note_permissions_select ON note_permissions
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR is_gm(note_campaign(note_id))
    OR note_author(note_id) = auth.uid()
  );

DROP POLICY IF EXISTS note_permissions_write ON note_permissions;
CREATE POLICY note_permissions_write ON note_permissions
  FOR ALL TO authenticated
  USING (
    is_gm(note_campaign(note_id))
    OR note_author(note_id) = auth.uid()
  )
  WITH CHECK (
    is_gm(note_campaign(note_id))
    OR note_author(note_id) = auth.uid()
  );
