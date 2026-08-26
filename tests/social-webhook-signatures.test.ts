import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  freshTimestamp,
  matchesHmac,
  matchesSha1Hmac,
  matchesTikTokHmac,
} from "../lib/social-webhook-signatures";

test("TikTok signatures use the official timestamp-plus-body contract", () => {
  const secret = "tiktok-secret";
  const body = JSON.stringify({ event: "post.publish.complete", content: "signed" });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  const header = `t=${timestamp},s=${signature}`;

  assert.equal(matchesTikTokHmac(secret, body, header), true);
  assert.equal(matchesTikTokHmac(secret, `${body} `, header), false);
  assert.equal(matchesTikTokHmac(secret, body, signature), false);
});

test("TikTok rejects stale and nonstandard millisecond timestamps", () => {
  const secret = "tiktok-secret";
  const body = "{}";
  const stale = (Math.floor(Date.now() / 1000) - 601).toString();
  const staleSignature = createHmac("sha256", secret).update(`${stale}.${body}`).digest("hex");
  assert.equal(matchesTikTokHmac(secret, body, `t=${stale},s=${staleSignature}`), false);

  const millis = Date.now().toString();
  const millisSignature = createHmac("sha256", secret).update(`${millis}.${body}`).digest("hex");
  assert.equal(matchesTikTokHmac(secret, body, `t=${millis},s=${millisSignature}`), false);
});

test("YouTube SHA-1 and Twitch or Meta SHA-256 verifiers fail closed", () => {
  const secret = "provider-secret";
  const body = "<feed><entry /></feed>";
  const sha1 = `sha1=${createHmac("sha1", secret).update(body).digest("hex")}`;
  const sha256 = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

  assert.equal(matchesSha1Hmac(secret, body, sha1), true);
  assert.equal(matchesSha1Hmac(undefined, body, sha1), false);
  assert.equal(matchesHmac(secret, body, sha256), true);
  assert.equal(matchesHmac(undefined, body, sha256), false);
  assert.equal(freshTimestamp(new Date().toISOString()), true);
  assert.equal(freshTimestamp("not-a-date"), false);
});
