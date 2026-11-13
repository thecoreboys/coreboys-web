import { randomUUID } from "node:crypto";
import { query, withTransaction } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/oauth/crypto";
import { ensureFanOauthSchema } from "@/lib/oauth/schema";
import { grantedScopeSet, type OauthProvider } from "@/lib/oauth/providers";

export type ConnectionRow = {
  id: string;
  user_id: string;
  provider: OauthProvider;
  provider_user_id: string | null;
  provider_username: string | null;
  avatar_url: string | null;
  scopes: string | null;
  token_expires_at: Date | null;
  last_sync_at: Date | null;
  last_sync_error: string | null;
  status: string;
  connected_at: Date;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
};

export type ConnectionPublic = {
  provider: OauthProvider;
  username: string | null;
  avatarUrl: string | null;
  connectedAt: string;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  status: "active" | "expired" | "revoked";
  scopes: string[];
};

/**
 * The status the account UI should show. A row can still say `active` while
 * its grant is unusable: no stored access token, or an access token past its
 * expiry with no refresh token to renew it. Those need a reconnect too.
 */
export function connectionPublicStatus(
  row: Pick<ConnectionRow, "status" | "access_token_enc" | "refresh_token_enc" | "token_expires_at">,
  now = Date.now(),
): ConnectionPublic["status"] {
  if (row.status === "expired" || row.status === "revoked") return row.status;
  if (!row.access_token_enc) return "expired";
  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).getTime() : null;
  if (expiresAt !== null && expiresAt <= now && !row.refresh_token_enc) return "expired";
  return "active";
}

function toPublic(row: ConnectionRow): ConnectionPublic {
  const status = connectionPublicStatus(row);
  return {
    provider: row.provider,
    username: row.provider_username,
    avatarUrl: row.avatar_url,
    connectedAt: row.connected_at instanceof Date ? row.connected_at.toISOString() : String(row.connected_at),
    lastSyncAt: row.last_sync_at
      ? row.last_sync_at instanceof Date
        ? row.last_sync_at.toISOString()
        : String(row.last_sync_at)
      : null,
    lastSyncError: row.last_sync_error,
    status,
    scopes: [...grantedScopeSet(row.scopes)],
  };
}

export async function listConnections(userId: string): Promise<ConnectionPublic[]> {
  await ensureFanOauthSchema();
  const { rows } = await query<ConnectionRow>(
    `SELECT id, user_id, provider, provider_user_id, provider_username, avatar_url,
            scopes, token_expires_at, last_sync_at, last_sync_error, status, connected_at,
            access_token_enc, refresh_token_enc
       FROM fan_oauth_connections
      WHERE user_id = $1
      ORDER BY connected_at ASC`,
    [userId],
  );
  return rows.map(toPublic);
}

export async function getConnection(
  userId: string,
  provider: OauthProvider,
): Promise<ConnectionRow | null> {
  await ensureFanOauthSchema();
  const { rows } = await query<ConnectionRow>(
    `SELECT id, user_id, provider, provider_user_id, provider_username, avatar_url,
            scopes, token_expires_at, last_sync_at, last_sync_error, status, connected_at,
            access_token_enc, refresh_token_enc
       FROM fan_oauth_connections
      WHERE user_id = $1 AND provider = $2`,
    [userId, provider],
  );
  return rows[0] ?? null;
}

export async function findConnectionByProviderUser(
  provider: OauthProvider,
  providerUserId: string,
): Promise<ConnectionRow | null> {
  await ensureFanOauthSchema();
  const { rows } = await query<ConnectionRow>(
    `SELECT id, user_id, provider, provider_user_id, provider_username, avatar_url,
            scopes, token_expires_at, last_sync_at, last_sync_error, status, connected_at,
            access_token_enc, refresh_token_enc
       FROM fan_oauth_connections
      WHERE provider = $1 AND provider_user_id = $2`,
    [provider, providerUserId],
  );
  return rows[0] ?? null;
}

export class ProviderLinkedElsewhereError extends Error {
  constructor(public readonly existingUserId: string) {
    super("This account is already linked to another CORE profile.");
    this.name = "ProviderLinkedElsewhereError";
  }
}

export async function upsertConnection(input: {
  userId: string;
  provider: OauthProvider;
  providerUserId: string;
  providerUsername: string;
  avatarUrl?: string | null;
  scopes: string[];
  accessToken: string;
  refreshToken?: string | null;
  expiresIn?: number | null;
}): Promise<ConnectionPublic> {
  await ensureFanOauthSchema();
  const existing = await findConnectionByProviderUser(input.provider, input.providerUserId);
  if (existing && existing.user_id !== input.userId) {
    throw new ProviderLinkedElsewhereError(existing.user_id);
  }
  try {
    return await saveConnection(input);
  } catch (error) {
    // Two fans finishing a link for the same platform account at once: the
    // unique (provider, provider_user_id) index rejects the second insert.
    // Report it as the readable "linked elsewhere" outcome, not a crash.
    if ((error as { code?: unknown })?.code === "23505") {
      const winner = await findConnectionByProviderUser(input.provider, input.providerUserId);
      if (winner && winner.user_id !== input.userId) throw new ProviderLinkedElsewhereError(winner.user_id);
    }
    throw error;
  }
}

async function saveConnection(input: Parameters<typeof upsertConnection>[0]): Promise<ConnectionPublic> {

  const expiresAt = input.expiresIn
    ? new Date(Date.now() + input.expiresIn * 1000)
    : null;
  const accessEnc = encryptSecret(input.accessToken);
  const refreshEnc = input.refreshToken ? encryptSecret(input.refreshToken) : null;
  // Each authorization is a new grant: in-flight work for an older grant
  // must not overwrite this one after a reconnect or identity change.
  const id = randomUUID();

  const saved = await withTransaction(async (client) => {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`oauth:${input.userId}:${input.provider}`]);
  await client.query(`SELECT id FROM fan_oauth_connections WHERE user_id=$1 AND provider=$2 FOR UPDATE`, [input.userId,input.provider]);
  await client.query(`DELETE FROM fan_loyalty WHERE user_id=$1 AND platform=$2
    AND EXISTS (SELECT 1 FROM fan_oauth_connections WHERE user_id=$1 AND provider=$2 AND provider_user_id IS DISTINCT FROM $3)`,
  [input.userId,input.provider,input.providerUserId]);
  const { rows } = await client.query<ConnectionRow>(
    `INSERT INTO fan_oauth_connections (
        id, user_id, provider, provider_user_id, provider_username,
        avatar_url, scopes, access_token_enc, refresh_token_enc,
        token_expires_at, status, connected_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active', now())
      ON CONFLICT (user_id, provider) DO UPDATE SET
        id                 = EXCLUDED.id,
        provider_user_id   = EXCLUDED.provider_user_id,
        provider_username  = EXCLUDED.provider_username,
        avatar_url         = EXCLUDED.avatar_url,
        scopes             = EXCLUDED.scopes,
        access_token_enc   = EXCLUDED.access_token_enc,
        refresh_token_enc  = CASE WHEN fan_oauth_connections.provider_user_id = EXCLUDED.provider_user_id
          THEN COALESCE(EXCLUDED.refresh_token_enc, fan_oauth_connections.refresh_token_enc)
          ELSE EXCLUDED.refresh_token_enc END,
        token_expires_at   = EXCLUDED.token_expires_at,
        status             = 'active',
        last_sync_error    = NULL,
        last_sync_at       = NULL,
        connected_at       = now()
      RETURNING id, user_id, provider, provider_user_id, provider_username, avatar_url,
                scopes, token_expires_at, last_sync_at, last_sync_error, status, connected_at,
                access_token_enc, refresh_token_enc`,
    [
      id,
      input.userId,
      input.provider,
      input.providerUserId,
      input.providerUsername,
      input.avatarUrl ?? null,
      input.scopes.join(" "),
      accessEnc,
      refreshEnc,
      expiresAt,
    ],
  );
  return rows[0]!;
  });
  return toPublic(saved);
}

export function readAccessToken(row: ConnectionRow): string {
  if (!row.access_token_enc) throw new Error("missing access token");
  return decryptSecret(row.access_token_enc);
}

export function readRefreshToken(row: ConnectionRow): string | null {
  if (!row.refresh_token_enc) return null;
  return decryptSecret(row.refresh_token_enc);
}

export async function updateTokens(
  userId: string,
  provider: OauthProvider,
  accessToken: string,
  refreshToken: string | null,
  expiresIn: number | null,
  expectedConnectionId?: string,
): Promise<void> {
  const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;
  await query(
    `UPDATE fan_oauth_connections
        SET access_token_enc  = $3,
            refresh_token_enc = COALESCE($4, refresh_token_enc),
            token_expires_at  = $5,
            status            = 'active'
      WHERE user_id = $1 AND provider = $2 AND ($6::text IS NULL OR id::text=$6)`,
    [
      userId,
      provider,
      encryptSecret(accessToken),
      refreshToken ? encryptSecret(refreshToken) : null,
      expiresAt,
      expectedConnectionId ?? null,
    ],
  );
}

export async function markExpired(userId: string, provider: OauthProvider, err: string, expectedConnectionId?: string): Promise<void> {
  await query(
    `UPDATE fan_oauth_connections
        SET status = 'expired', last_sync_error = $3
      WHERE user_id = $1 AND provider = $2 AND ($4::text IS NULL OR id::text=$4)`,
    [userId, provider, err.slice(0, 400), expectedConnectionId ?? null],
  );
}

/**
 * Mark a grant as needing reconnect after the provider rejected its refresh
 * token, but only if the refresh token is still the one that was rejected.
 * Providers that rotate refresh tokens (X, TikTok, Twitch) reject the old one
 * once another request or replica has already rotated it; that concurrent
 * success must not be overwritten with a false "reconnect needed".
 * Returns false when the row changed underneath (rotated, replaced, removed).
 */
export async function markRefreshRejected(
  row: Pick<ConnectionRow, "id" | "user_id" | "provider" | "refresh_token_enc">,
  err: string,
): Promise<boolean> {
  const result = await query(
    `UPDATE fan_oauth_connections
        SET status = 'expired', last_sync_error = $4
      WHERE user_id = $1 AND provider = $2 AND id::text = $3
        AND refresh_token_enc IS NOT DISTINCT FROM $5`,
    [row.user_id, row.provider, row.id, err.slice(0, 400), row.refresh_token_enc],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * The provider rejected the stored access token (HTTP 401) before its
 * recorded expiry. Pull the expiry forward so the next use refreshes once;
 * a rejected refresh then marks the grant for reconnect.
 */
export async function markAccessTokenRejected(userId: string, provider: OauthProvider, expectedConnectionId: string): Promise<void> {
  await query(
    `UPDATE fan_oauth_connections
        SET token_expires_at = LEAST(COALESCE(token_expires_at, now()), now())
      WHERE user_id = $1 AND provider = $2 AND id::text = $3 AND status = 'active'`,
    [userId, provider, expectedConnectionId],
  );
}

export async function markSynced(userId: string, provider: OauthProvider, expectedConnectionId?: string): Promise<void> {
  await query(
    `UPDATE fan_oauth_connections
        SET last_sync_at = now(), last_sync_error = NULL, status = 'active'
      WHERE user_id = $1 AND provider = $2 AND ($3::text IS NULL OR id::text=$3)`,
    [userId, provider, expectedConnectionId ?? null],
  );
}

export async function markSyncError(userId: string, provider: OauthProvider, err: string, expectedConnectionId?: string): Promise<void> {
  await query(
    `UPDATE fan_oauth_connections
        SET last_sync_error = $3
      WHERE user_id = $1 AND provider = $2 AND ($4::text IS NULL OR id::text=$4)`,
    [userId, provider, err.slice(0, 400), expectedConnectionId ?? null],
  );
}

export async function deleteConnection(userId: string, provider: OauthProvider, expectedConnectionId?: string): Promise<void> {
  await ensureFanOauthSchema();
  await withTransaction(async (client) => {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`oauth:${userId}:${provider}`]);
  const removed = await client.query(
    `DELETE FROM fan_oauth_connections WHERE user_id = $1 AND provider = $2 AND ($3::text IS NULL OR id::text=$3)`,
    [userId, provider, expectedConnectionId ?? null],
  );
  if (expectedConnectionId && !removed.rowCount) return;
  await client.query(
    `DELETE FROM fan_loyalty WHERE user_id = $1 AND platform = $2`,
    [userId, provider],
  );
  });
}

/**
 * Provider-initiated disconnect/deletion, keyed by the provider's app-scoped
 * user id. Returns the same result for an already-deleted id without exposing
 * tokens or account details.
 */
export async function deleteConnectionByProviderUser(
  provider: OauthProvider,
  providerUserId: string,
): Promise<boolean> {
  const existing = await findConnectionByProviderUser(provider, providerUserId);
  if (!existing) return false;
  await deleteConnection(existing.user_id, provider, existing.id);
  return true;
}
