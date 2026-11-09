import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";
import type { WatchCatalog, WatchItem } from "../lib/watch/types";

const requireModule = createRequire(resolve(process.cwd(), "package.json"));

// Exercise real route handlers/response headers with controlled network and
// account boundaries, without opening a database or provider connection.
function route<T>(path: string, dependencies: Record<string, unknown>): T {
  const saved = new Map<string, NodeJS.Module | undefined>();
  const routePath = requireModule.resolve(path);
  for (const [name, exports] of Object.entries(dependencies)) {
    const key = requireModule.resolve(name);
    saved.set(key, requireModule.cache[key]);
    requireModule.cache[key] = { id: key, filename: key, loaded: true, exports } as NodeJS.Module;
  }
  saved.set(routePath, requireModule.cache[routePath]);
  delete requireModule.cache[routePath];
  try {
    return requireModule(path) as T;
  } finally {
    for (const [key, previous] of saved) {
      if (previous) requireModule.cache[key] = previous;
      else delete requireModule.cache[key];
    }
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function video(id: string, memberSlug: string): WatchItem {
  return {
    id, kind: "youtube", platform: "youtube", title: id,
    href: `/theater?kind=youtube&id=${id}`, sourceUrl: `https://www.youtube.com/watch?v=${id}`,
    memberSlug, memberLabel: memberSlug, poster: "/poster.jpg", backdrop: "/poster.jpg", accent: "#fff",
    format: "long", durationSeconds: 600,
  };
}

test("queue starts private viewer reads during a cold catalog and keeps recommendations isolated", async () => {
  const pendingCatalog = deferred<WatchCatalog>();
  const events: string[] = [];
  let viewer = "ron";
  const handlers = route<{ GET: (request: Request) => Promise<Response> }>("./app/api/watch/queue/route", {
    "./lib/watch/catalog": { getWatchCatalog: () => { events.push("catalog"); return pendingCatalog.promise; } },
    "./lib/fan-auth": { getCurrentFanUserId: async () => { events.push("viewer"); return viewer; } },
    "./lib/watch/progress": { listProgress: async () => { events.push("progress"); return []; } },
    "./lib/db": { query: async (_sql: string, values: string[]) => ({ rows: [{ favorite_member: values[0] }] }) },
    "./lib/watch/feedback": { listWatchFeedback: async () => [] },
  });
  const pending = handlers.GET(new Request("https://example.test/api/watch/queue"));
  await new Promise<void>((done) => setImmediate(done));
  assert.deepEqual(events, ["catalog", "viewer", "progress"], "account reads must not wait for the catalog");
  pendingCatalog.resolve({ all: [video("adapt_video", "adapt"), video("ron_video", "ron")] } as WatchCatalog);
  const first = await pending;
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("Cache-Control"), "private, no-store");
  assert.equal((await first.json()).items[0].memberSlug, "ron");

  viewer = "adapt";
  const second = await handlers.GET(new Request("https://example.test/api/watch/queue"));
  assert.equal((await second.json()).items[0].memberSlug, "adapt", "shared catalog must not share viewer preferences");
  assert.equal(second.headers.get("Cache-Control"), "private, no-store");
});

test("queue catalog failure remains retryable and is never a cacheable empty success", async () => {
  const handlers = route<{ GET: (request: Request) => Promise<Response> }>("./app/api/watch/queue/route", {
    "./lib/watch/catalog": { getWatchCatalog: async () => { throw new Error("unavailable"); } },
    "./lib/fan-auth": { getCurrentFanUserId: async () => null },
    "./lib/watch/progress": { listProgress: async () => [] },
    "./lib/db": { query: async () => ({ rows: [] }) },
    "./lib/watch/feedback": { listWatchFeedback: async () => [] },
  });
  const response = await handlers.GET(new Request("https://example.test/api/watch/queue"));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
});

test("search overlaps private progress with catalog loading and retains watch-state filtering", async () => {
  const pendingCatalog = deferred<WatchCatalog>();
  const events: string[] = [];
  const handlers = route<{ GET: (request: Request) => Promise<Response> }>("./app/api/watch/search/route", {
    "./lib/watch/catalog": { getWatchCatalog: () => { events.push("catalog"); return pendingCatalog.promise; } },
    "./lib/fan-auth": { getCurrentFanUserId: async () => { events.push("viewer"); return "viewer"; } },
    "./lib/watch/progress": { listProgress: async () => {
      events.push("progress");
      return [{ ref: "youtube:watched_video", progress: 1, completed: true }];
    } },
    "./lib/subscriptions/entitlements": {
      getAccountSubscriptionState: async () => ({}),
      entitlementDecision: () => ({ allowed: false }),
    },
    "./lib/media-intelligence/postgres-store": { getMediaIntelligenceStore: () => { throw new Error("basic search does not use index"); } },
    "./lib/media-intelligence/search": { searchMedia: async () => { throw new Error("basic search does not use index"); } },
  });
  const { NextRequest } = requireModule("next/server");
  const pending = handlers.GET(new NextRequest("https://example.test/api/watch/search?watchState=watched"));
  await new Promise<void>((done) => setImmediate(done));
  assert.deepEqual(events, ["viewer", "catalog", "progress"]);
  pendingCatalog.resolve({ all: [video("watched_video", "ron"), video("unwatched_video", "ron")] } as WatchCatalog);
  const response = await pending;
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.headers.get("Vary"), "Cookie");
  const body = await response.json();
  assert.deepEqual(body.results.map((entry: { item: WatchItem }) => entry.item.id), ["watched_video"]);
  assert.equal(body.filters.progressByRef, undefined, "raw account history must not enter the response contract");
});

test("Guide loads catalog/history before Twitch directory finishes and retries failed catalog reads", async (context) => {
  const originalClientId = process.env.TWITCH_CLIENT_ID;
  const originalYoutubeKey = process.env.YOUTUBE_API_KEY;
  delete process.env.TWITCH_CLIENT_ID;
  delete process.env.YOUTUBE_API_KEY;
  context.after(() => {
    if (originalClientId === undefined) delete process.env.TWITCH_CLIENT_ID;
    else process.env.TWITCH_CLIENT_ID = originalClientId;
    if (originalYoutubeKey === undefined) delete process.env.YOUTUBE_API_KEY;
    else process.env.YOUTUBE_API_KEY = originalYoutubeKey;
  });
  const directory = deferred<Record<string, { id: string }>>();
  const events: string[] = [];
  let catalogReads = 0;
  const handlers = route<{ GET: (request: Request) => Promise<Response> }>("./app/api/watch/guide/route", {
    "./lib/twitch": { fetchUsersByLogin: () => { events.push("directory"); return directory.promise; } },
    "./lib/social-feed": { resolveYouTubeChannelId: async () => null },
    "./lib/db": { query: async () => { events.push("sessions"); return { rows: [] }; } },
    "./lib/watch/channels": { buildGuideNetworkRows: () => [] },
    "./lib/watch/catalog": { getWatchCatalog: async () => {
      events.push("catalog");
      catalogReads++;
      if (catalogReads === 1) throw new Error("temporary catalog failure");
      return { all: [{ ...video(`recovered_${catalogReads}`, "ron"), publishedAt: new Date().toISOString() }] };
    } },
  });
  const request = new Request("https://example.test/api/watch/guide");
  const firstPending = handlers.GET(request);
  await new Promise<void>((done) => setImmediate(done));
  assert.deepEqual(events, ["directory", "sessions", "catalog"]);
  directory.resolve({});
  const first = await firstPending;
  assert.deepEqual((await first.json()).programs, []);

  const second = await handlers.GET(request);
  assert.equal((await second.json()).programs[0].id, "catalog-recovered_2");
  const third = await handlers.GET(request);
  assert.equal((await third.json()).programs[0].id, "catalog-recovered_3");
  assert.equal(catalogReads, 3, "Guide must follow the shared catalog freshness instead of holding another five-minute snapshot");
});
