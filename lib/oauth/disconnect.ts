import type { OauthProvider } from "@/lib/oauth/providers";

const TIKTOK_REVOKE_URL = "https://open.tiktokapis.com/v2/oauth/revoke/";
const TIKTOK_REVOKE_TIMEOUT_MS = 10_000;

/** Revoke a TikTok user grant using the OAuth v2 form-encoded contract. */
export async function revokeTikTokAccess(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientKey || !clientSecret) {
    throw new Error("tiktok revoke is not configured");
  }

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

export type DisconnectActions = {
  loadTikTokAccessToken: () => Promise<string | null>;
  revokeTikTok: (accessToken: string) => Promise<void>;
  deleteLocalConnection: () => Promise<void>;
};

/**
 * Run provider-specific remote cleanup before the existing local cleanup.
 * Local token and loyalty deletion must still run if TikTok is unavailable or
 * a stored credential cannot be read/refreshed.
 */
export async function disconnectOauthProvider(
  provider: OauthProvider,
  actions: DisconnectActions,
): Promise<void> {
  if (provider !== "tiktok") {
    await actions.deleteLocalConnection();
    return;
  }

  try {
    const accessToken = await actions.loadTikTokAccessToken();
    if (accessToken) await actions.revokeTikTok(accessToken);
  } finally {
    await actions.deleteLocalConnection();
  }
}
