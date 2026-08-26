import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error The test runner resolves explicit TypeScript suffixes.
import * as postcardAccess from "../lib/postcard-access.ts";

const {
  createPostcardStatusToken,
  hashPostcardStatusToken,
  isPostcardOrderId,
  verifyPostcardStatusToken,
} = postcardAccess;

test("postcard status tokens are random, one-way, and timing-safe to verify", () => {
  const first = createPostcardStatusToken();
  const second = createPostcardStatusToken();
  assert.notEqual(first, second);
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);

  const hash = hashPostcardStatusToken(first);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(verifyPostcardStatusToken(first, hash), true);
  assert.equal(verifyPostcardStatusToken(second, hash), false);
  assert.equal(verifyPostcardStatusToken("bad", hash), false);
  assert.equal(verifyPostcardStatusToken(first, "bad"), false);
});

test("only canonical random UUID order ids are accepted", () => {
  assert.equal(isPostcardOrderId("51c1ed0c-2314-4ad0-b0e6-4ca3893bf686"), true);
  assert.equal(isPostcardOrderId("51c1ed0c-2314-1ad0-b0e6-4ca3893bf686"), false);
  assert.equal(isPostcardOrderId("../orders"), false);
});
