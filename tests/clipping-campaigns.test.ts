import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { CAMPAIGN_SEEDS } from "../lib/campaigns/seeds";
import * as schedule from "../lib/campaigns/schedule";
import * as validation from "../lib/campaigns/validation";
import * as types from "../lib/campaigns/types";
import type { Campaign, CampaignInput } from "../lib/campaigns/types";

const start = "2026-11-09T00:00:00.000Z";
const end = "2026-11-16T00:00:00.000Z";
const now = Date.parse("2026-11-10T12:00:00Z");
const firstSeed = CAMPAIGN_SEEDS[0];
assert.ok(firstSeed, "A campaign seed is required for these fixtures");
const { id: seedId, ...seed } = firstSeed;
const input = (overrides: Partial<CampaignInput> = {}): CampaignInput => ({ ...seed, displayStartsAt: start, displayEndsAt: end, status: "published", ...overrides });
const campaign = (overrides: Partial<Campaign> = {}): Campaign => ({ ...input(), id: seedId, revision: 1, updatedAt: start, ...overrides });

test("five supplied campaigns use the owner's 30-day website windows without inventing organizer closing dates", () => {
  assert.equal(CAMPAIGN_SEEDS.length, 5);
  assert.equal(new Set(CAMPAIGN_SEEDS.map((seed) => seed.campaignUrl)).size, 5);
  for (const { id, ...seed } of CAMPAIGN_SEEDS) {
    assert.ok(validation.campaignInputSchema.safeParse(seed).success, id);
    assert.equal(seed.status, "published");
    assert.equal(seed.campaignEndsAt, null);
    assert.equal(seed.displayStartsAt, seed.campaignStartsAt);
    assert.equal(Date.parse(seed.displayEndsAt!) - Date.parse(seed.displayStartsAt!), 30 * 86_400_000);
    assert.equal(schedule.campaignIsInWindow(seed, now), true);
  }
  assert.equal(CAMPAIGN_SEEDS[1]?.rateCents, 135);
  assert.equal(CAMPAIGN_SEEDS[2]?.budgetCents, 2_500_000);
});

test("display starts inclusively and ends exclusively, even on an already-open page", () => {
  const ad = input();
  assert.equal(schedule.campaignIsInWindow(ad, Date.parse(start) - 1), false);
  assert.equal(schedule.campaignIsInWindow(ad, Date.parse(start)), true);
  assert.equal(schedule.campaignIsInWindow(ad, Date.parse(end) - 1), true);
  assert.equal(schedule.campaignIsInWindow(ad, Date.parse(end)), false);
  assert.equal(schedule.nextCampaignBoundary([ad], Date.parse(end) - 1), Date.parse(end));
  assert.equal(schedule.nextCampaignBoundary([ad], Date.parse(end)), null);
});

test("organizer dates override a wider website window and malformed schedules fail closed", () => {
  const closing = "2026-11-12T06:00:00.000Z";
  const ad = input({ campaignStartsAt: "2026-11-10T18:00:00.000Z", campaignEndsAt: closing });
  assert.equal(schedule.campaignIsInWindow(ad, now), false);
  assert.equal(schedule.campaignIsInWindow(ad, Date.parse("2026-11-11T00:00:00Z")), true);
  assert.equal(schedule.campaignIsInWindow(ad, Date.parse(closing)), false);
  for (const overrides of [{ displayEndsAt: null }, { displayStartsAt: "invalid" }, { campaignEndsAt: "invalid" }, { displayEndsAt: start }]) {
    assert.equal(schedule.campaignIsInWindow(input(overrides), now), false);
  }
});

test("only published, current ads for the requested placement enter public cards", () => {
  const ads = [campaign(), campaign({ id: "draft", status: "draft" }), campaign({ id: "archive", status: "archived" }), campaign({ id: "clips-only", placements: ["clips"] }), campaign({ id: "expired", displayEndsAt: "2026-11-10T00:00:00Z" }), campaign({ id: "future", displayStartsAt: "2026-11-11T00:00:00Z" })];
  const cards = schedule.selectCampaigns(ads, "home", now);
  assert.deepEqual(cards.map((ad) => ad.id), [seedId]);
  const card = cards[0];
  assert.ok(card);
  assert.equal("status" in card, false);
  assert.equal("revision" in card, false);
  assert.equal("updatedAt" in card, false);
  assert.equal(schedule.selectCampaigns(ads, "clips", now).length, 2);
  const expired = ads[4], future = ads[5];
  assert.ok(expired);
  assert.ok(future);
  assert.equal(schedule.campaignState(expired, now), "expired");
  assert.equal(schedule.campaignState(future, now), "scheduled");
});

test("publish validation requires dates, placements and the correct reward model", () => {
  assert.ok(validation.campaignInputSchema.safeParse(input()).success);
  for (const overrides of [{ displayEndsAt: null }, { displayStartsAt: null }, { placements: [] }, { displayEndsAt: start }, { campaignEndsAt: "2026-11-12T00:00:00Z" }, { rateCents: null }, { rewardType: "pool" as const, rateCents: 100 }, { budgetCents: -1 }]) {
    assert.equal(validation.campaignInputSchema.safeParse(input(overrides)).success, false, JSON.stringify(overrides));
  }
  assert.ok(validation.campaignInputSchema.safeParse(input({ status: "draft", displayStartsAt: null, displayEndsAt: null })).success);
});

test("campaign links reject lookalike domains, unsafe protocols, credentials and query redirects", () => {
  for (const link of [`http://contentrewards.com/c/campaigns/${seedId}`, `https://contentrewards.com.evil.test/c/campaigns/${seedId}`, `https://contentrewards.com@evil.test/c/campaigns/${seedId}`, `https://user:pass@contentrewards.com/c/campaigns/${seedId}`, `${seed.campaignUrl}?redirect=https://evil.test`, "javascript:alert(1)"]) assert.equal(validation.campaignUrlSchema.safeParse(link).success, false, link);
  assert.equal(validation.campaignUrlSchema.parse(seed.campaignUrl + "/"), seed.campaignUrl);
  assert.equal(validation.campaignUrlSchema.parse(seed.campaignUrl.toUpperCase()), seed.campaignUrl);
  for (const url of ["//evil.test/a.jpg", "/../private/a.png", "/campaigns/../../a.jpg", "data:image/svg+xml,<svg>", "http://localhost/a.jpg"]) assert.equal(validation.campaignImageSchema.safeParse(url).success, false, url);
  assert.ok(validation.campaignImageSchema.safeParse(seed.imageUrl).success);
});

function loadRoute<Method extends string>(file: string, deps: Record<string, unknown>) {
  const mod = { exports: {} as Record<Method, (request?: Request) => Promise<Response>> };
  const code = ts.transpileModule(readFileSync(resolve(file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module: mod, exports: mod.exports, URL, Date, Number, JSON, require: (name: string) => {
    if (name === "next/server") return { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } };
    if (name in deps) return deps[name];
    throw new Error(`Unexpected dependency ${name}`);
  } });
  return mod.exports;
}

function adminRoute(options: { authenticated?: boolean; sameOrigin?: boolean; conflict?: boolean; duplicate?: boolean } = {}) {
  const calls: string[] = [];
  const route = loadRoute<"GET" | "POST" | "PATCH">("app/api/admin/campaigns/route.ts", {
    "@/lib/admin-api": { requireAdmin: async () => { calls.push("auth"); return options.authenticated === false ? { ok: false, response: Response.json({ error: "unauthorized" }, { status: 401 }) } : { ok: true, id: "staff-id" }; } },
    "@/lib/x/security": { requestHasSameOrigin: () => { calls.push("origin"); return options.sameOrigin !== false; } },
    "@/lib/campaigns/validation": validation,
    "@/lib/campaigns/store": {
      getAdminCampaigns: async () => { calls.push("list"); return [campaign()]; },
      saveCampaign: async (body: CampaignInput, staff: string, id?: string, revision?: number) => {
        calls.push(`save:${staff}:${id ?? "new"}:${revision ?? "new"}`);
        if (options.duplicate) throw { code: "23505" };
        return options.conflict ? null : campaign({ ...body });
      },
    },
  });
  return { ...route, calls };
}
const request = (body: unknown, method = "POST") => new Request("https://core.test/api/admin/campaigns", { method, headers: { "Content-Type": "application/json", Origin: "https://core.test" }, body: JSON.stringify(body) });

test("admin reads and writes authorize before touching the campaign store", async () => {
  const read = adminRoute({ authenticated: false });
  assert.equal((await read.GET()).status, 401);
  assert.deepEqual(read.calls, ["auth"]);
  const write = adminRoute({ authenticated: false });
  assert.equal((await write.POST(request({ campaign: input() }))).status, 401);
  assert.deepEqual(write.calls, ["auth"]);
  const crossOrigin = adminRoute({ sameOrigin: false });
  assert.equal((await crossOrigin.POST(request({ campaign: input() }))).status, 403);
  assert.deepEqual(crossOrigin.calls, ["auth", "origin"]);
});

test("invalid publication cannot save; edits require revision; conflicts and duplicate URLs return 409", async () => {
  const invalid = adminRoute();
  const bad = await invalid.POST(request({ campaign: input({ displayEndsAt: null }) }));
  assert.equal(bad.status, 400);
  assert.deepEqual(invalid.calls, ["auth", "origin"]);
  assert.ok((await bad.json()).issues.some((issue: { field: string }) => issue.field === "campaign.displayEndsAt"));
  const create = adminRoute();
  const saved = await create.POST(request({ campaign: input({ title: "Edited title" }) }));
  assert.equal(saved.status, 201);
  assert.equal((await saved.json()).campaign.title, "Edited title");
  assert.match(saved.headers.get("cache-control")!, /no-store/);
  const missingRevision = adminRoute();
  assert.equal((await missingRevision.PATCH(request({ id: seedId, campaign: input() }, "PATCH"))).status, 400);
  const conflict = adminRoute({ conflict: true });
  assert.equal((await conflict.PATCH(request({ id: seedId, revision: 1, campaign: input() }, "PATCH"))).status, 409);
  assert.equal((await adminRoute({ duplicate: true }).POST(request({ campaign: input() }))).status, 409);
});

test("public feed is uncached, placement validated, and removes anything that expired during the read", async () => {
  let calls = 0;
  const expired = campaign({ displayStartsAt: "2020-01-01T00:00:00Z", displayEndsAt: "2020-01-02T00:00:00Z" });
  const route = loadRoute<"GET">("app/api/campaigns/route.ts", { "@/lib/campaigns/store": { getPublicCampaigns: async () => { calls++; return [expired]; } }, "@/lib/campaigns/schedule": schedule, "@/lib/campaigns/types": types });
  assert.equal((await route.GET(new Request("https://core.test/api/campaigns?placement=other"))).status, 400);
  assert.equal(calls, 0);
  const response = await route.GET(new Request("https://core.test/api/campaigns?placement=home"));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control")!, /no-store/);
  assert.deepEqual((await response.json()).campaigns, []);
});
