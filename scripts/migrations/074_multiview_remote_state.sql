-- Hosts report what the phone remote should mirror: which views have sound,
-- whether the main view is maximized and the active layout preset. Nullable so
-- older host tabs (which do not report state) keep working.
ALTER TABLE fan_multiview_sessions ADD COLUMN IF NOT EXISTS state jsonb;
