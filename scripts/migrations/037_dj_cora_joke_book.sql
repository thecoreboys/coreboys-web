-- Admin-only comedy context and reviewable DJ Cora script drafts. These rows
-- never reach a listener directly; the radio catalog still serves only saved,
-- approved audio recordings.
CREATE TABLE IF NOT EXISTS radio_joke_contexts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network_slug text NOT NULL CHECK (network_slug IN ('core','adapt','ron','lacy','marlon','jason','silky')),
  subject_label text NOT NULL CHECK (char_length(subject_label) BETWEEN 1 AND 80),
  premise text NOT NULL CHECK (char_length(premise) BETWEEN 1 AND 900),
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS radio_joke_contexts_network_enabled_idx
  ON radio_joke_contexts (network_slug, enabled, updated_at DESC);

CREATE TABLE IF NOT EXISTS radio_joke_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network_slug text NOT NULL CHECK (network_slug IN ('core','adapt','ron','lacy','marlon','jason','silky')),
  context_ids uuid[] NOT NULL DEFAULT '{}',
  script text NOT NULL CHECK (char_length(script) BETWEEN 1 AND 360),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','archived')),
  model text NOT NULL,
  generated_by uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS radio_joke_drafts_network_status_idx
  ON radio_joke_drafts (network_slug, status, created_at DESC);
