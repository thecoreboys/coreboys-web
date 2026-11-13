import { tiktokAppCredentials, type OauthProvider } from "@/lib/oauth/providers";

const TIKTOK_REVOKE_URL = "https://open.tiktokapis.com/v2/oauth/revoke/";
const TIKTOK_REVOKE_TIMEOUT_MS = 10_000;

/** Revoke a TikTok user grant using the OAuth v2 form-encoded contract. */
export async function revokeTikTokAccess(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  // Same trimmed credentials as connect/refresh, so a trailing newline in an
  // env value cannot make every disconnect report a failed revoke.
  const credentials = tiktokAppCredentials();
  if (!credentials) {
    throw new Error("tiktok revoke is not configured");
  }
  const { clientKey, clientSecret } = credentials;

  const response = await fetchImpl(TIKTOK_REVOKE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cache-Control": "no-cache",
    },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      token: accessToken,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(TIKTOK_REVOKE_TIMEOUT_MS),
  });

  // TikTok documents an empty successful response. Avoid parsing or logging
  // an error body so no provider-supplied request context reaches our logs.
  if (!response.ok) throw new Error(`tiktok revoke ${response.status}`);
}

const PROVIDER_REVOKE_TIMEOUT_MS = 8_000;

export type RevocableToken = {
  token: string;
  kind: "access_token" | "refresh_token";
};

/**
 * Providers with a documented token revocation endpoint. Instagram Login has
 * none: its grant is removed by the user in Instagram's own settings.
 */
export function providerSupportsRevocation(provider: OauthProvider): boolean {
  return provider !== "instagram";
}

/**
 * Which stored credential to revoke. Revoking a Google or X refresh token
 * ends the whole grant, so prefer it. Twitch and TikTok revoke by access
 * token, which therefore must be live (refreshed if needed).
 */
export function revocationTokenKind(provider: OauthProvider): "refresh-first" | "live-access" | null {
  if (!providerSupportsRevocation(provider)) return null;
  return provider === "youtube" || provider === "x" ? "refresh-first" : "live-access";
}

/**
 * Revoke a Twitch, Google or X grant. A 400 means the provider already
 * considers the token invalid (expired or revoked), which is the outcome a
 * disconnect wants, so it is not reported as a failure.
 */
export async function revokeProviderToken(
  provider: Exclude<OauthProvider, "instagram" | "tiktok">,
  credential: RevocableToken,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  let url: string;
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  const body = new URLSearchParams({ token: credential.token });
  if (provider === "twitch") {
    url = "https://id.twitch.tv/oauth2/revoke";
    body.set("client_id", process.env.TWITCH_CLIENT_ID ?? "");
  } else if (provider === "youtube") {
    url = "https://oauth2.googleapis.com/revoke";
  } else {
    url = "https://api.twitter.com/2/oauth2/revoke";
    const id = process.env.X_CLIENT_ID ?? "";
    const secret = process.env.X_CLIENT_SECRET ?? "";
    headers.Authorization = `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
    body.set("client_id", id);
    body.set("token_type_hint", credential.kind);
  }
  const response = await fetchImpl(url, {
    method: "POST",
    headers,
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(PROVIDER_REVOKE_TIMEOUT_MS),
  });
  if (response.ok || response.status === 400) return;
  throw new Error(`${provider} revoke ${response.status}`);
}

export type DisconnectActions = {
  /** The credential to revoke at the provider, or null when none is usable. */
  loadRevocableToken: () => Promise<RevocableToken | null>;
  revoke: (credential: RevocableToken) => Promise<void>;
  deleteLocalConnection: () => Promise<void>;
};

/**
 * Revoke the grant at the provider where supported, then always run local
 * cleanup (tokens + inferred loyalty). Local deletion must still run if the
 * provider is unavailable or a stored credential cannot be read/refreshed;
 * the provider error is rethrown afterwards so the caller can report it.
 */
export async function disconnectOauthProvider(
  provider: OauthProvider,
  actions: DisconnectActions,
): Promise<void> {
  if (!providerSupportsRevocation(provider)) {
    await actions.deleteLocalConnection();
    return;
  }

  try {
    const credential = await actions.loadRevocableToken();
    if (credential) await actions.revoke(credential);
  } finally {
    await actions.deleteLocalConnection();
  }
}
