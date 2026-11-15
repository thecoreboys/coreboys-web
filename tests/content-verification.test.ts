import assert from "node:assert/strict";
import test from "node:test";
import {
  contentVerificationOutcome, contentVerificationTarget, createContentAvailabilityReconciler,
  type ContentVerificationCandidate, type ContentVerificationDependencies, type ContentVerificationOutcome,
} from "../lib/content-verification";

const instagram: ContentVerificationCandidate = { provider: "instagram", canonicalId: "instagram:18001234567890123", sourceUrl: "https://www.instagram.com/reel/AbCd_Ef12/?utm_source=ignored" };
const tiktok: ContentVerificationCandidate = { provider: "tiktok", canonicalId: "tiktok:7610123456789012345", sourceUrl: "https://www.tiktok.com/@FaZeAdapt/video/7610123456789012345" };

function response(body: unknown, status = "ok") {
  return { status, body, providerRequestMade: true, committedCredits: 1 };
}

test("only canonical provider object URLs can become one-credit metadata lookups", () => {
  const ig = contentVerificationTarget(instagram)!;
  assert.equal(ig.apiVersion, "v2");
  assert.equal(ig.endpoint, "/instagram/media/AbCd_Ef12");
  assert.equal(ig.providerId, "AbCd_Ef12");
  assert.equal(ig.sourceUrl, "https://www.instagram.com/p/AbCd_Ef12/");
  const tt = contentVerificationTarget(tiktok)!;
  assert.equal(tt.apiVersion, "v1");
  assert.equal(tt.providerId, "7610123456789012345");
  const query = new URL(`https://api.socialfetch.dev/v1${tt.endpoint}`);
  assert.deepEqual([...query.searchParams.keys()], ["url"]);
  assert.equal(query.searchParams.get("url"), "https://www.tiktok.com/@fazeadapt/video/7610123456789012345");
  for (const sourceUrl of [
    "http://www.instagram.com/p/AbCd_Ef12/", "https://instagram.com.evil.test/p/AbCd_Ef12/",
    "https://secret@instagram.com/p/AbCd_Ef12/", "https://instagram.com:8443/p/AbCd_Ef12/",
    "https://www.instagram.com/fazeadapt/", "https://www.instagram.com/share/AbCd_Ef12/",
    "https://www.instagram.com/p/AbCd_Ef12/comments", "https://127.0.0.1/p/AbCd_Ef12/",
  ]) assert.equal(contentVerificationTarget({ ...instagram, sourceUrl }), null, sourceUrl);
  assert.equal(contentVerificationTarget({ ...tiktok, sourceUrl: instagram.sourceUrl }), null);
});

test("documented successful object not_found is evidence; errors and incomplete lists are not", () => {
  assert.equal(contentVerificationOutcome(response({ success: true, data: { lookupStatus: "not_found", media: null } })), "not_found");
  assert.equal(contentVerificationOutcome(response({ data: { lookupStatus: "found" } })), "found");
  for (const body of [null, {}, [], { data: { posts: [] } }, { data: { videos: [] } },
    { data: { lookupStatus: "private" } }, { data: { lookupStatus: "deleted" } },
    { data: { lookupStatus: "NOT_FOUND" } }, { success: false, data: { lookupStatus: "not_found" } },
    { error: "temporarily unavailable", data: { lookupStatus: "not_found" } },
    { data: { dataError: "upstream unavailable", lookupStatus: "not_found" } },
  ]) assert.equal(contentVerificationOutcome(response(body)), "unknown");
  for (const status of ["not_found", "unauthorized", "rate_limited", "upstream_error", "invalid_response"]) {
    assert.equal(contentVerificationOutcome(response({ data: { lookupStatus: "not_found" } }, status)), "unknown");
  }
  assert.equal(contentVerificationOutcome({ ...response({ data: { lookupStatus: "not_found" } }), budgetDenied: true }), "unknown");
});

function dependencies(overrides: Partial<ContentVerificationDependencies> = {}) {
  let claimed = false;
  const lookups: string[] = [];
  const removals: string[] = [];
  const checks: Array<[string, ContentVerificationOutcome]> = [];
  let seeds = 0;
  const deps: ContentVerificationDependencies = {
    configured: () => true,
    claim: async () => { if (claimed) return null; claimed = true; return "owned-global-window"; },
    seed: async () => { seeds++; },
    due: async (limit) => { assert.equal(limit, 2); return [instagram, tiktok]; },
    lookup: async (target) => { lookups.push(target.canonicalId); return response({ data: { lookupStatus: target.provider === "instagram" ? "not_found" : "found" } }); },
    remove: async (target) => { removals.push(target.canonicalId); },
    checked: async (candidate, outcome) => { checks.push([candidate.canonicalId, outcome]); },
    release: async () => undefined,
    ...overrides,
  };
  return { deps, lookups, removals, checks, seeds: () => seeds };
}

test("overlapping schedulers share one bounded window and record found checks as well as removals", async () => {
  const fixture = dependencies();
  const a = createContentAvailabilityReconciler(fixture.deps);
  const b = createContentAvailabilityReconciler(fixture.deps);
  const results = await Promise.all([a(), b(), b()]);
  assert.deepEqual(results.map((r) => r.status).sort(), ["completed", "not_due", "not_due"]);
  assert.equal(fixture.lookups.length, 2);
  assert.equal(fixture.seeds(), 1);
  assert.deepEqual(fixture.removals, [instagram.canonicalId]);
  assert.deepEqual(fixture.checks, [[instagram.canonicalId, "not_found"], [tiktok.canonicalId, "found"]]);
  assert.equal(results.reduce((sum, r) => sum + r.committedCredits, 0), 2);
});

test("the hard two-object limit cannot be expanded by a buggy candidate query", async () => {
  const fixture = dependencies({ due: async () => Array.from({ length: 50 }, (_, i) => ({ ...instagram, canonicalId: `instagram:${i}` })) });
  const result = await createContentAvailabilityReconciler(fixture.deps)();
  assert.equal(result.checked, 2);
  assert.equal(fixture.lookups.length, 2);
});

test("unknown responses and lookup failures do not remove persisted content", async () => {
  const fixture = dependencies({ lookup: async (target) => {
    if (target.provider === "instagram") throw Error("temporary outage");
    return response({ data: { lookupStatus: "not_found" } }, "rate_limited");
  } });
  const result = await createContentAvailabilityReconciler(fixture.deps)();
  assert.equal(result.removed, 0);
  assert.equal(result.unknown, 2);
  assert.deepEqual(fixture.removals, []);
  assert.deepEqual(fixture.checks.map((r) => r[1]), ["unknown", "unknown"]);
});

test("invalid URLs, missing configuration and unavailable leases cannot spend", async () => {
  const invalid = dependencies({ due: async () => [{ ...instagram, sourceUrl: "https://example.com/p/AbCd_Ef12/" }] });
  assert.equal((await createContentAvailabilityReconciler(invalid.deps)()).unknown, 1);
  assert.deepEqual(invalid.lookups, []);
  const disabled = dependencies({ configured: () => false });
  assert.equal((await createContentAvailabilityReconciler(disabled.deps)()).status, "disabled");
  assert.deepEqual(disabled.lookups, []);
  const unavailable = dependencies({ claim: async () => { throw Error("database unavailable"); } });
  assert.equal((await createContentAvailabilityReconciler(unavailable.deps)()).status, "failed");
  assert.deepEqual(unavailable.lookups, []);
});
