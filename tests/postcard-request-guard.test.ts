import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error The test runner resolves explicit TypeScript suffixes.
import * as postcardRequestGuard from "../lib/postcard-request-guard.ts";

const {
  consumePostcardRequest,
  isTrustedPostcardRequest,
  resetPostcardRequestLimitsForTests,
} = postcardRequestGuard;

test("postcard intent throttling is bounded and resets", () => {
  resetPostcardRequestLimitsForTests();
  assert.deepEqual(consumePostcardRequest("198.51.100.7", 1_000, 2, 100), {
    ok: true,
    remaining: 1,
    resetAt: 1_100,
  });
  assert.equal(consumePostcardRequest("198.51.100.7", 1_001, 2, 100).ok, true);
  assert.equal(consumePostcardRequest("198.51.100.7", 1_002, 2, 100).ok, false);
  assert.equal(consumePostcardRequest("198.51.100.7", 1_100, 2, 100).ok, true);
});

test("postcard intent accepts only a same-origin browser request", () => {
  assert.equal(isTrustedPostcardRequest(new Request("https://thecoreboys.com/api/postcard/create-intent", {
    headers: { origin: "https://thecoreboys.com", "sec-fetch-site": "same-origin" },
  })), true);
  assert.equal(isTrustedPostcardRequest(new Request("https://thecoreboys.com/api/postcard/create-intent", {
    headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
  })), false);
});

test("local development treats same-port loopback host aliases as equivalent", () => {
  const mutableEnv = process.env as Record<string, string | undefined>;
  const previous = process.env.NODE_ENV;
  mutableEnv.NODE_ENV = "development";
  try {
    assert.equal(isTrustedPostcardRequest(new Request("http://localhost:3010/api/postcard/create-intent", {
      headers: { origin: "http://127.0.0.1:3010", "sec-fetch-site": "same-origin" },
    })), true);
    assert.equal(isTrustedPostcardRequest(new Request("http://localhost:3010/api/postcard/create-intent", {
      headers: { origin: "http://127.0.0.1:3011", "sec-fetch-site": "same-origin" },
    })), false);
  } finally {
    if (previous === undefined) delete mutableEnv.NODE_ENV;
    else mutableEnv.NODE_ENV = previous;
  }
});
