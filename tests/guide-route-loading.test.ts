import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { buildGuideNetworkRows } from "../lib/watch/channels";
import { guideLiveCatalog } from "../lib/watch/guide-live-catalog";
import { removeActiveTwitchArchiveDuplicates } from "../lib/watch/guide-programs";
import { guideSourceWithDeadline, createGuideSourceCache } from "../lib/watch/guide-source-deadline";
import { packGuidePayload, unpackGuidePayload, type CompactGuidePayload } from "../lib/watch/guide-transport";
import { GUIDE_MAX_WINDOW_MS, projectGuideWindow } from "../lib/watch/guide-window";
import { guideRefreshInterval, type GuidePayload } from "../lib/watch/guide-response";
import type { WatchCatalog, WatchItem } from "../lib/watch/types";

function catalog(id: string): WatchCatalog {
  const item: WatchItem = {
    id, kind: "youtube", platform: "youtube", title: `Episode ${id}`,
    poster: "/poster.jpg", backdrop: "/poster.jpg", memberSlug: null, memberLabel: "CORE", accent: "#db0368",
    href: `/theater?kind=youtube&id=${id}`, sourceUrl: `https://youtube.com/watch?v=${id}`,
    publishedAt: new Date(Date.now() - 60_000).toISOString(), durationSeconds: 1800,
  };
  return { all: [item], live: [], house: [item], videos: [item], shorts: [], broadcasts: [], clips: [],
    byMember: [], programmingSections: [], heroFeatured: [], fetchedAt: new Date().toISOString(),
  } as unknown as WatchCatalog;
}

function fixture(options: { archive: () => Promise<WatchCatalog>; recent?: () => Promise<WatchCatalog>; sessions?: () => Promise<{ rows: unknown[] }> }) {
  const background: Array<() => Promise<void>> = [];
  const dependencies: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) }, after: (work: () => Promise<void>) => { background.push(work); } },
    "@/lib/group": { GROUP: { name: "CORE", socials: { youtube: {} } } },
    "@/lib/members": { MEMBERS: [] },
    "@/lib/db": { query: options.sessions ?? (async () => ({ rows: [] })) },
    "@/lib/social-feed": { resolveYouTubeChannelId: async () => null },
    "@/lib/twitch": { fetchUsersByLogin: async () => ({}) },
    "@/lib/watch/catalog": { getWatchCatalog: options.archive, getHomeWatchCatalog: options.recent ?? (async () => catalog("recent")) },
    "@/lib/watch/channels": { buildGuideNetworkRows },
    "@/lib/watch/guide-live-catalog": { guideLiveCatalog },
    "@/lib/watch/guide-programs": { removeActiveTwitchArchiveDuplicates },
    "@/lib/watch/guide-transport": { packGuidePayload },
    "@/lib/watch/guide-window": { GUIDE_MAX_WINDOW_MS, projectGuideWindow },
    "@/lib/watch/guide-source-deadline": {
      guideSourceWithDeadline: <T,>(work: Promise<T>, fallback: T) => guideSourceWithDeadline(work, fallback, 10),
      createGuideSourceCache: <T extends { state: string },>(freshMs: number) => {
        const source = createGuideSourceCache<T>(freshMs);
        return (load: () => Promise<T>, fallback: T, _timeout: number, loading: T) => source(load, fallback, 10, loading);
      },
    },
  };
  const filename = resolve("app/api/watch/guide/route.ts");
  const compiled = { exports: {} as { GET: (request: Request) => Promise<Response> } };
  const code = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    module: compiled, exports: compiled.exports, URL, URLSearchParams, Date, AbortSignal, process: { env: {} },
    require: (id: string) => { assert.ok(id in dependencies, `Unexpected dependency: ${id}`); return dependencies[id]; },
  }, { filename });
  function request(compact = false) {
    const now = Date.now();
    return new Request(`https://core.test/api/watch/guide?start=${now - 3_600_000}&end=${now + 6 * 3_600_000}`, {
      headers: compact ? { "X-CORE-Guide-Format": "compact-v1" } : {},
    });
  }
  return { GET: compiled.exports.GET, request, background };
}

test("a cold archive serves recent programs promptly and upgrades after background completion", async () => {
  let finish!: (value: WatchCatalog) => void;
  const archive = new Promise<WatchCatalog>((resolve) => { finish = resolve; });
  const f = fixture({ archive: () => archive });
  const first = await f.GET(f.request(true));
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("cache-control"), "no-store");
  const pending = unpackGuidePayload(await first.json() as CompactGuidePayload);
  assert.equal(pending.partial, true);
  assert.equal(pending.sources?.catalog, "loading");
  assert.ok(pending.programs.some((program) => program.watchItem?.id === "recent"));
  assert.equal(guideRefreshInterval(pending), 5_000);
  assert.equal(f.background.length, 1);
  finish(catalog("archive"));
  await f.background[0]!();
  const second = await f.GET(f.request());
  const complete = await second.json() as GuidePayload;
  assert.equal(complete.partial, undefined);
  assert.equal(complete.sources?.catalog, "ok");
  assert.ok(complete.programs.some((program) => program.watchItem?.id === "archive"));
  assert.equal(guideRefreshInterval(complete), 60_000);
});

test("slow broadcast history is pending rather than failed and is reused on the next request", async () => {
  let finish!: (value: { rows: unknown[] }) => void;
  let reads = 0;
  const sessions = new Promise<{ rows: unknown[] }>((resolve) => { finish = resolve; });
  const f = fixture({ archive: async () => catalog("archive"), sessions: () => { reads += 1; return sessions; } });
  const first = await (await f.GET(f.request())).json() as GuidePayload;
  assert.equal(first.sources?.recordedSessions, "loading");
  assert.ok(first.programs.length > 0);
  finish({ rows: [] });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const second = await (await f.GET(f.request())).json() as GuidePayload;
  assert.equal(second.sources?.recordedSessions, "ok");
  assert.equal(reads, 1, "polling must not repeat the history query");
});

test("an actual archive outage retains recent channels and uses normal retry timing", async () => {
  const f = fixture({ archive: async () => { throw new Error("archive offline"); } });
  const response = await f.GET(f.request());
  const data = await response.json() as GuidePayload;
  assert.equal(response.status, 200);
  assert.equal(data.sources?.catalog, "error");
  assert.ok(data.programs.length > 0);
  assert.equal(guideRefreshInterval(data), 60_000);
});

test("a complete catalog outage rejects without caching an empty schedule", async () => {
  const fail = async (): Promise<WatchCatalog> => { throw new Error("offline"); };
  const f = fixture({ archive: fail, recent: fail });
  const response = await f.GET(f.request());
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("invalid windows are rejected before any archive work starts", async () => {
  let reads = 0;
  const f = fixture({ archive: async () => { reads += 1; return catalog("archive"); } });
  const response = await f.GET(new Request("https://core.test/api/watch/guide?start=invalid&end=20"));
  assert.equal(response.status, 400);
  assert.equal(reads, 0);
});
