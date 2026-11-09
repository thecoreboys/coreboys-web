ALTER TABLE ai_provider_controls DROP CONSTRAINT IF EXISTS ai_provider_controls_provider_check;
ALTER TABLE ai_provider_controls ADD CONSTRAINT ai_provider_controls_provider_check
  CHECK (provider IN ('anthropic','elevenlabs','azure'));
INSERT INTO ai_provider_controls(provider,enabled,daily_request_limit,per_subject_hour_limit,monthly_budget_cents)
VALUES ('azure',true,100,10,1000) ON CONFLICT (provider) DO NOTHING;
