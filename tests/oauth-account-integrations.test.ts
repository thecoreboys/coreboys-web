import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { oauthFlashNotice } from "../components/account/connected-account-request";
import { providerCallbackError } from "../lib/oauth/callback-outcome";
import { connectionPublicStatus } from "../lib/oauth/connections";
import {
  disconnectOauthProvider,
  revocationTokenKind,
  revokeProviderToken,
} from "../lib/oauth/disconnect";
import { authorizeUrl } from "../lib/oauth/exchange";
import { refreshFailureIsPermanent } from "../lib/oauth/refresh";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const NOW = Date.parse("2026-11-13T12:00:00Z");
const row = (overrides: Partial<Parameters<typeof connectionPublicStatus>[0]> = {}) => ({
  status: "active",
  access_token_enc: "v1:a:b:c",
  refresh_token_enc: "v1:d:e:f",
  token_expires_at: new Date(NOW + 3_600_000),
  ...overrides,
});

test("connection status shows reconnect for unusable grants, not Connected", () => {
  assert.equal(connectionPublicStatus(row(), NOW), "active");
  assert.equal(connectionPublicStatus(row({ status: "expired" }), NOW), "expired");
  assert.equal(connectionPublicStatus(row({ status: "revoked" }), NOW), "revoked");
  assert.equal(connectionPublicStatus(row({ access_token_enc: null }), NOW), "expired");
  // Past expiry is fine while a refresh token can renew it…
  assert.equal(connectionPublicStatus(row({ token_expires_at: new Date(NOW - 1000) }), NOW), "active");
  // …but without one the grant is dead.
  assert.equal(
    connectionPublicStatus(row({ token_expires_at: new Date(NOW - 1000), refresh_token_enc: null }), NOW),
    "expired",
  );
  assert.equal(connectionPublicStatus(row({ token_expires_at: null, refresh_token_enc: null }), NOW), "active");
});

test("only rejected refresh credentials require a reconnect", () => {
  assert.equal(refreshFailureIsPermanent(400), true);
  assert.equal(refreshFailureIsPermanent(401), true);
  for (const status of [403, 408, 429, 500, 502, 503]) assert.equal(refreshFailureIsPermanent(status), false, String(status));
});

test("refresh never loops on a dead grant and tolerates a concurrent rotation", () => {
  const refresh = read("lib/oauth/refresh.ts");
  const connections = read("lib/oauth/connections.ts");
  assert.match(refresh, /row\.status === "revoked" \|\| row\.status === "expired"\) return null/);
  assert.match(refresh, /const marked = await markRefreshRejected\(row, [^)]*\);\s*return !marked;/);
  assert.match(connections, /AND refresh_token_enc IS NOT DISTINCT FROM \$5/);
  // Network errors and outages are recorded as sync errors, never as expired.
  assert.match(refresh, /err instanceof RefreshRequestError && err\.permanent/);
  assert.match(refresh, /await markSyncError\(row\.user_id, row\.provider, msg, row\.id\)/);
});

test("provider error callbacks separate a cancelled consent from a failure", () => {
  assert.deepEqual(providerCallbackError("access_denied"), { oauth: "denied" });
  assert.deepEqual(providerCallbackError("user_denied"), { oauth: "denied" });
  assert.deepEqual(providerCallbackError("redirect_uri_mismatch"), { oauth: "error", reason: "provider" });
  assert.deepEqual(providerCallbackError("invalid_scope"), { oauth: "error", reason: "provider" });
});

test("callback reports an expired state cookie and keeps the provider on every bounce", () => {
  const callback = read("app/api/oauth/[provider]/callback/route.ts");
  assert.match(callback, /reason: "expired-state", provider/);
  assert.match(callback, /reason: "bad-state", provider/);
  assert.match(callback, /reason: "exchange", provider/);
  assert.match(callback, /e instanceof OauthConnectError/);
  assert.doesNotMatch(callback, /oauth: "denied", provider \}\);\s*\}\s*const code/);
});

test("settings flash explains each callback result in plain language", () => {
  const params = (value: string) => new URLSearchParams(value);
  const label = (key: string) => ({ twitch: "Twitch", youtube: "YouTube" })[key];
  assert.deepEqual(oauthFlashNotice(params("oauth=ok&provider=twitch"), label), {
    message: "Connected Twitch and completed the first sync.",
    tone: "success",
  });
  assert.match(oauthFlashNotice(params("oauth=denied&provider=twitch"), label)!.message, /You cancelled the Twitch connect/);
  assert.match(oauthFlashNotice(params("oauth=error&reason=expired-state&provider=youtube"), label)!.message, /took too long/);
  assert.match(oauthFlashNotice(params("oauth=error&reason=no-channel&provider=youtube"), label)!.message, /no YouTube channel/);
  assert.match(oauthFlashNotice(params("oauth=error&reason=unexpected&provider=x"), label)!.message, /Couldn’t finish the X connect/);
  assert.equal(oauthFlashNotice(params("oauth=error&provider=twitch"), label)!.tone, "error");
  assert.equal(oauthFlashNotice(params(""), label), null);
});

test("authorize URLs request offline, re-consented Google grants and the catalog Twitch scopes", () => {
  const previous = { twitch: process.env.TWITCH_CLIENT_ID, google: process.env.GOOGLE_CLIENT_ID };
  process.env.TWITCH_CLIENT_ID = "twitch-client";
  process.env.GOOGLE_CLIENT_ID = "google-client";
  try {
    const google = new URL(authorizeUrl("youtube", "http://localhost:3010", "nonce", "challenge"));
    assert.equal(google.searchParams.get("client_id"), "google-client");
    assert.equal(google.searchParams.get("redirect_uri"), "http://localhost:3010/api/oauth/youtube/callback");
    assert.equal(google.searchParams.get("access_type"), "offline");
    assert.equal(google.searchParams.get("prompt"), "consent");
    assert.equal(google.searchParams.get("code_challenge_method"), "S256");
    const twitch = new URL(authorizeUrl("twitch", "http://localhost:3010", "nonce", "challenge"));
    assert.equal(twitch.searchParams.get("client_id"), "twitch-client");
    assert.equal(twitch.searchParams.get("state"), "nonce");
    assert.match(twitch.searchParams.get("scope") ?? "", /user:read:follows/);
  } finally {
    if (previous.twitch === undefined) delete process.env.TWITCH_CLIENT_ID;
    else process.env.TWITCH_CLIENT_ID = previous.twitch;
    if (previous.google === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = previous.google;
  }
});

test("YouTube never stores a shared placeholder identity", () => {
  const exchange = read("lib/oauth/exchange.ts");
  assert.doesNotMatch(exchange, /providerUserId: item\?\.id \?\? "unknown"/);
  assert.match(exchange, /new OauthConnectError\("no-channel"/);
});

test("disconnect revokes Twitch, Google and X grants with each provider's contract", async () => {
  const previous = { ...process.env };
  process.env.TWITCH_CLIENT_ID = "twitch-client";
  process.env.X_CLIENT_ID = "x-client";
  process.env.X_CLIENT_SECRET = "x-secret";
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    return new Response(null, { status: 200 });
  }) as typeof fetch;
  try {
    await revokeProviderToken("twitch", { token: "tw-access", kind: "access_token" }, fetchImpl);
    await revokeProviderToken("youtube", { token: "g-refresh", kind: "refresh_token" }, fetchImpl);
    await revokeProviderToken("x", { token: "x-refresh", kind: "refresh_token" }, fetchImpl);
    const [twitch, google, x] = requests;
    assert.equal(twitch!.url, "https://id.twitch.tv/oauth2/revoke");
    assert.deepEqual(Object.fromEntries(new URLSearchParams(String(twitch!.init?.body))), { token: "tw-access", client_id: "twitch-client" });
    assert.equal(google!.url, "https://oauth2.googleapis.com/revoke");
    assert.deepEqual(Object.fromEntries(new URLSearchParams(String(google!.init?.body))), { token: "g-refresh" });
    assert.equal(x!.url, "https://api.twitter.com/2/oauth2/revoke");
    assert.equal(new Headers(x!.init?.headers).get("Authorization"), `Basic ${Buffer.from("x-client:x-secret").toString("base64")}`);
    assert.equal(new URLSearchParams(String(x!.init?.body)).get("token_type_hint"), "refresh_token");
    for (const request of requests) assert.equal(request.init?.method, "POST");
  } finally {
    process.env = previous;
  }
});

test("an already-invalid token counts as revoked; outages are reported", async () => {
  const respond = (status: number) => (async () => new Response(null, { status })) as typeof fetch;
  await revokeProviderToken("youtube", { token: "t", kind: "access_token" }, respond(400));
  await assert.rejects(revokeProviderToken("twitch", { token: "t", kind: "access_token" }, respond(503)), /twitch revoke 503/);
});

test("disconnect revokes before local deletion and always deletes locally", async () => {
  assert.equal(revocationTokenKind("youtube"), "refresh-first");
  assert.equal(revocationTokenKind("x"), "refresh-first");
  assert.equal(revocationTokenKind("twitch"), "live-access");
  assert.equal(revocationTokenKind("tiktok"), "live-access");
  assert.equal(revocationTokenKind("instagram"), null);

  const calls: string[] = [];
  await assert.rejects(disconnectOauthProvider("twitch", {
    loadRevocableToken: async () => {
      calls.push("load");
      return { token: "t", kind: "access_token" };
    },
    revoke: async () => {
      calls.push("revoke");
      throw new Error("twitch revoke 503");
    },
    deleteLocalConnection: async () => {
      calls.push("delete");
    },
  }), /twitch revoke 503/);
  assert.deepEqual(calls, ["load", "revoke", "delete"]);
});

test("settings show unavailable providers and hide a reconnect that would bounce", () => {
  const component = read("components/account/ConnectedAccounts.tsx");
  assert.match(component, /const providerUnavailable = p\.connectable && !p\.configured/);
  assert.match(component, /connectionNeedsReconnect && !providerUnavailable/);
  assert.match(component, /label: "Reconnect needed"/);
  assert.match(component, /result\.providerRevokeFailed/);
});
