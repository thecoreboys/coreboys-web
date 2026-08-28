/**
 * Authorization-code exchange + identity lookup per provider.
 */
import type { OauthProvider } from "@/lib/oauth/providers";
import {
  PROVIDER_CATALOG,
  TIKTOK_CREATOR_FEED_SCOPES,
  X_INTERACTION_SCOPES,
  callbackPath,
  grantedScopeSet,
  instagramLoginCredentials,
  tiktokAppCredentials,
} from "@/lib/oauth/providers";

export type ExchangedIdentity = {
  provider: OauthProvider;
  providerUserId: string;
  username: string;
  avatarUrl: string | null;
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number | null;
  scopes: string[];
};

export function authorizeUrl(
  provider: OauthProvider,
  origin: string,
  state: string,
  challenge: string,
  scopeProfile: "default" | "x-interact" = "default",
): string {
  const redirect = `${origin}${callbackPath(provider)}`;
  if (provider === "twitch") {
    const scopes = PROVIDER_CATALOG.find((p) => p.key === "twitch")!.scopes.join(" ");
    const url = new URL("https://id.twitch.tv/oauth2/authorize");
    url.searchParams.set("client_id", process.env.TWITCH_CLIENT_ID ?? "");
    url.searchParams.set("redirect_uri", redirect);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", scopes);
    url.searchParams.set("state", state);
    url.searchParams.set("force_verify", "true");
    return url.toString();
  }
  if (provider === "youtube") {
    const scopes = PROVIDER_CATALOG.find((p) => p.key === "youtube")!.scopes.join(" ");
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID ?? "");
    url.searchParams.set("redirect_uri", redirect);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", scopes);
    url.searchParams.set("state", state);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("include_granted_scopes", "false");
    return url.toString();
  }
  if (provider === "tiktok") {
    const scopes = PROVIDER_CATALOG.find((p) => p.key === "tiktok")!.scopes.join(",");
    const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
    url.searchParams.set("client_key", process.env.TIKTOK_CLIENT_KEY?.trim() ?? "");
    url.searchParams.set("redirect_uri", redirect);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", scopes);
    url.searchParams.set("state", state);
    // TikTok's Web Login Kit flow documents state/HTTPS redirect protection,
    // but PKCE only for mobile and desktop token exchanges. Do not send the
    // undocumented PKCE parameters from this server-side web flow.
    return url.toString();
  }
  if (provider === "instagram") {
    const id = instagramLoginCredentials()?.clientId ?? "";
    const url = new URL("https://www.instagram.com/oauth/authorize");
    url.searchParams.set("client_id", id);
    url.searchParams.set("redirect_uri", redirect);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "instagram_business_basic");
    url.searchParams.set("state", state);
    return url.toString();
  }
  const scopes = (scopeProfile === "x-interact"
    ? X_INTERACTION_SCOPES
    : PROVIDER_CATALOG.find((p) => p.key === "x")!.scopes).join(" ");
  const url = new URL("https://twitter.com/i/oauth2/authorize");
  url.searchParams.set("client_id", process.env.X_CLIENT_ID ?? "");
  url.searchParams.set("redirect_uri", redirect);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scopes);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (scopeProfile === "x-interact") url.searchParams.set("prompt", "consent");
  return url.toString();
}

export async function exchangeCode(
  provider: OauthProvider,
  origin: string,
  code: string,
  verifier: string,
): Promise<ExchangedIdentity> {
  if (provider === "twitch") return exchangeTwitch(origin, code);
  if (provider === "youtube") return exchangeGoogle(origin, code, verifier);
  if (provider === "tiktok") return exchangeTikTok(origin, code);
  if (provider === "instagram") return exchangeInstagram(origin, code);
  return exchangeX(origin, code, verifier);
}

async function exchangeTwitch(origin: string, code: string): Promise<ExchangedIdentity> {
  const body = new URLSearchParams({
    client_id: process.env.TWITCH_CLIENT_ID ?? "",
    client_secret: process.env.TWITCH_CLIENT_SECRET ?? "",
    grant_type: "authorization_code",
    code,
    redirect_uri: `${origin}${callbackPath("twitch")}`,
  });
  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`twitch token ${res.status}`);
  const tok = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string[];
  };
  const me = await fetch("https://api.twitch.tv/helix/users", {
    headers: {
      Authorization: `Bearer ${tok.access_token}`,
      "Client-Id": process.env.TWITCH_CLIENT_ID ?? "",
    },
    cache: "no-store",
  });
  if (!me.ok) throw new Error(`twitch users ${me.status}`);
  const json = (await me.json()) as {
    data: Array<{ id: string; login: string; display_name: string; profile_image_url?: string }>;
  };
  const u = json.data[0];
  if (!u) throw new Error("twitch user missing");
  return {
    provider: "twitch",
    providerUserId: u.id,
    username: u.login,
    avatarUrl: u.profile_image_url ?? null,
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token ?? null,
    expiresIn: tok.expires_in ?? 14400,
    scopes: tok.scope ?? [],
  };
}

async function exchangeGoogle(origin: string, code: string, verifier: string): Promise<ExchangedIdentity> {
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    grant_type: "authorization_code",
    code,
    redirect_uri: `${origin}${callbackPath("youtube")}`,
    code_verifier: verifier,
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`google token ${res.status}`);
  const tok = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  const ch = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
    { headers: { Authorization: `Bearer ${tok.access_token}` }, cache: "no-store" },
  );
  if (!ch.ok) throw new Error(`youtube channels ${ch.status}`);
  const json = (await ch.json()) as {
    items?: Array<{ id: string; snippet?: { title?: string; thumbnails?: { default?: { url?: string } } } }>;
  };
  const item = json.items?.[0];
  return {
    provider: "youtube",
    providerUserId: item?.id ?? "unknown",
    username: item?.snippet?.title ?? "YouTube",
    avatarUrl: item?.snippet?.thumbnails?.default?.url ?? null,
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token ?? null,
    expiresIn: tok.expires_in ?? 3600,
    scopes: (tok.scope ?? "").split(" ").filter(Boolean),
  };
}

async function exchangeX(origin: string, code: string, verifier: string): Promise<ExchangedIdentity> {
  const id = process.env.X_CLIENT_ID ?? "";
  const secret = process.env.X_CLIENT_SECRET ?? "";
  const basic = Buffer.from(`${id}:${secret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: `${origin}${callbackPath("x")}`,
    code_verifier: verifier,
    client_id: id,
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
  if (!res.ok) throw new Error(`x token ${res.status}`);
  const tok = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  const me = await fetch("https://api.twitter.com/2/users/me?user.fields=profile_image_url,username", {
    headers: { Authorization: `Bearer ${tok.access_token}` },
    cache: "no-store",
  });
  if (!me.ok) throw new Error(`x me ${me.status}`);
  const json = (await me.json()) as {
    data?: { id: string; username: string; profile_image_url?: string };
  };
  const u = json.data;
  if (!u) throw new Error("x user missing");
  return {
    provider: "x",
    providerUserId: u.id,
    username: u.username,
    avatarUrl: u.profile_image_url ?? null,
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token ?? null,
    expiresIn: tok.expires_in ?? 7200,
    scopes: (tok.scope ?? "").split(" ").filter(Boolean),
  };
}

async function exchangeTikTok(origin: string, code: string): Promise<ExchangedIdentity> {
  const credentials = tiktokAppCredentials();
  if (!credentials) throw new Error("tiktok oauth not configured");
  const body = new URLSearchParams({
    client_key: credentials.clientKey,
    client_secret: credentials.clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: `${origin}${callbackPath("tiktok")}`,
  });
  const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`tiktok token ${res.status}`);
  const tok = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    open_id?: string;
    scope?: string;
  };
  if (!tok.access_token) throw new Error("tiktok token missing");
  const scopes = grantedScopeSet(tok.scope);
  const missingScopes = TIKTOK_CREATOR_FEED_SCOPES.filter((scope) => !scopes.has(scope));
  if (missingScopes.length) {
    throw new Error(`tiktok scopes missing: ${missingScopes.join(",")}`);
  }
  const me = await fetch(
    "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url,username",
    { headers: { Authorization: `Bearer ${tok.access_token}` }, cache: "no-store" },
  );
  if (!me.ok) throw new Error(`tiktok user info ${me.status}`);
  const json = (await me.json()) as {
    data?: { user?: { open_id?: string; display_name?: string; avatar_url?: string; username?: string } };
    error?: { code?: string; message?: string };
  };
  if (json.error?.code && json.error.code !== "ok") {
    throw new Error(`tiktok user info ${json.error.code}`);
  }
  const user = json.data?.user;
  if (!user?.open_id && !tok.open_id) throw new Error("tiktok user id missing");
  if (!user?.username?.trim()) {
    throw new Error("tiktok username missing — approve user.info.profile");
  }
  return {
    provider: "tiktok",
    providerUserId: user.open_id || tok.open_id!,
    username: user.username.trim().replace(/^@/, ""),
    avatarUrl: user?.avatar_url ?? null,
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token ?? null,
    expiresIn: tok.expires_in ?? 86400,
    scopes: [...scopes],
  };
}

async function exchangeInstagram(origin: string, code: string): Promise<ExchangedIdentity> {
  const credentials = instagramLoginCredentials();
  if (!credentials) throw new Error("instagram oauth not configured");
  const { clientId: id, clientSecret: secret } = credentials;
  const body = new URLSearchParams({
    client_id: id,
    client_secret: secret,
    grant_type: "authorization_code",
    redirect_uri: `${origin}${callbackPath("instagram")}`,
    code,
  });
  const res = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`instagram token ${res.status}`);
  const short = (await res.json()) as { access_token?: string; user_id?: number | string };
  if (!short.access_token) throw new Error("instagram token missing");

  // Instagram Login first issues a ~1 hour token. Exchange it server-side
  // for a refreshable long-lived token before anything is persisted.
  const longUrl = new URL("https://graph.instagram.com/access_token");
  longUrl.searchParams.set("grant_type", "ig_exchange_token");
  longUrl.searchParams.set("client_secret", secret);
  longUrl.searchParams.set("access_token", short.access_token);
  const longRes = await fetch(longUrl, { cache: "no-store" });
  if (!longRes.ok) throw new Error(`instagram long-lived token ${longRes.status}`);
  const long = (await longRes.json()) as { access_token?: string; expires_in?: number };
  if (!long.access_token) throw new Error("instagram long-lived token missing");

  const me = await fetch(
    `https://graph.instagram.com/me?fields=id,username,account_type,profile_picture_url&access_token=${encodeURIComponent(long.access_token)}`,
    { cache: "no-store" },
  );
  const u = me.ok
    ? ((await me.json()) as { id?: string; username?: string; profile_picture_url?: string })
    : {};
  return {
    provider: "instagram",
    providerUserId: String(u.id ?? short.user_id ?? "unknown"),
    username: u.username ?? "instagram",
    avatarUrl: u.profile_picture_url ?? null,
    accessToken: long.access_token,
    // Instagram refreshes its long-lived access token with the token itself;
    // storing it in the encrypted refresh slot fits the provider-neutral vault.
    refreshToken: long.access_token,
    expiresIn: long.expires_in ?? 5_184_000,
    scopes: ["instagram_business_basic"],
  };
}
