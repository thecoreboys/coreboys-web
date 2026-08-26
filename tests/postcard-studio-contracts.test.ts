import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  defaultPostcardPackConfig,
  PostcardStudioActionSchema,
} from "../lib/postcard-studio-schema";

test("Postcard Studio accepts a strict, data-only pack create action", () => {
  const config = defaultPostcardPackConfig("NMS Summer");
  const parsed = PostcardStudioActionSchema.safeParse({
    action: "create_pack",
    slug: "nms-summer",
    title: "NMS Summer",
    description: "A creator-managed seasonal pack.",
    config,
  });
  assert.equal(parsed.success, true);

  assert.equal(PostcardStudioActionSchema.safeParse({
    action: "create_pack",
    memberSlug: "adapt",
    slug: "nms-summer",
    title: "NMS Summer",
    description: null,
    config,
  }).success, false, "member scope must never be accepted from the mutation body");

  assert.equal(PostcardStudioActionSchema.safeParse({
    action: "create_pack",
    slug: "nms-summer",
    title: "<script>alert(1)</script>",
    description: null,
    config,
  }).success, false);
});

test("drop scheduling enforces a bounded code and a forward time window", () => {
  const base = {
    action: "schedule_drop",
    packId: "07e80ca0-0432-4cf7-a3e1-866666b3c879",
    revisionId: "7b411db1-ebc8-4af4-be3f-01e788b4df98",
    code: "summer-drop",
    title: "Summer drop",
    description: null,
    startsAt: "2026-08-22T12:00:00.000Z",
    endsAt: "2026-08-23T12:00:00.000Z",
    albumCode: null,
  } as const;
  assert.equal(PostcardStudioActionSchema.safeParse(base).success, true);
  assert.equal(PostcardStudioActionSchema.safeParse({
    ...base,
    endsAt: "2026-08-21T12:00:00.000Z",
  }).success, false);
  assert.equal(PostcardStudioActionSchema.safeParse({ ...base, code: "../escape" }).success, false);
});

test("admin change requests require a plain-text review note", () => {
  const base = {
    action: "review_revision",
    revisionId: "7b411db1-ebc8-4af4-be3f-01e788b4df98",
    decision: "rejected",
  } as const;
  assert.equal(PostcardStudioActionSchema.safeParse(base).success, false);
  assert.equal(PostcardStudioActionSchema.safeParse({ ...base, note: "Please tighten the photo rights notes." }).success, true);
  assert.equal(PostcardStudioActionSchema.safeParse({ ...base, note: "<b>No</b>" }).success, false);
});

test("studio route derives staff scope and protects every unsafe request", () => {
  const route = readFileSync(join(process.cwd(), "app/api/studio/postcards/route.ts"), "utf8");
  assert.match(route, /requireStaff\(\)/);
  assert.match(route, /requestHasSameOrigin\(request\)/);
  assert.match(route, /decidePostcardStaffAction/);
  assert.doesNotMatch(route, /parsed\.data\.memberSlug/);
  assert.match(route, /"pack\.review"/);
  assert.match(route, /"pack\.publish"/);
});

test("member dashboard reads only safe inbox and aggregate analytics projections", () => {
  const store = readFileSync(join(process.cwd(), "lib/postcard-studio-store.ts"), "utf8");
  assert.match(store, /FROM postcard_member_inbox_safe inbox/);
  assert.match(store, /FROM postcard_member_analytics_daily/);
  assert.match(store, /WHERE inbox\.member_slug = \$1/);
  assert.match(store, /WHERE member_slug = \$1/);

  const dashboardType = readFileSync(join(process.cwd(), "lib/postcard-studio-schema.ts"), "utf8");
  for (const privateField of [
    "returnAddress",
    "paymentIntent",
    "providerId",
    "statusTokenHash",
    "creativeFrontHtml",
    "creativeBackHtml",
  ]) {
    assert.doesNotMatch(dashboardType, new RegExp(privateField));
  }
});
