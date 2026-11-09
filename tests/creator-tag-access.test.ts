import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { z } from "zod";
import { AssetKey, matchCreatorText } from "../lib/creator-tags/model";
import { defaultCreatorDirectory } from "../lib/creator-tags/directory";

const nextServer = { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } };
function load<T>(path: string, imports: Record<string, unknown>): T {
  const source = transpileModule(readFileSync(resolve(path), "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } }).outputText;
  const api = {};
  vm.runInNewContext(`(function(exports,require){${source}\n})`, {
    URL, Buffer, console, process,
    // Any accidental external/model request fails the test rather than making a network call.
    fetch: () => { throw new Error("External requests are forbidden in creator lookup"); },
  })(api, (id: string) => {
    if (id === "server-only") return {};
    if (id === "next/server") return nextServer;
    if (id in imports) return imports[id];
    throw new Error(`Unexpected creator-tag dependency: ${id}`);
  });
  return api as T;
}
type Gate = { ok: true; subject: string } | { ok: false; response: Response };
type Access = { requireCreatorTagAccess(request: Request): Promise<Gate> };
type Route = { GET(request: Request): Promise<Response>; POST(request: Request): Promise<Response> };
const request = (path = "", body?: unknown) => new Request(`https://thecoreboys.com/api/watch/creator-tags${path}`, body === undefined ? {} : {
  method: "POST", headers: { origin: "https://thecoreboys.com", "Content-Type": "application/json" }, body: JSON.stringify(body),
});

test("creator access fails closed for signed-out, Free, expired and unavailable accounts", async () => {
  class Denied extends Error {}
  for (const mode of ["signed-out", "free", "expired", "unavailable", "member"]) {
    let checks = 0;
    const access = load<Access>("lib/creator-tags/access.ts", {
      "@/lib/fan-auth": { getCurrentFanUserId: async () => mode === "signed-out" ? null : "fixture-user" },
      "@/lib/subscriptions/entitlements": {
        EntitlementDeniedError: Denied,
        requireAccountEntitlement: async (input: { featureId: string; requestHostname: string }) => {
          checks++;
          assert.equal(input.featureId, "player.creator_tags");
          assert.equal(input.requestHostname, "thecoreboys.com");
          if (mode === "free" || mode === "expired") throw new Denied();
          if (mode === "unavailable") throw new Error("database offline");
        },
      },
    });
    const result = await access.requireCreatorTagAccess(request());
    if (mode === "member") { assert.ok(result.ok); assert.equal(result.subject, "fan:fixture-user"); }
    else {
      assert.ok(!result.ok);
      assert.equal(result.response.status, mode === "signed-out" ? 401 : mode === "unavailable" ? 503 : 403);
      assert.equal(result.response.headers.get("cache-control"), "private, no-store");
      assert.equal(result.response.headers.get("vary"), "Cookie");
    }
    assert.equal(checks, mode === "signed-out" ? 0 : 1);
  }
});

function routes(allowed: boolean) {
  let reads = 0, writes = 0;
  const http = load<Record<string, unknown>>("lib/creator-tags/http.ts", {});
  const common = {
    zod: { z },
    "@/lib/creator-tags/http": http,
    "@/lib/creator-tags/access": { requireCreatorTagAccess: async (): Promise<Gate> => allowed
      ? { ok: true, subject: "fan:fixture" }
      : { ok: false, response: Response.json({ code: "plan_required" }, { status: 403, headers: { "Cache-Control": "private, no-store" } }) } },
    "@/lib/creator-tags/model": { AssetKey, matchCreatorText },
    "@/lib/creator-tags/directory": { defaultCreatorDirectory },
    "@/lib/redis": { redisIncrWithExpiry: async () => 1 },
    "@/lib/creator-tags/store": {
      publicCreatorTags: async () => { reads++; return { creators: defaultCreatorDirectory(), tags: [], mentions: [] }; },
      creatorDirectory: async () => { reads++; return defaultCreatorDirectory(); },
      submitCreatorAnnotation: async (_input: unknown, subject: string) => { writes++; assert.equal(subject, "fan:fixture"); return { status: "draft" }; },
    },
  };
  return { tags: load<Route>("app/api/watch/creator-tags/route.ts", common), search: load<Route>("app/api/watch/creator-tags/search/route.ts", common),
    suggest: load<Route>("app/api/watch/creator-tags/suggest/route.ts", common), counts: () => ({ reads, writes }) };
}
test("all viewer routes enforce membership before loading profiles or writing tags", async () => {
  const api = routes(false);
  assert.equal((await api.tags.GET(request("?assetKey=youtube:test"))).status, 403);
  assert.equal((await api.search.POST(request("/search", { text: "adinross" }))).status, 403);
  assert.equal((await api.suggest.POST(request("/suggest", {}))).status, 403);
  assert.deepEqual(api.counts(), { reads: 0, writes: 0 });
});
test("member lookup uses verified text only; image payloads cannot invoke models", async () => {
  const api = routes(true);
  const image = await api.search.POST(request("/search", { image: "data:image/jpeg;base64,YQ==" }));
  assert.equal(image.status, 400);
  assert.deepEqual(api.counts(), { reads: 0, writes: 0 });
  const text = await api.search.POST(request("/search", { text: "KICK.COM/ADINROSS" }));
  assert.equal(text.status, 200);
  const value = await text.json();
  assert.equal(value.matchedBy, "written-text");
  assert.equal(value.creators[0].id, "adin-ross");
  const tags = await api.tags.GET(request("?assetKey=youtube:test"));
  assert.equal(tags.status, 200);
  assert.equal(tags.headers.get("cache-control"), "private, no-store");
  assert.equal(tags.headers.get("vary"), "Cookie");
  const suggestion = await api.suggest.POST(request("/suggest", { creatorId: "adin-ross" }));
  assert.equal((await suggestion.json()).result.status, "draft");
  assert.deepEqual(api.counts(), { reads: 2, writes: 1 });
});
