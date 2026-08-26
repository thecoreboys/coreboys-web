import "server-only";

import { query } from "@/lib/db";

let ready: Promise<void> | null = null;

/** Runtime repair guard for deployments where the checked-in migration lags. */
export function ensureXIntegrationSchema(): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS x_post_nominations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
        post_id text NOT NULL CHECK (post_id ~ '^\\d{5,25}$'), post_url text NOT NULL,
        community_key text NOT NULL CHECK (community_key IN ('core','flock','stable','thugs','m3','nms','slg')),
        member_slug text, note text, consent_version text NOT NULL,
        status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied')),
        featured boolean NOT NULL DEFAULT false, denial_reason text, reviewed_by text, reviewed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (user_id, post_id, community_key)
      );
      CREATE INDEX IF NOT EXISTS x_post_nominations_public_idx ON x_post_nominations (community_key, featured DESC, created_at DESC) WHERE status='approved';
      WITH ranked_featured AS (
        SELECT id,row_number() OVER (ORDER BY reviewed_at DESC NULLS LAST,created_at DESC,id) AS feature_rank
        FROM x_post_nominations WHERE status='approved' AND featured=true
      )
      UPDATE x_post_nominations SET featured=false,updated_at=now()
      WHERE id IN (SELECT id FROM ranked_featured WHERE feature_rank>1);
      CREATE UNIQUE INDEX IF NOT EXISTS x_post_nominations_single_featured_idx ON x_post_nominations((featured)) WHERE status='approved' AND featured=true;
      CREATE INDEX IF NOT EXISTS x_post_nominations_review_idx ON x_post_nominations (status, created_at ASC);
      CREATE TABLE IF NOT EXISTS x_nomination_audit (
        id bigserial PRIMARY KEY, nomination_id uuid NOT NULL REFERENCES x_post_nominations(id) ON DELETE CASCADE,
        actor_email text NOT NULL, action text NOT NULL, before_state jsonb, after_state jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS x_nomination_audit_nomination_idx ON x_nomination_audit (nomination_id,created_at DESC);
      CREATE TABLE IF NOT EXISTS x_action_audit (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
        action text NOT NULL CHECK (action IN ('like','unlike','repost','unrepost','reply','follow','unfollow')),
        target_ref text NOT NULL, idempotency_key text NOT NULL, request_hash text NOT NULL,
        status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','rejected','failed')),
        estimated_cost_microusd bigint NOT NULL DEFAULT 0 CHECK (estimated_cost_microusd >= 0),
        provider_status integer, provider_response_ref text, error_code text,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (user_id, idempotency_key)
      );
      CREATE INDEX IF NOT EXISTS x_action_audit_user_idx ON x_action_audit (user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS x_action_audit_pending_idx ON x_action_audit (created_at) WHERE status='pending';
      CREATE TABLE IF NOT EXISTS x_rate_limits (
        subject_key text NOT NULL, action text NOT NULL, bucket_started_at timestamptz NOT NULL,
        hits integer NOT NULL DEFAULT 0 CHECK (hits >= 0), PRIMARY KEY (subject_key,action,bucket_started_at)
      );
      CREATE TABLE IF NOT EXISTS x_api_usage (
        id bigserial PRIMARY KEY, category text NOT NULL CHECK (category IN ('read','write')),
        endpoint text NOT NULL, operation text NOT NULL, resource_count integer NOT NULL DEFAULT 1 CHECK(resource_count>=0),
        estimated_cost_microusd bigint NOT NULL DEFAULT 0 CHECK(estimated_cost_microusd>=0), cache_hit boolean NOT NULL DEFAULT false,
        success boolean NOT NULL DEFAULT true, user_id text REFERENCES fan_users(id) ON DELETE SET NULL,
        idempotency_key text, created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS x_api_usage_month_idx ON x_api_usage (created_at DESC,category);
      CREATE INDEX IF NOT EXISTS x_api_usage_operation_idx ON x_api_usage (operation,created_at DESC);
      CREATE TABLE IF NOT EXISTS x_api_reservations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), category text NOT NULL CHECK(category IN('read','write')),
        operation text NOT NULL, reserved_microusd bigint NOT NULL CHECK(reserved_microusd>0),
        actual_microusd bigint CHECK(actual_microusd IS NULL OR actual_microusd>=0),
        status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','reconciled','released','expired')),
        expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), reconciled_at timestamptz
      );
      CREATE INDEX IF NOT EXISTS x_api_reservations_pending_idx ON x_api_reservations(expires_at) WHERE status='pending';
      CREATE TABLE IF NOT EXISTS x_api_cache (
        cache_key text PRIMARY KEY, payload jsonb NOT NULL, fetched_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL, last_accessed_at timestamptz NOT NULL DEFAULT now(),
        hit_count bigint NOT NULL DEFAULT 0 CHECK(hit_count>=0)
      );
      CREATE INDEX IF NOT EXISTS x_api_cache_expiry_idx ON x_api_cache (expires_at);
    `);
  })().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}
