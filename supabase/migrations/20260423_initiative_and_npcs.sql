-- Initiative entries (replaces local-only storage)
CREATE TABLE IF NOT EXISTS initiative_entries (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   UUID        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL DEFAULT '',
  initiative    INTEGER     NOT NULL DEFAULT 0,
  hp            INTEGER     NOT NULL DEFAULT 0,
  max_hp        INTEGER     NOT NULL DEFAULT 0,
  ac            INTEGER     NOT NULL DEFAULT 10,
  is_pc         BOOLEAN     NOT NULL DEFAULT FALSE,
  conditions    JSONB       NOT NULL DEFAULT '[]',
  turn_order    INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE initiative_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view initiative"
  ON initiative_entries FOR SELECT
  USING (is_member(campaign_id));

CREATE POLICY "GMs can insert initiative entries"
  ON initiative_entries FOR INSERT
  WITH CHECK (is_gm(campaign_id));

CREATE POLICY "GMs can update initiative entries"
  ON initiative_entries FOR UPDATE
  USING (is_gm(campaign_id))
  WITH CHECK (is_gm(campaign_id));

CREATE POLICY "GMs can delete initiative entries"
  ON initiative_entries FOR DELETE
  USING (is_gm(campaign_id));

ALTER PUBLICATION supabase_realtime ADD TABLE initiative_entries;

-- NPC tracker
CREATE TABLE IF NOT EXISTS npcs (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id        UUID        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name               TEXT        NOT NULL DEFAULT 'New NPC',
  faction            TEXT        NOT NULL DEFAULT '',
  faction_color      TEXT        NOT NULL DEFAULT '#475569',
  location           TEXT        NOT NULL DEFAULT '',
  status             TEXT        NOT NULL DEFAULT 'unknown',
  notes              TEXT        NOT NULL DEFAULT '',
  visible_to_players BOOLEAN     NOT NULL DEFAULT FALSE,
  icon               TEXT        NOT NULL DEFAULT 'user',
  linked_note_id     UUID        REFERENCES notes(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE npcs ENABLE ROW LEVEL SECURITY;

-- Players only see NPCs the GM has explicitly revealed
CREATE POLICY "Members can view visible NPCs"
  ON npcs FOR SELECT
  USING (
    is_gm(campaign_id) OR
    (is_member(campaign_id) AND visible_to_players = TRUE)
  );

CREATE POLICY "GMs can insert NPCs"
  ON npcs FOR INSERT
  WITH CHECK (is_gm(campaign_id));

CREATE POLICY "GMs can update NPCs"
  ON npcs FOR UPDATE
  USING (is_gm(campaign_id))
  WITH CHECK (is_gm(campaign_id));

CREATE POLICY "GMs can delete NPCs"
  ON npcs FOR DELETE
  USING (is_gm(campaign_id));

ALTER PUBLICATION supabase_realtime ADD TABLE npcs;
