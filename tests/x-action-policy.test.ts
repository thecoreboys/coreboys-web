import assert from "node:assert/strict";
import test from "node:test";
import { X_ACTION_RATE_LIMIT, X_ACTION_SCOPE, xActionRequestIsValid, xActionTarget } from "../lib/x/action-policy";
import { xWebIntentUrl } from "../lib/x/intents";

test("native X actions bind the correct target and least required write scope", () => {
  assert.equal(xActionTarget({ action: "like", postId: "1234567890" }), "1234567890");
  assert.equal(xActionTarget({ action: "follow", targetUserId: "9876543210" }), "9876543210");
  assert.equal(X_ACTION_SCOPE.like, "like.write");
  assert.equal(X_ACTION_SCOPE.reply, "tweet.write");
  assert.equal(X_ACTION_SCOPE.follow, "follows.write");
  assert.ok(X_ACTION_RATE_LIMIT.reply < X_ACTION_RATE_LIMIT.like);
});

test("native X action payloads reject ambiguous targets and unbounded replies", () => {
  assert.equal(xActionRequestIsValid({ action: "like", postId: "1234567890" }), true);
  assert.equal(xActionRequestIsValid({ action: "like", postId: "not-an-id" }), false);
  assert.equal(xActionRequestIsValid({ action: "follow", targetUserId: "1234567890" }), true);
  assert.equal(xActionRequestIsValid({ action: "follow", postId: "1234567890" }), false);
  assert.equal(xActionRequestIsValid({ action: "reply", postId: "1234567890", text: "" }), false);
  assert.equal(xActionRequestIsValid({ action: "reply", postId: "1234567890", text: "x".repeat(281) }), false);
});

test("official X Web Intents include like, repost, reply, and follow", () => {
  assert.equal(xWebIntentUrl({ action: "like", postId: "1234567890" }), "https://twitter.com/intent/like?tweet_id=1234567890");
  assert.equal(xWebIntentUrl({ action: "repost", postId: "1234567890" }), "https://twitter.com/intent/retweet?tweet_id=1234567890");
  assert.equal(xWebIntentUrl({ action: "reply", postId: "1234567890" }), "https://twitter.com/intent/tweet?in_reply_to=1234567890");
  assert.equal(xWebIntentUrl({ action: "follow", handle: "@coreboys" }), "https://twitter.com/intent/follow?screen_name=coreboys");
  assert.equal(xWebIntentUrl({ action: "follow", handle: "bad/handle" }), null);
});
