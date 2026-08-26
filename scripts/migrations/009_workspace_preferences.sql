-- Named fan workspaces shared by Watch multiview and custom chat.
CREATE TABLE IF NOT EXISTS fan_workspace_preferences (
  user_id    text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  kind       text NOT NULL,
  name       text NOT NULL,
  payload    jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind, name)
);

CREATE INDEX IF NOT EXISTS fan_workspace_preferences_recent_idx
  ON fan_workspace_preferences (user_id, kind, updated_at DESC);

-- Explicit preference and exclusion signals used by Watch recommendations.
CREATE TABLE IF NOT EXISTS fan_watch_feedback (
  user_id    text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
  scope      text NOT NULL CHECK (scope IN ('item', 'creator', 'platform')),
  value      text NOT NULL,
  signal     smallint NOT NULL CHECK (signal BETWEEN -2 AND 1),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, scope, value)
);

CREATE INDEX IF NOT EXISTS fan_watch_feedback_recent_idx
  ON fan_watch_feedback (user_id, updated_at DESC);
