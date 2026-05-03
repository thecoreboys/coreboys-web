-- Extend editable_member_overrides with the marketing fields the
-- web admin tool edits. Owned by the web admin; the api repo can read
-- them but doesn't need to know they exist.

ALTER TABLE editable_member_overrides
  ADD COLUMN IF NOT EXISTS alias TEXT,
  ADD COLUMN IF NOT EXISTS height TEXT,
  ADD COLUMN IF NOT EXISTS weight TEXT,
  ADD COLUMN IF NOT EXISTS nickname TEXT,
  ADD COLUMN IF NOT EXISTS favorite_game TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS roles TEXT[] NOT NULL DEFAULT '{}';
