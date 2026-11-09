import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { parseXActivityAccountBindings, parseXStreamWebhook, readXWebhookBody, verifyXWebhookSignature, xWebhookCrcResponse, X_WEBHOOK_MAX_BODY_BYTES } from "../lib/x-webhook";

const accounts = [{ handle: "drewwall_", authorSlug: "crew:drew-wall", authorLabel: "Drew Wall" }];
const payload = {
  data: { id: "123456789", author_id: "u1", text: "Crew update 🎥", created_at: "2026-11-08T12:00:00Z" },
  includes: { users: [{ id: "u1", username: "drewwall_", name: "Drew Wall" }] },
  matching_rules: [{ id: "12345", tag: "core-roster" }],
};
const secrets = { clientSecret: "oauth2-test-secret", consumerSecret: "oauth1-test-secret" };
const sign = (secret: string, raw: Uint8Array | string) => `sha256=${createHmac("sha256", secret).update(raw).digest("base64")}`;

test("X CRC uses OAuth2 secret in preference to consumer secret and bounds challenge", () => {
  assert.equal(xWebhookCrcResponse("challenge", secrets), sign(secrets.clientSecret, "challenge"));
  assert.equal(xWebhookCrcResponse("challenge", { consumerSecret: secrets.consumerSecret }), sign(secrets.consumerSecret, "challenge"));
  assert.equal(xWebhookCrcResponse("", secrets), null);
  assert.equal(xWebhookCrcResponse("x".repeat(1025), secrets), null);
  assert.equal(xWebhookCrcResponse("challenge", {}), null);
});

test("X webhook signature authenticates exact UTF-8 bytes and cannot downgrade after OAuth2 failure", () => {
  const raw = Buffer.from(JSON.stringify(payload));
  const headers = new Headers({ "x-twitter-webhooks-signature-oauth2": sign(secrets.clientSecret, raw) });
  assert.equal(verifyXWebhookSignature(raw, headers, secrets), true);
  assert.equal(verifyXWebhookSignature(Buffer.from(`${raw} `), headers, secrets), false);
  const legacy = new Headers({ "x-twitter-webhooks-signature": sign(secrets.consumerSecret, raw) });
  assert.equal(verifyXWebhookSignature(raw, legacy, secrets), true);
  legacy.set("x-twitter-webhooks-signature-oauth2", "sha256=invalid");
  assert.equal(verifyXWebhookSignature(raw, legacy, secrets), false);
  assert.equal(verifyXWebhookSignature(raw, new Headers(), secrets), false);
  assert.equal(verifyXWebhookSignature(raw, headers, {}), false);
});

test("stream delivery accepts crew expansions, rejects malformed data and ignores unrelated authors/replies", () => {
  const items = parseXStreamWebhook(payload, accounts);
  assert.equal(items.length, 1);
  assert.equal(items[0]?.authorSlug, "crew:drew-wall");
  assert.equal(items[0]?.title, "Crew update 🎥");
  assert.equal(items[0]?.sourceUrl, "https://x.com/drewwall_/status/123456789");
  assert.deepEqual(parseXStreamWebhook(payload, []), []);
  assert.deepEqual(parseXStreamWebhook({ ...payload, data: { ...payload.data, referenced_tweets: [{ type: "replied_to", id: "99999" }] } }, accounts), []);
  assert.throws(() => parseXStreamWebhook({ data: payload.data }, accounts));
  assert.throws(() => parseXStreamWebhook({ ...payload, data: [payload.data] }, accounts));
});

test("webhook read bounds real streamed bytes with and without Content-Length", async () => {
  const raw = JSON.stringify(payload);
  assert.equal(Buffer.from((await readXWebhookBody(new Request("https://core.test", { method: "POST", body: raw })))!).toString(), raw);
  assert.equal(await readXWebhookBody(new Request("https://core.test", { method: "POST", body: raw, headers: { "content-length": String(X_WEBHOOK_MAX_BODY_BYTES + 1) } })), null);
  assert.equal(await readXWebhookBody(new Request("https://core.test", { method: "POST", body: "x".repeat(X_WEBHOOK_MAX_BODY_BYTES + 1) })), null);
});

test("Activity post.create unwraps the official envelope and preserves crew attribution", () => {
  const activity = { data: {
    event_type: "post.create", event_uuid: "test-event-uuid",
    filter: { user_id: payload.data.author_id },
    payload: payload.data, includes: payload.includes,
  } };
  const items = parseXStreamWebhook(activity, accounts);
  assert.equal(items.length, 1);
  assert.equal(items[0]?.authorSlug, "crew:drew-wall");
  assert.equal(items[0]?.sourceUrl, "https://x.com/drewwall_/status/123456789");
  assert.deepEqual(items, parseXStreamWebhook(payload, accounts));
  assert.deepEqual(parseXStreamWebhook(activity, []), []);
});

test("Activity delivery rejects other events, malformed posts and mismatched subscription authors", () => {
  const data = { event_type: "post.create", filter: { user_id: "u1" }, payload: payload.data, includes: payload.includes };
  assert.throws(() => parseXStreamWebhook({ data: { ...data, event_type: "post.delete" } }, accounts), /unsupported_x_activity_event/);
  assert.throws(() => parseXStreamWebhook({ data: { ...data, payload: [] } }, accounts), /invalid_x_activity_post/);
  assert.throws(() => parseXStreamWebhook({ data: { ...data, filter: { user_id: "another-author" } } }, accounts), /x_activity_author_mismatch/);
  assert.throws(() => parseXStreamWebhook({ data: { ...data, filter: [] } }, accounts), /invalid_x_activity_filter/);
  assert.throws(() => parseXStreamWebhook({ data: { ...data, includes: undefined } }, accounts));
});

test("Activity reply and repost deliveries do not enter the original-post feed", () => {
  for (const reference of [{ in_reply_to_tweet_id: "999999" }, { retweeted_tweet_id: "999999" },
    { referenced_tweets: [{ type: "replied_to", id: "999999" }] },
    { referenced_tweets: [{ type: "retweeted", id: "999999" }] }]) {
    assert.deepEqual(parseXStreamWebhook({ data: {
      event_type: "post.create", filter: { user_id: "u1" },
      payload: { ...payload.data, ...reference }, includes: payload.includes,
    } }, accounts), []);
  }
});

test("Activity account bindings are bounded numeric IDs mapped only to configured roster owners", () => {
  const roster = [...accounts, { handle: "TheCore", authorSlug: null, authorLabel: "CORE" }];
  const bindings = parseXActivityAccountBindings('{"12345":"crew:drew-wall","67890":"core"}', roster);
  assert.equal(bindings.get("12345")?.handle, "drewwall_");
  assert.equal(bindings.get("67890")?.authorSlug, null);
  assert.equal(parseXActivityAccountBindings(undefined, roster).size, 0);
  assert.equal(parseXActivityAccountBindings("{}", roster).size, 0);
  for (const invalid of ["not json", "[]", "null", '{"not-a-user-id":"crew:drew-wall"}',
    '{"12345":"crew:unknown"}', '{"12345":true}', '{"0":"core"}', '{"012345":"core"}', '{"12345":"crew:drew-wall","67890":"crew:drew-wall"}',
    JSON.stringify({ ["1".repeat(26)]: "crew:drew-wall" }), " ".repeat(20_001), " ".repeat(20_001) + "{}",
    JSON.stringify(Object.fromEntries(Array.from({ length: 257 }, (_, i) => [String(i + 1), "core"]))),
  ]) assert.throws(() => parseXActivityAccountBindings(invalid, roster), /invalid_x_activity_bindings/);
});

test("Activity without author expansions uses the provisioned ID binding and claims no avatar or verification", () => {
  const roster = [{ ...accounts[0]!, authorLabel: "Drew Wall · Lacy crew" }];
  const bindings = parseXActivityAccountBindings('{"12345":"crew:drew-wall"}', roster);
  const data = { event_type: "post.create", filter: { user_id: "12345" }, payload: { ...payload.data, author_id: "12345" } };
  const [item] = parseXStreamWebhook({ data }, roster, bindings);
  assert.equal(item?.authorSlug, "crew:drew-wall");
  assert.equal(item?.x?.authorName, "Drew Wall");
  assert.equal(item?.x?.authorHandle, "@drewwall_");
  assert.equal(item?.sourceUrl, "https://x.com/drewwall_/status/123456789");
  assert.equal(item?.x?.authorAvatarUrl, undefined);
  assert.equal(item?.x?.verified, undefined);
  assert.equal(item?.x?.verifiedType, undefined);
  const unrelatedExpansion = { users: [{ id: "99999", username: "someoneelse" }] };
  assert.equal(parseXStreamWebhook({ data: { ...data, includes: unrelatedExpansion } }, roster, bindings).length, 1);
  assert.throws(() => parseXStreamWebhook({ data }, roster));
  assert.throws(() => parseXStreamWebhook({ data: { ...data, tag: "crew:drew-wall" } }, roster));
  assert.throws(() => parseXStreamWebhook({ data: { ...data, filter: undefined } }, roster, bindings), /x_activity_author_mismatch/);
  assert.throws(() => parseXStreamWebhook({ data: { ...data, filter: { user_id: "99999" } } }, roster, bindings), /x_activity_author_mismatch/);
});

test("Activity author expansions must agree with the provisioned identity even when another author is on the roster", () => {
  const roster = [...accounts, { handle: "othercrew", authorSlug: "crew:other", authorLabel: "Other Crew" }];
  const bindings = parseXActivityAccountBindings('{"12345":"crew:drew-wall"}', roster);
  const data = { event_type: "post.create", filter: { user_id: "12345" }, payload: { ...payload.data, author_id: "12345" } };
  assert.throws(() => parseXStreamWebhook({ data: { ...data,
    includes: { users: [{ id: "12345", username: "othercrew" }] },
  } }, roster, bindings), /x_activity_binding_mismatch/);
  const author = { id: "12345", username: "DrewWall_", name: "Drew", verified: true };
  const [item] = parseXStreamWebhook({ data: { ...data, includes: { users: [author] } } }, roster, bindings);
  assert.equal(item?.authorSlug, "crew:drew-wall");
  assert.equal(item?.x?.authorName, "Drew");
  assert.equal(item?.x?.verified, true);
  assert.throws(() => parseXStreamWebhook({ data: { ...data, includes: { users: [author, author] } } }, roster, bindings), /x_activity_author_mismatch/);
});
