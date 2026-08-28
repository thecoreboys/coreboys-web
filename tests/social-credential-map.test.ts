import assert from "node:assert/strict";
import test from "node:test";
import { authorizeUrl } from "../lib/oauth/exchange";
import {
  instagramConfigured,
  instagramLoginCredentials,
  tiktokAppCredentials,
} from "../lib/oauth/providers";
import { credentialStateForOfficialFeed } from "../lib/social-ingestion-health";
import { resolveMetaWebhookAppSecret } from "../lib/social-webhook-config";
import {
  creatorHandleForMappedProviderUserId,
  normalizeCreatorProviderUserId,
  parseCreatorTokenMap,
} from "../lib/watch/social-credential-map";

test("creator maps accept documented and provider-native token response fields", () => {
  const tiktok = parseCreatorTokenMap("tiktok", JSON.stringify({
    "@Creator.Name": { access_token: " tiktok-token ", open_id: " open-id " },
  }));
  assert.equal(tiktok.valid, true);
  assert.deepEqual(tiktok.entries.get("creator.name"), {
    accessToken: "tiktok-token",
    providerUserId: "open-id",
  });
  assert.equal(
    creatorHandleForMappedProviderUserId(tiktok.entries, " open-id "),
    "creator.name",
  );

  const instagram = parseCreatorTokenMap("instagram", JSON.stringify({
    creator: { access_token: "instagram-token", user_id: 123456, api: "FACEBOOK" },
  }));
  assert.equal(instagram.valid, true);
  assert.deepEqual(instagram.entries.get("creator"), {
    accessToken: "instagram-token",
    providerUserId: "123456",
    instagramApi: "facebook",
  });
});

test("blank aliases fall through while conflicting identities fail closed", () => {
  const fallback = parseCreatorTokenMap("tiktok", JSON.stringify({
    creator: { accessToken: "token", openId: " ", userId: "fallback-id" },
  }));
  assert.equal(fallback.valid, true);
  assert.equal(fallback.entries.get("creator")?.providerUserId, "fallback-id");

  const conflicting = parseCreatorTokenMap("tiktok", JSON.stringify({
    creator: { accessToken: "token", openId: "one", userId: "two" },
  }));
  assert.equal(conflicting.valid, false);
  assert.equal(conflicting.entries.has("creator"), false);
});

test("malformed creator rows never throw or hide independent valid rows", () => {
  const parsed = parseCreatorTokenMap("instagram", JSON.stringify({
    nullrow: null,
    arrayrow: [],
    booleanrow: true,
    numerictoken: { accessToken: 123 },
    missingfacebookid: { accessToken: "token", api: "facebook" },
    validcreator: { accessToken: " valid-token ", userId: " valid-id " },
  }));
  assert.equal(parsed.valid, false);
  assert.deepEqual([...parsed.entries.keys()], ["validcreator"]);
  assert.equal(
    creatorHandleForMappedProviderUserId(parsed.entries, "valid-id"),
    "validcreator",
  );
  assert.equal(normalizeCreatorProviderUserId(Number.MAX_SAFE_INTEGER + 1), null);
  assert.equal(normalizeCreatorProviderUserId("line\nbreak"), null);
});

test("normalized handle and provider-id collisions are never selected by property order", () => {
  const duplicateHandle = parseCreatorTokenMap("tiktok", JSON.stringify({
    "@Creator": { accessToken: "first", openId: "one" },
    "https://www.tiktok.com/@creator": { accessToken: "second", openId: "two" },
  }));
  assert.equal(duplicateHandle.valid, false);
  assert.equal(duplicateHandle.entries.size, 0);

  const duplicateId = parseCreatorTokenMap("tiktok", JSON.stringify({
    first: { accessToken: "first-token", openId: "same-id" },
    second: { accessToken: "second-token", openId: "same-id" },
  }));
  assert.equal(duplicateId.valid, true);
  assert.equal(creatorHandleForMappedProviderUserId(duplicateId.entries, "same-id"), null);
});

test("Instagram Login requires one matched Instagram credential pair", () => {
  const names = [
    "INSTAGRAM_CLIENT_ID",
    "INSTAGRAM_CLIENT_SECRET",
    "FACEBOOK_APP_ID",
    "FACEBOOK_APP_SECRET",
  ] as const;
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    delete process.env.INSTAGRAM_CLIENT_ID;
    delete process.env.INSTAGRAM_CLIENT_SECRET;
    process.env.FACEBOOK_APP_ID = "facebook-id";
    process.env.FACEBOOK_APP_SECRET = "facebook-secret";
    assert.equal(instagramConfigured(), false);
    assert.equal(instagramLoginCredentials(), null);

    process.env.INSTAGRAM_CLIENT_ID = "instagram-id";
    assert.equal(instagramConfigured(), false);
    assert.equal(
      new URL(authorizeUrl("instagram", "https://thecoreboys.com", "state", "unused"))
        .searchParams.get("client_id"),
      "",
    );

    process.env.INSTAGRAM_CLIENT_SECRET = " instagram-secret ";
    assert.deepEqual(instagramLoginCredentials(), {
      clientId: "instagram-id",
      clientSecret: "instagram-secret",
    });
    assert.equal(instagramConfigured(), true);
    assert.equal(
      new URL(authorizeUrl("instagram", "https://thecoreboys.com", "state", "unused"))
        .searchParams.get("client_id"),
      "instagram-id",
    );
  } finally {
    for (const name of names) {
      const value = previous[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("TikTok app credentials are a trimmed complete pair", () => {
  const previousKey = process.env.TIKTOK_CLIENT_KEY;
  const previousSecret = process.env.TIKTOK_CLIENT_SECRET;
  try {
    process.env.TIKTOK_CLIENT_KEY = " key ";
    process.env.TIKTOK_CLIENT_SECRET = "   ";
    assert.equal(tiktokAppCredentials(), null);
    process.env.TIKTOK_CLIENT_SECRET = " secret ";
    assert.deepEqual(tiktokAppCredentials(), { clientKey: "key", clientSecret: "secret" });
  } finally {
    if (previousKey === undefined) delete process.env.TIKTOK_CLIENT_KEY;
    else process.env.TIKTOK_CLIENT_KEY = previousKey;
    if (previousSecret === undefined) delete process.env.TIKTOK_CLIENT_SECRET;
    else process.env.TIKTOK_CLIENT_SECRET = previousSecret;
  }
});

test("Meta webhook secret selection requires an explicit choice for different apps", () => {
  assert.equal(resolveMetaWebhookAppSecret({ metaAppSecret: " meta " }), "meta");
  assert.equal(resolveMetaWebhookAppSecret({ facebookAppSecret: "same", instagramClientSecret: "same" }), "same");
  assert.equal(resolveMetaWebhookAppSecret({ facebookAppSecret: "facebook" }), "facebook");
  assert.equal(resolveMetaWebhookAppSecret({ instagramClientSecret: "instagram" }), "instagram");
  assert.equal(resolveMetaWebhookAppSecret({
    facebookAppSecret: "facebook",
    instagramClientSecret: "instagram",
  }), null);
  assert.equal(resolveMetaWebhookAppSecret({
    metaAppSecret: "chosen",
    facebookAppSecret: "facebook",
    instagramClientSecret: "instagram",
  }), "chosen");
});

test("official reads drive token-aware source health", () => {
  assert.equal(credentialStateForOfficialFeed("ok"), "healthy");
  assert.equal(credentialStateForOfficialFeed("empty"), "healthy");
  assert.equal(credentialStateForOfficialFeed("unauthorized"), "expired");
  assert.equal(credentialStateForOfficialFeed("forbidden"), "expired");
  assert.equal(credentialStateForOfficialFeed("not_configured"), "missing");
  assert.equal(credentialStateForOfficialFeed("rate_limited"), "unknown");
});
