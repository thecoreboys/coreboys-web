import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  readSocialFetchCreditsCharged,
  socialFetchReservationDenial,
} from "../lib/social-fetch-budget";

test("Social Fetch credit metadata accepts only bounded non-negative charges", () => {
  assert.equal(readSocialFetchCreditsCharged({ meta: { creditsCharged: 3 } }), 3);
  assert.equal(readSocialFetchCreditsCharged({ meta: { creditsCharged: "2" } }), 2);
  assert.equal(readSocialFetchCreditsCharged({ meta: { creditsCharged: 1.2 } }), 2);
  assert.equal(readSocialFetchCreditsCharged({ meta: { creditsCharged: 0 } }), 0);
  assert.equal(readSocialFetchCreditsCharged({ meta: { creditsCharged: -1 } }), null);
  assert.equal(readSocialFetchCreditsCharged({ meta: { creditsCharged: "" } }), null);
  assert.equal(readSocialFetchCreditsCharged({ meta: { creditsCharged: "not-a-number" } }), null);
  assert.equal(readSocialFetchCreditsCharged({ creditsCharged: 9 }), null);
  assert.equal(readSocialFetchCreditsCharged(null), null);
});

test("Social Fetch budget permits the cap boundary and fails closed after it", () => {
  assert.equal(socialFetchReservationDenial({
    enabled: true,
    monthlyCreditCap: 10_000,
    creditsCommitted: 9_999,
    requestedCredits: 1,
  }), null);
  assert.equal(socialFetchReservationDenial({
    enabled: true,
    monthlyCreditCap: 10_000,
    creditsCommitted: 10_000,
    requestedCredits: 1,
  }), "monthly_cap_reached");
  assert.equal(socialFetchReservationDenial({
    enabled: false,
    monthlyCreditCap: 10_000,
    creditsCommitted: 0,
    requestedCredits: 1,
  }), "paused");
  assert.equal(socialFetchReservationDenial({
    enabled: true,
    monthlyCreditCap: 10_000,
    creditsCommitted: Number.NaN,
    requestedCredits: 1,
  }), "unavailable");
});

test("every Social Fetch request path is protected by the durable ledger", () => {
  const budget = readFileSync(resolve(process.cwd(), "lib/social-fetch-budget.ts"), "utf8");
  const media = readFileSync(resolve(process.cwd(), "lib/social-fetch-media.ts"), "utf8");
  const refresh = readFileSync(resolve(process.cwd(), "lib/social-fetch-refresh.ts"), "utf8");
  const metrics = readFileSync(resolve(process.cwd(), "lib/social-fetch.ts"), "utf8");
  const migration = readFileSync(
    resolve(process.cwd(), "scripts/migrations/043_social_fetch_credit_budget.sql"),
    "utf8",
  );
  const runner = readFileSync(resolve(process.cwd(), "scripts/apply-web-migrations.mjs"), "utf8");

  assert.match(migration, /CREATE TABLE IF NOT EXISTS social_fetch_provider_control/);
  assert.match(migration, /monthly_credit_cap INTEGER NOT NULL DEFAULT 10000/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS social_fetch_credit_events/);
  assert.match(runner, /043_social_fetch_credit_budget\.sql/);
  assert.match(refresh, /profile_media:\s*2 \* 60 \* 60/);
  assert.match(refresh, /instagram_reels:\s*2 \* 60 \* 60/);

  const controlLock = budget.indexOf("FOR UPDATE");
  const ledgerInsert = budget.indexOf("INSERT INTO social_fetch_credit_events");
  assert.ok(controlLock >= 0 && ledgerInsert > controlLock);
  assert.match(budget, /status = 'reserved' THEN estimated_credits/);
  assert.match(budget, /status = 'completed' THEN COALESCE\(actual_credits, estimated_credits\)/);

  const mediaReserve = media.indexOf("budgetAdapter.reserve(");
  const mediaFetch = media.indexOf("fetch(`${BASE_URL}${endpoint}`", mediaReserve);
  assert.ok(mediaReserve >= 0 && mediaFetch > mediaReserve);
  assert.match(media, /readSocialFetchCreditsCharged\(body\)/);
  assert.match(media, /budgetAdapter\.settle\(reservation\.reservationId, reportedCredits\)/);

  const metricReserve = metrics.indexOf("socialFetchBudgetAdapter.reserve(");
  const metricFetch = metrics.indexOf("fetch(endpoint", metricReserve);
  assert.ok(metricReserve >= 0 && metricFetch > metricReserve);
  assert.match(metrics, /readSocialFetchCreditsCharged\(json\)/);
  assert.match(metrics, /socialFetchBudgetAdapter\.settle\(reservation\.reservationId, reportedCredits\)/);
});
