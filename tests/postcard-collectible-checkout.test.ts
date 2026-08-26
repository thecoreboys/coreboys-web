import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { groupEligiblePostcardCollectibleRows } from "../lib/postcard-collectible-store";

test("eligible catalog rows are grouped without exposing order or owner data", () => {
  const releases = groupEligiblePostcardCollectibleRows([
    {
      set_id: "11111111-1111-4111-8111-111111111111",
      set_code: "house-one",
      set_title: "House One",
      member_slug: "ron",
      release_id: "22222222-2222-4222-8222-222222222222",
      release_code: "opening-night",
      release_title: "Opening Night",
      description: null,
      design_id: "stat-leader",
      edition_size: 100,
      available_until: "2026-09-01T00:00:00.000Z",
      variant_id: "33333333-3333-4333-8333-333333333333",
      variant_code: "standard",
      variant_title: "Standard",
      remaining_now: 8,
    },
    {
      set_id: "11111111-1111-4111-8111-111111111111",
      set_code: "house-one",
      set_title: "House One",
      member_slug: "ron",
      release_id: "22222222-2222-4222-8222-222222222222",
      release_code: "opening-night",
      release_title: "Opening Night",
      description: null,
      design_id: "stat-leader",
      edition_size: 100,
      available_until: "2026-09-01T00:00:00.000Z",
      variant_id: "44444444-4444-4444-8444-444444444444",
      variant_code: "prismatic",
      variant_title: "Prismatic",
      remaining_now: 3,
    },
  ]);
  assert.equal(releases.length, 1);
  assert.equal(releases[0]?.variants.length, 2);
  assert.equal(releases[0]?.remainingNow, 8);
  assert.doesNotMatch(JSON.stringify(releases), /owner|order|message|address|payment/i);
});

test("checkout reserves a chosen variant and confirms it before live fulfillment", () => {
  const store = readFileSync(join(process.cwd(), "lib/postcard-collectible-store.ts"), "utf8");
  const checkout = readFileSync(join(process.cwd(), "app/api/postcard/create-intent/route.ts"), "utf8");
  const webhook = readFileSync(join(process.cwd(), "app/api/postcard/webhook/route.ts"), "utf8");
  const fulfill = readFileSync(join(process.cwd(), "lib/postcard-fulfill.ts"), "utf8");
  assert.match(checkout, /PostcardCollectibleCheckoutSelectionSchema\.safeParse/);
  assert.match(checkout, /configuration\.mode !== "live"/);
  assert.match(store, /FOR UPDATE OF releases, variants/);
  assert.match(store, /reservation_expires_at[\s\S]*NOW\(\) \+ INTERVAL '30 minutes'/);
  assert.match(store, /state IN \('issuing','issued'\)[\s\S]*reservation_expires_at IS NULL/);
  assert.match(webhook, /confirmPostcardCollectibleReservation[\s\S]*markPostcardOrderPaid/);
  assert.match(fulfill, /isPostcardCollectibleReadyForFulfillment[\s\S]*sendPostcard/);
  assert.match(fulfill, /setOrderStatus\(order\.id, status[\s\S]*issuePostcardCollectibleForOrder/);
});

test("binder routes are authenticated and private owner filters are parameterized", () => {
  const catalogRoute = readFileSync(join(process.cwd(), "app/api/postcard/collectibles/route.ts"), "utf8");
  const binderRoute = readFileSync(join(process.cwd(), "app/api/account/postcards/binder/route.ts"), "utf8");
  const store = readFileSync(join(process.cwd(), "lib/postcard-collectible-store.ts"), "utf8");
  assert.match(catalogRoute, /getCurrentFanUserId/);
  assert.match(binderRoute, /getCurrentFanUserId/);
  assert.match(binderRoute, /Cache-Control": "private, no-store"/);
  assert.match(store, /postcard_collectible_binder_safe[\s\S]*WHERE owner_user_id = \$1/);
  assert.match(store, /postcard_collectible_set_progress_safe[\s\S]*WHERE owner_user_id = \$1/);
});
