import assert from "node:assert/strict";
import test from "node:test";
import { createSharedSocialFetchRequests, socialFetchRequestKey } from "../lib/social-fetch-request-cache";
import { createTestSocialFetchRequestStore } from "./helpers/social-fetch-request-store";

test("separate replicas share one paid request and cached results spend nothing", async () => {
  const database = createTestSocialFetchRequestStore();
  const firstReplica = createSharedSocialFetchRequests(database.store);
  const secondReplica = createSharedSocialFetchRequests(database.store);
  let calls = 0;
  let release!: () => void;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => { started = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const input = {
    key: "a".repeat(64), ttlSeconds: 7_200,
    load: async () => { calls++; started(); await gate; return { posts: ["published-post"] }; },
    unavailable: () => ({ posts: [] as string[] }), successful: () => true,
  };
  const owner = firstReplica(input);
  await ready;
  const busy = await secondReplica(input);
  assert.equal(calls, 1);
  assert.equal(busy.reused, true);
  release();
  assert.equal((await owner).reused, false);
  const cached = await secondReplica(input);
  assert.deepEqual(cached, { reused: true, value: { posts: ["published-post"] } });
  assert.equal(calls, 1);
  database.advance(7_200_001);
  assert.equal((await secondReplica(input)).reused, false);
  assert.equal(calls, 2);
});

test("database failure and a competing lease cannot fall through to the paid provider", async () => {
  let calls = 0;
  for (const failure of ["read", "claim", "busy"]) {
    const run = createSharedSocialFetchRequests({
      async read() { if (failure === "read") throw Error("database offline"); return null; },
      async claim() { if (failure === "claim") throw Error("database offline"); return false; },
      async complete() { throw Error("must not write"); },
    });
    const result = await run({ key: failure, ttlSeconds: 60,
      load: async () => { calls++; return 1; }, unavailable: () => null, successful: () => true });
    assert.deepEqual(result, { value: null, reused: true });
  }
  assert.equal(calls, 0);
});

test("provider failures have one shared retry window instead of a replica retry storm", async () => {
  const database = createTestSocialFetchRequestStore();
  const a = createSharedSocialFetchRequests(database.store);
  const b = createSharedSocialFetchRequests(database.store);
  let calls = 0;
  const input = { key: "b".repeat(64), ttlSeconds: 7_200,
    load: async () => { calls++; return { status: "upstream_error" }; },
    unavailable: () => ({ status: "unavailable" }), successful: () => false };
  await a(input);
  await b(input);
  assert.equal(calls, 1);
  database.advance(120_001);
  await b(input);
  assert.equal(calls, 2);
});

test("request keys isolate API versions and rotated credentials without retaining secrets", () => {
  const secret = "sensitive-credential";
  const v1 = socialFetchRequestKey("https://api.socialfetch.dev/v1/profile", secret);
  assert.match(v1, /^[a-f0-9]{64}$/);
  assert.equal(v1.includes(secret), false);
  assert.notEqual(v1, socialFetchRequestKey("https://api.socialfetch.dev/v2/profile", secret));
  assert.notEqual(v1, socialFetchRequestKey("https://api.socialfetch.dev/v1/profile", "rotated"));
  assert.equal(
    socialFetchRequestKey("https://api.socialfetch.dev/v1/twitter/profiles/FaZeAdapt/tweets?limit=100&cursor=AbC", secret),
    socialFetchRequestKey("https://api.socialfetch.dev/v1/twitter/profiles/fazeadapt/tweets?cursor=AbC&limit=100", secret),
  );
  assert.notEqual(
    socialFetchRequestKey("https://api.socialfetch.dev/v1/twitter/profiles/fazeadapt/tweets?cursor=AbC", secret),
    socialFetchRequestKey("https://api.socialfetch.dev/v1/twitter/profiles/fazeadapt/tweets?cursor=abc", secret),
  );
});
