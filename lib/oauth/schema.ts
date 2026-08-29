/**
 * Idempotent fan-OAuth / loyalty schema. Mirrors the Instagram
 * `ensureInstagramSchema` pattern so connect-account works even when
 * drizzle migrations have not been applied to this cluster yet.
 */
import { query } from "@/lib/db";

let ready: Promise<void> | null = null;

export async function ensureFanOauthSchema(): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    await query(`
      ALTER TABLE fan_oauth_connections
        ADD COLUMN IF NOT EXISTS access_token_enc  text,
        ADD COLUMN IF NOT EXISTS refresh_token_enc text,
        ADD COLUMN IF NOT EXISTS token_expires_at  timestamptz,
        ADD COLUMN IF NOT EXISTS scopes            text,
        ADD COLUMN IF NOT EXISTS avatar_url        text,
        ADD COLUMN IF NOT EXISTS last_sync_at      timestamptz,
        ADD COLUMN IF NOT EXISTS last_sync_error   text,
        ADD COLUMN IF NOT EXISTS status            text NOT NULL DEFAULT 'active'
    `);
    await query(`
      CREATE UNIQUE INDEX IF NOT EXISTS fan_oauth_provider_uid
        ON fan_oauth_connections (provider, provider_user_id)
        WHERE provider_user_id IS NOT NULL
    `);
    await query(`
      ALTER TABLE fan_users
        ADD COLUMN IF NOT EXISTS public_slug     text UNIQUE,
        ADD COLUMN IF NOT EXISTS public_card     boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS favorite_member text
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS fan_loyalty (
        user_id    text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
        platform   text NOT NULL,
        subject    text NOT NULL,
        kind       text NOT NULL,
        value      boolean NOT NULL DEFAULT true,
        meta       jsonb,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, platform, subject, kind)
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS fan_loyalty_user_idx ON fan_loyalty (user_id)`);
    await query(`
      CREATE TABLE IF NOT EXISTS fan_site_events (
        id         bigserial PRIMARY KEY,
        user_id    text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
        kind       text NOT NULL,
        subject    text,
        ref        text,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS fan_site_events_user_idx
        ON fan_site_events (user_id, created_at DESC)
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS fan_chat_sends (
        id            bigserial PRIMARY KEY,
        user_id       text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
        channel_login text NOT NULL,
        created_at    timestamptz NOT NULL DEFAULT now()
      )
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS fan_chat_sends_user_idx
        ON fan_chat_sends (user_id, created_at DESC)
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS fan_social_actions (
        id         bigserial PRIMARY KEY,
        user_id    text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
        provider   text NOT NULL,
        action     text NOT NULL,
        target_ref text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS fan_social_actions_user_idx
        ON fan_social_actions (user_id, provider, created_at DESC)
    `);
    await query(`
      ALTER TABLE fan_site_events
        ADD COLUMN IF NOT EXISTS seconds integer NOT NULL DEFAULT 0
    `);
    await query(`
      ALTER TABLE poll_votes
        ADD COLUMN IF NOT EXISTS weight integer NOT NULL DEFAULT 1
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS fan_watch_progress (
        user_id      text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
        item_ref     text NOT NULL,
        kind         text NOT NULL DEFAULT 'youtube',
        subject      text,
        hover_count  integer NOT NULL DEFAULT 0,
        seconds      integer NOT NULL DEFAULT 0,
        progress     real NOT NULL DEFAULT 0,
        position_seconds real NOT NULL DEFAULT 0,
        duration_seconds real NOT NULL DEFAULT 0,
        position_updated_at timestamptz,
        completed    boolean NOT NULL DEFAULT false,
        last_hover_at timestamptz,
        updated_at   timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, item_ref)
      )
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS fan_watch_progress_user_idx
        ON fan_watch_progress (user_id, updated_at DESC)
    `);
    await query(`
      ALTER TABLE fan_watch_progress
        ADD COLUMN IF NOT EXISTS position_seconds real NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS duration_seconds real NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS position_updated_at timestamptz,
        ADD COLUMN IF NOT EXISTS completion_source text
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS fan_watch_time_events (
        id           bigserial PRIMARY KEY,
        user_id      text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
        item_ref     text NOT NULL,
        kind         text NOT NULL,
        source       text NOT NULL CHECK (source IN ('site','provider')),
        provider     text,
        seconds      integer NOT NULL CHECK (seconds BETWEEN 1 AND 180),
        observed_at  timestamptz NOT NULL DEFAULT now(),
        created_at   timestamptz NOT NULL DEFAULT now(),
        CHECK ((source='site' AND provider IS NULL) OR (source='provider' AND provider IS NOT NULL))
      )
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS fan_watch_time_events_user_time_idx
        ON fan_watch_time_events (user_id, observed_at DESC)
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS fan_watch_progress_sources (
        user_id       text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
        source_id     text NOT NULL,
        item_ref      text NOT NULL,
        hover_count   integer NOT NULL DEFAULT 0,
        seconds       integer NOT NULL DEFAULT 0,
        hover_delta   integer NOT NULL DEFAULT 0,
        seconds_delta integer NOT NULL DEFAULT 0,
        updated_at    timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, source_id, item_ref)
      )
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS fan_watch_progress_sources_user_idx
        ON fan_watch_progress_sources (user_id, updated_at DESC)
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS fan_watch_list (
        user_id    text NOT NULL REFERENCES fan_users(id) ON DELETE CASCADE,
        item_ref   text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, item_ref)
      )
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS fan_watch_list_user_idx
        ON fan_watch_list (user_id, created_at DESC)
    `);
  })().catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}
