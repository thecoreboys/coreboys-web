import {
  getConnection,
  markExpired,
  markSyncError,
  readAccessToken,
  readRefreshToken,
  type ConnectionRow,
  updateTokens,
} from "@/lib/oauth/connections";
import type { OauthProvider } from "@/lib/oauth/providers";

const refreshes = new Map<string, Promise<boolean>>();

class RefreshRequestError extends Error {
  constructor(message: string, readonly permanent: boolean) {
    super(message);
    this.name = "RefreshRequestError";
  }
}

async function requireRefreshResponse(response: Response, label: string): Promise<void> {
  if (response.ok) return;
  // invalid_grant / rejected credentials require a reconnect. Rate limits and
  // provider outages do not: marking those as expired would unnecessarily
  // strand a still-valid token during the early-refresh window.
  const permanent = response.status === 400 || response.status === 401;
  throw new RefreshRequestError(`${label} ${response.status}`, permanent);
}

function soon(expires: Date | null, provider: OauthProvider): boolean {
  if (!expires) return false;
  // Instagram's long-lived token is also its refresh credential and must be
  // refreshed before it expires. Give normal page traffic a seven-day window.
  const windowMs = provider === "instagram" ? 7 * 86_400_000 : 60_000;
  return expires.getTime() - Date.now() < windowMs;
}

export async function accessTokenFor(
  userId: string,
  provider: OauthProvider,
): Promise<{ token: string; row: ConnectionRow } | null> {
  const row = await getConnection(userId, provider);
  if (!row || !row.access_token_enc) return null;
  if (row.status === "revoked") return null;

  if (row.status !== "expired" && !soon(row.token_expires_at, provider)) {
    return { token: readAccessToken(row), row };
  }

  const refreshed = await refreshConnectionOnce(row);
  if (!refreshed) {
    const expiresAt = row.token_expires_at?.getTime() ?? 0;
    // A transient refresh failure must not interrupt playback while the old
    // token is still valid. We will retry on the next server request.
    if (expiresAt > Date.now()) return { token: readAccessToken(row), row };
    return null;
  }
  const next = await getConnection(userId, provider);
  if (!next) return null;
  return { token: readAccessToken(next), row: next };
}

async function refreshConnectionOnce(row: ConnectionRow): Promise<boolean> {
  const key = `${row.user_id}:${row.provider}`;
  const active = refreshes.get(key);
  if (active) return active;
  const task = refreshConnection(row).finally(() => {
    if (refreshes.get(key) === task) refreshes.delete(key);
  });
  refreshes.set(key, task);
  return task;
}

async function refreshConnection(row: ConnectionRow): Promise<boolean> {
  const refresh = readRefreshToken(row);
  if (!refresh) {
    await markExpired(row.user_id, row.provider, "token expired — reconnect");
    return false;
  }
  try {
    if (row.provider === "twitch") return await refreshTwitch(row, refresh);
    if (row.provider === "youtube") return await refreshGoogle(row, refresh);
    if (row.provider === "x") return await refreshX(row, refresh);
    if (row.provider === "tiktok") return await refreshTikTok(row, refresh);
    if (row.provider === "instagram") return await refreshInstagram(row, refresh);
    await markExpired(row.user_id, row.provider, "reconnect — no refresh for this provider");
    return false;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "refresh failed";
    if (err instanceof RefreshRequestError && err.permanent) {
      await markExpired(row.user_id, row.provider, msg);
    } else {
      await markSyncError(row.user_id, row.provider, msg);
    }
    return false;
  }
}

async function refreshTwitch(row: ConnectionRow, refresh: string): Promise<boolean> {
  const body = new URLSearchParams({
    client_id: process.env.TWITCH_CLIENT_ID ?? "",
    client_secret: process.env.TWITCH_CLIENT_SECRET ?? "",
    grant_type: "refresh_token",
    refresh_token: refresh,
  });
  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  await requireRefreshResponse(res, "twitch refresh");
  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!json.access_token) throw new RefreshRequestError("twitch refresh missing token", true);
  await updateTokens(row.user_id, "twitch", json.access_token, json.refresh_token ?? null, json.expires_in ?? 3600);
  return true;
}

async function refreshGoogle(row: ConnectionRow, refresh: string): Promise<boolean> {
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    grant_type: "refresh_token",
    refresh_token: refresh,
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  await requireRefreshResponse(res, "google refresh");
  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!json.access_token) throw new RefreshRequestError("google refresh missing token", true);
  await updateTokens(row.user_id, "youtube", json.access_token, json.refresh_token ?? null, json.expires_in ?? 3600);
  return true;
}

async function refreshX(row: ConnectionRow, refresh: string): Promise<boolean> {
  const id = process.env.X_CLIENT_ID ?? "";
  const secret = process.env.X_CLIENT_SECRET ?? "";
  const basic = Buffer.from(`${id}:${secret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refresh,
  });
  const res = await fetch("https://api.twitter.com/2/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body,
    cache: "no-store",
  });
  await requireRefreshResponse(res, "x refresh");
  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!json.access_token) throw new RefreshRequestError("x refresh missing token", true);
  await updateTokens(row.user_id, "x", json.access_token, json.refresh_token ?? null, json.expires_in ?? 7200);
  return true;
}

async function refreshTikTok(row: ConnectionRow, refresh: string): Promise<boolean> {
  const body = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY ?? "",
    client_secret: process.env.TIKTOK_CLIENT_SECRET ?? "",
    grant_type: "refresh_token",
    refresh_token: refresh,
  });
  const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  await requireRefreshResponse(res, "tiktok refresh");
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!json.access_token) throw new RefreshRequestError("tiktok refresh missing token", true);
  await updateTokens(row.user_id, "tiktok", json.access_token, json.refresh_token ?? null, json.expires_in ?? 86400);
  return true;
}

async function refreshInstagram(row: ConnectionRow, refresh: string): Promise<boolean> {
  const url = new URL("https://graph.instagram.com/refresh_access_token");
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", refresh);
  const res = await fetch(url, { cache: "no-store" });
  await requireRefreshResponse(res, "instagram refresh");
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new RefreshRequestError("instagram refresh missing token", true);
  // The refreshed access token becomes the token used for the next refresh.
  await updateTokens(
    row.user_id,
    "instagram",
    json.access_token,
    json.access_token,
    json.expires_in ?? 5_184_000,
  );
  return true;
}
