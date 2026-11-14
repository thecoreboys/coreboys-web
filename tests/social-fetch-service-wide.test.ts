import assert from "node:assert/strict";
import test from "node:test";
import { fetchSocialCountFromApi } from "../lib/social-fetch";
import { socialFetchBudgetAdapter } from "../lib/social-fetch-budget";
import { requestSocialFetchJson, setSocialFetchBudgetAdapterForTests } from "../lib/social-fetch-media";
import { setSocialFetchRequestStoreForTests } from "../lib/social-fetch-request-cache";
import { createTestSocialFetchRequestStore } from "./helpers/social-fetch-request-store";

test("current ingestion, backfill, and repeated checks reuse one global result without a second charge", async () => {
  const previousKey = process.env.SOCIAL_FETCH_API_KEY;
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  let reservations = 0;
  let settlements = 0;
  process.env.SOCIAL_FETCH_API_KEY = "service-wide-test-key";
  setSocialFetchRequestStoreForTests(createTestSocialFetchRequestStore().store);
  setSocialFetchBudgetAdapterForTests({
    reserve: async () => ({ ok: true, reservationId: `reservation-${++reservations}`, reservedCredits: 1,
      monthCreditsAfterReservation: reservations, monthlyCreditCap: 100 }),
    settle: async () => { settlements++; },
  });
  globalThis.fetch = (async (input) => {
    requests.push(String(input));
    return Response.json({ data: { lookupStatus: "not_found" }, meta: { creditsCharged: 1 } }, { status: 404 });
  }) as typeof fetch;
  try {
    const first = await requestSocialFetchJson("/instagram/media/AbCdE", 7_200, { apiVersion: "v2", feature: "deletion_check" });
    const cached = await requestSocialFetchJson("/instagram/media/AbCdE", 7_200, { apiVersion: "v2", feature: "six_month_backfill", privatePage: true });
    assert.equal(first.providerRequestMade, true);
    assert.equal(first.committedCredits, 1);
    assert.equal(cached.providerRequestMade, false);
    assert.equal(cached.committedCredits, 0);
    assert.deepEqual(cached.body, { data: { lookupStatus: "not_found" }, meta: { creditsCharged: 1 } });
    assert.equal(reservations, 1);
    assert.equal(settlements, 1);
    assert.equal(requests.length, 1);
    await requestSocialFetchJson("/instagram/media/AbCdE", 7_200, { apiVersion: "v1" });
    assert.equal(requests.length, 2, "different API versions must not share response shapes");
  } finally {
    setSocialFetchBudgetAdapterForTests(null);
    setSocialFetchRequestStoreForTests(null);
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.SOCIAL_FETCH_API_KEY;
    else process.env.SOCIAL_FETCH_API_KEY = previousKey;
  }
});

test("metric aliases and subsequent scheduled runs reuse one reserved provider lookup", async () => {
  const previousKey = process.env.SOCIAL_FETCH_API_KEY;
  const originalFetch = globalThis.fetch;
  const originalReserve = socialFetchBudgetAdapter.reserve;
  const originalSettle = socialFetchBudgetAdapter.settle;
  const database = createTestSocialFetchRequestStore();
  let calls = 0;
  let reservations = 0;
  process.env.SOCIAL_FETCH_API_KEY = "metric-test-key";
  setSocialFetchRequestStoreForTests(database.store);
  socialFetchBudgetAdapter.reserve = async () => ({ ok: true, reservationId: `metric-${++reservations}`, reservedCredits: 1,
    monthCreditsAfterReservation: reservations, monthlyCreditCap: 100 });
  socialFetchBudgetAdapter.settle = async () => undefined;
  globalThis.fetch = (async () => { calls++; return Response.json({ data: { metrics: { followers: 42 } }, meta: { creditsCharged: 1 } }); }) as typeof fetch;
  try {
    assert.deepEqual(await Promise.all([
      fetchSocialCountFromApi("x", "@FaZeAdapt"),
      fetchSocialCountFromApi("twitter", "fazeadapt"),
    ]), [42, 42]);
    assert.equal(await fetchSocialCountFromApi("x", "FaZeAdapt"), 42);
    const sharedProfile = await requestSocialFetchJson("/twitter/profiles/fazeadapt", 6 * 60 * 60, { feature: "content_availability" });
    assert.deepEqual(sharedProfile.body, { data: { metrics: { followers: 42 } }, meta: { creditsCharged: 1 } });
    assert.equal(sharedProfile.providerRequestMade, false);
    assert.equal(sharedProfile.committedCredits, 0);
    assert.equal(calls, 1);
    assert.equal(reservations, 1);
    database.advance(6 * 60 * 60 * 1_000 + 1);
    assert.equal(await fetchSocialCountFromApi("x", "FaZeAdapt"), 42);
    assert.equal(calls, 2);
    assert.equal(reservations, 2);
  } finally {
    socialFetchBudgetAdapter.reserve = originalReserve;
    socialFetchBudgetAdapter.settle = originalSettle;
    setSocialFetchRequestStoreForTests(null);
    globalThis.fetch = originalFetch;
    if (previousKey === undefined) delete process.env.SOCIAL_FETCH_API_KEY;
    else process.env.SOCIAL_FETCH_API_KEY = previousKey;
  }
});
