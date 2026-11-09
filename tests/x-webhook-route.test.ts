import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import type { FeedItem } from "../components/feed/types";
import * as webhook from "../lib/x-webhook";
import { canonicalSocialEventId } from "../lib/social-event-normalization";

const secret = "route-test-secret";
const accounts = [{ handle: "drewwall_", authorSlug: "crew:drew-wall", authorLabel: "Drew Wall" }];
const post = {
  data: { id: "123456789", author_id: "u1", text: "Crew update", created_at: "2026-11-08T12:00:00Z", attachments: { media_keys: ["photo1", "photo2"] } },
  includes: {
    users: [{ id: "u1", username: "drewwall_", name: "Drew Wall" }],
    media: [{ media_key: "photo1", type: "photo", url: "https://pbs.twimg.com/media/1.jpg" }, { media_key: "photo2", type: "photo", url: "https://pbs.twimg.com/media/2.jpg" }],
  },
};
const activityPost = {
  data: {
    event_type: "post.create",
    filter: { user_id: "1234567890123456789" },
    payload: {
      id: "2345678901234567890", author_id: "1234567890123456789",
      text: "An Activity post without user expansions", created_at: "2026-11-08T12:00:00Z",
    },
  },
};

function signedRequest(payload: unknown = post): Request {
  const raw = JSON.stringify(payload);
  return new Request("https://core.test/api/social/webhooks/x", {
    method: "POST", body: raw,
    headers: { "x-twitter-webhooks-signature-oauth2": `sha256=${createHmac("sha256", secret).update(raw).digest("base64")}` },
  });
}

function route(input: { configured?: boolean; fail?: "snapshot" | "event"; bindings?: string } = {}) {
  const filename = path.resolve("app/api/social/webhooks/x/route.ts");
  const module = { exports: {} as Record<"GET" | "POST", (request: Request) => Promise<Response>> };
  const calls: string[] = [];
  const persistedItems: FeedItem[] = [];
  const deferred: Array<() => Promise<void>> = [];
  const code = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports, URL, Buffer,
    process: { env: input.configured === false ? {} : {
      X_CLIENT_SECRET: secret,
      ...(input.bindings !== undefined ? { X_ACTIVITY_ACCOUNT_BINDINGS: input.bindings } : {}),
    } },
    require: (name: string) => {
      if (name === "next/server") return { NextResponse: { json: (body: unknown, init: ResponseInit) => Response.json(body, init) }, after: (fn: () => Promise<void>) => { deferred.push(fn); } };
      if (name === "@/lib/x-feed-upstream") return { configuredXFeedAccounts: () => accounts };
      if (name === "@/lib/x-webhook") return webhook;
      if (name === "@/lib/x-feed-snapshot") return { appendXFeedSnapshotItems: async (items: FeedItem[]) => {
        calls.push(`snapshot:${items.length}`); if (input.fail === "snapshot") throw new Error("database offline");
        persistedItems.push(...items);
      } };
      if (name === "@/lib/social-events") return {
        socialEventFromFeedItem: (item: FeedItem) => ({ canonicalId: canonicalSocialEventId(item) }),
        recordSocialEvent: async (event: { canonicalId: string }) => {
          calls.push(`event:${event.canonicalId}`); if (input.fail === "event") throw new Error("database offline");
        },
        upsertSocialSource: async (source: { memberSlug: string }) => { calls.push(`source:${source.memberSlug}`); },
      };
      if (name === "@/lib/social-delivery") return { drainSocialNotificationDeliveries: async () => { calls.push("deliver"); } };
      throw new Error(`Unexpected route dependency: ${name}`);
    },
  }, { filename });
  return { ...module.exports, calls, deferred, persistedItems };
}

test("X webhook route rejects unconfigured, unsigned and malformed requests before persistence", async () => {
  const missing = route({ configured: false });
  assert.equal((await missing.POST(signedRequest())).status, 503);
  assert.deepEqual(missing.calls, []);
  const unsigned = route();
  assert.equal((await unsigned.POST(new Request("https://core.test", { method: "POST", body: "{}" }))).status, 403);
  assert.deepEqual(unsigned.calls, []);
  const malformed = route();
  assert.equal((await malformed.POST(signedRequest({ data: null }))).status, 400);
  assert.deepEqual(malformed.calls, []);
});

test("X webhook route acknowledges durable canonical events before deferred outbound delivery", async () => {
  const handler = route();
  const response = await handler.POST(signedRequest());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { received: true, accepted: 1 });
  assert.deepEqual(handler.calls, ["snapshot:2", "event:x:123456789", "source:crew:drew-wall"]);
  assert.equal(handler.deferred.length, 1);
  await handler.deferred[0]!();
  assert.equal(handler.calls.at(-1), "deliver");
});

test("X webhook persistence failures request a provider retry and never start outbound delivery", async () => {
  for (const fail of ["snapshot", "event"] as const) {
    const handler = route({ fail });
    assert.equal((await handler.POST(signedRequest())).status, 503);
    assert.equal(handler.deferred.length, 0);
    assert.ok(!handler.calls.some((call) => call.startsWith("source:")));
    assert.ok(!handler.calls.includes("deliver"));
  }
});

test("X webhook CRC response stays uncached and returns only its challenge response", async () => {
  const handler = route();
  const response = await handler.GET(new Request("https://core.test/api/social/webhooks/x?crc_token=test-challenge"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(Object.keys(await response.json()), ["response_token"]);
  assert.equal((await handler.GET(new Request("https://core.test/api/social/webhooks/x"))).status, 400);
  assert.deepEqual(handler.calls, []);
});

test("signed Activity without user expansions persists through its provisioned numeric crew binding", async () => {
  const handler = route({ bindings: JSON.stringify({ "1234567890123456789": "crew:drew-wall" }) });
  const response = await handler.POST(signedRequest(activityPost));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true, accepted: 1 });
  assert.deepEqual(handler.calls, ["snapshot:1", "event:x:2345678901234567890", "source:crew:drew-wall"]);
  assert.equal(handler.persistedItems[0]?.authorSlug, "crew:drew-wall");
  assert.equal(handler.persistedItems[0]?.sourceUrl, "https://x.com/drewwall_/status/2345678901234567890");
  assert.equal(handler.persistedItems[0]?.x?.authorId, "1234567890123456789");
  assert.equal(handler.persistedItems[0]?.x?.authorAvatarUrl, undefined);
  assert.equal(handler.persistedItems[0]?.x?.verified, undefined);
  assert.equal(handler.deferred.length, 1);
});

test("signed Activity without user expansions or a provisioned binding is rejected before persistence", async () => {
  const handler = route();
  const response = await handler.POST(signedRequest(activityPost));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_x_stream_payload" });
  assert.deepEqual(handler.calls, []);
  assert.equal(handler.persistedItems.length, 0);
  assert.equal(handler.deferred.length, 0);
});

test("invalid Activity binding configuration returns retryable 503 before any write", async () => {
  for (const bindings of ["not-json", JSON.stringify({ "1234567890123456789": "crew:unknown" })]) {
    const handler = route({ bindings });
    const response = await handler.POST(signedRequest(activityPost));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "invalid_x_activity_configuration" });
    assert.deepEqual(handler.calls, []);
    assert.equal(handler.persistedItems.length, 0);
    assert.equal(handler.deferred.length, 0);
  }
});
