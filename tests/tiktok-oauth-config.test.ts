import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { authorizeUrl, exchangeCode } from "../lib/oauth/exchange";
import {
  disconnectOauthProvider,
  revokeTikTokAccess,
} from "../lib/oauth/disconnect";
import {
  TIKTOK_CREATOR_FEED_SCOPES,
  callbackPath,
} from "../lib/oauth/providers";

const PROD_ORIGIN = "https://thecoreboys.com";

test("TikTok Web Login Kit uses the registered HTTPS callback and exact creator-feed scopes", () => {
  const previous = process.env.TIKTOK_CLIENT_KEY;
  process.env.TIKTOK_CLIENT_KEY = "test-client-key";
  try {
    const url = new URL(authorizeUrl("tiktok", PROD_ORIGIN, "csrf-state", "unused-web-challenge"));

    assert.equal(url.origin + url.pathname, "https://www.tiktok.com/v2/auth/authorize/");
    assert.equal(url.searchParams.get("client_key"), "test-client-key");
    assert.equal(url.searchParams.get("response_type"), "code");
    assert.equal(url.searchParams.get("redirect_uri"), `${PROD_ORIGIN}/api/oauth/tiktok/callback`);
    assert.equal(url.searchParams.get("state"), "csrf-state");
    assert.deepEqual(
      new Set((url.searchParams.get("scope") ?? "").split(",")),
      new Set(TIKTOK_CREATOR_FEED_SCOPES),
    );
    // TikTok documents PKCE for mobile/desktop, not its server-side Web flow.
    assert.equal(url.searchParams.has("code_challenge"), false);
    assert.equal(url.searchParams.has("code_challenge_method"), false);
    assert.equal(callbackPath("tiktok"), "/api/oauth/tiktok/callback");
  } finally {
    if (previous === undefined) delete process.env.TIKTOK_CLIENT_KEY;
    else process.env.TIKTOK_CLIENT_KEY = previous;
  }
});

test("TikTok token exchange persists only an exact usable creator identity", async () => {
  const originalFetch = globalThis.fetch;
  const previousKey = process.env.TIKTOK_CLIENT_KEY;
  const previousSecret = process.env.TIKTOK_CLIENT_SECRET;
  process.env.TIKTOK_CLIENT_KEY = "test-client-key";
  process.env.TIKTOK_CLIENT_SECRET = "test-client-secret";

  const requests: Array<{ url: string; body: string | null }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, body: init?.body ? String(init.body) : null });
    if (url.endsWith("/v2/oauth/token/")) {
      return Response.json({
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
        expires_in: 86_400,
        open_id: "test-open-id",
        scope: TIKTOK_CREATOR_FEED_SCOPES.join(","),
      });
    }
    if (url.startsWith("https://open.tiktokapis.com/v2/user/info/")) {
      return Response.json({
        data: {
          user: {
            open_id: "test-open-id",
            display_name: "FaZe Adapt",
            avatar_url: "https://example.test/adapt.png",
            username: "@FaZeAdapt",
          },
        },
        error: { code: "ok" },
      });
    }
    throw new Error(`unexpected request: ${url}`);
  };

  try {
    const identity = await exchangeCode("tiktok", PROD_ORIGIN, "test-code", "unused-web-verifier");
    assert.equal(identity.providerUserId, "test-open-id");
    assert.equal(identity.username, "FaZeAdapt");
    assert.deepEqual(new Set(identity.scopes), new Set(TIKTOK_CREATOR_FEED_SCOPES));
    assert.equal(requests.length, 2);

    const tokenBody = new URLSearchParams(requests[0]?.body ?? "");
    assert.equal(tokenBody.get("redirect_uri"), `${PROD_ORIGIN}/api/oauth/tiktok/callback`);
    assert.equal(tokenBody.get("code_verifier"), null);
    assert.match(requests[1]?.url ?? "", /fields=open_id,display_name,avatar_url,username/);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.TIKTOK_CLIENT_KEY;
    else process.env.TIKTOK_CLIENT_KEY = previousKey;
    if (previousSecret === undefined) delete process.env.TIKTOK_CLIENT_SECRET;
    else process.env.TIKTOK_CLIENT_SECRET = previousSecret;
  }
});

test("TikTok creator grants fail closed when a required scope is denied", async () => {
  const originalFetch = globalThis.fetch;
  const previousKey = process.env.TIKTOK_CLIENT_KEY;
  const previousSecret = process.env.TIKTOK_CLIENT_SECRET;
  process.env.TIKTOK_CLIENT_KEY = "test-client-key";
  process.env.TIKTOK_CLIENT_SECRET = "test-client-secret";
  globalThis.fetch = async () => Response.json({
    access_token: "test-access-token",
    refresh_token: "test-refresh-token",
    open_id: "test-open-id",
    scope: "user.info.basic,video.list",
  });
  try {
    await assert.rejects(
      exchangeCode("tiktok", PROD_ORIGIN, "test-code", "unused-web-verifier"),
      /tiktok scopes missing: user\.info\.profile/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.TIKTOK_CLIENT_KEY;
    else process.env.TIKTOK_CLIENT_KEY = previousKey;
    if (previousSecret === undefined) delete process.env.TIKTOK_CLIENT_SECRET;
    else process.env.TIKTOK_CLIENT_SECRET = previousSecret;
  }
});

test("TikTok disconnect uses the official form-encoded revoke request", async () => {
  const previousKey = process.env.TIKTOK_CLIENT_KEY;
  const previousSecret = process.env.TIKTOK_CLIENT_SECRET;
  process.env.TIKTOK_CLIENT_KEY = "test-client-key";
  process.env.TIKTOK_CLIENT_SECRET = "test-client-secret";

  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    return new Response(null, { status: 200 });
  }) as typeof fetch;

  try {
    await revokeTikTokAccess("test-access-token", fetchImpl);
    const request = requests[0];
    assert.ok(request);
    assert.equal(request.url, "https://open.tiktokapis.com/v2/oauth/revoke/");
    assert.equal(request.init?.method, "POST");
    assert.equal(
      new Headers(request.init?.headers).get("Content-Type"),
      "application/x-www-form-urlencoded",
    );
    assert.equal(new Headers(request.init?.headers).get("Cache-Control"), "no-cache");

    const body = new URLSearchParams(String(request.init?.body));
    assert.deepEqual([...body.keys()].sort(), ["client_key", "client_secret", "token"]);
    assert.equal(body.get("client_key"), "test-client-key");
    assert.equal(body.get("client_secret"), "test-client-secret");
    assert.equal(body.get("token"), "test-access-token");
  } finally {
    if (previousKey === undefined) delete process.env.TIKTOK_CLIENT_KEY;
    else process.env.TIKTOK_CLIENT_KEY = previousKey;
    if (previousSecret === undefined) delete process.env.TIKTOK_CLIENT_SECRET;
    else process.env.TIKTOK_CLIENT_SECRET = previousSecret;
  }
});

test("TikTok disconnect revokes before local deletion", async () => {
  const calls: string[] = [];

  await disconnectOauthProvider("tiktok", {
    loadTikTokAccessToken: async () => {
      calls.push("load");
      return "test-access-token";
    },
    revokeTikTok: async () => {
      calls.push("revoke");
    },
    deleteLocalConnection: async () => {
      calls.push("delete");
    },
  });

  assert.deepEqual(calls, ["load", "revoke", "delete"]);
});

test("TikTok disconnect still deletes local data when revocation fails", async () => {
  const calls: string[] = [];

  await assert.rejects(
    disconnectOauthProvider("tiktok", {
      loadTikTokAccessToken: async () => {
        calls.push("load");
        return "test-access-token";
      },
      revokeTikTok: async () => {
        calls.push("revoke");
        throw new Error("provider unavailable");
      },
      deleteLocalConnection: async () => {
        calls.push("delete");
      },
    }),
    /provider unavailable/,
  );

  assert.deepEqual(calls, ["load", "revoke", "delete"]);
});

test("other OAuth providers retain local-only disconnect behavior", async () => {
  const calls: string[] = [];

  await disconnectOauthProvider("youtube", {
    loadTikTokAccessToken: async () => {
      calls.push("unexpected-load");
      return null;
    },
    revokeTikTok: async () => {
      calls.push("unexpected-revoke");
    },
    deleteLocalConnection: async () => {
      calls.push("delete");
    },
  });

  assert.deepEqual(calls, ["delete"]);
});

test("Watch home exposes active Privacy and Terms links without a menu", async () => {
  const source = await readFile(new URL("../components/watch/WatchLegalFooter.tsx", import.meta.url), "utf8");
  assert.match(source, /href="\/legal\/privacy"/);
  assert.match(source, /href="\/legal\/terms"/);
  assert.match(source, /href="\/legal\/data-deletion"/);
});
