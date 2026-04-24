-- v1.0.1: Add separate icon_color column to notes
-- This allows the icon type and its color to be set independently.
-- The app falls back to localStorage until this migration is applied.

ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS icon_color TEXT;
