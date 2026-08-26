import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
// @ts-expect-error The test runner loads the TypeScript source directly.
import { PassportAdminActionSchema, PassportAdminQuerySchema } from "../app/api/admin/passport/contracts.ts";
// @ts-expect-error The test runner loads the TypeScript source directly.
import { activeFreeze, budgetPercent, canSecondApprove, formatMomentTime } from "../components/admin/passport/control-room-helpers.ts";
// @ts-expect-error The test runner loads the TypeScript source directly.
import { normalizePassportAdminOverview } from "../app/api/admin/passport/normalize.ts";
import type { PassportPermission } from "../lib/passport/admin.ts";

const STAFF_ID = "11111111-1111-4111-8111-111111111111";
const EVENT_ID = "22222222-2222-4222-8222-222222222222";

test("Passport staff roles are always bound to an explicit valid scope", () => {
  const valid = PassportAdminActionSchema.safeParse({
    action: "assignment.upsert",
    channelSlug: "lacy",
    eventId: EVENT_ID,
    staffId: STAFF_ID,
    role: "scorekeeper",
    scopeType: "event",
    permissions: ["manage_scores"],
    endsAt: null,
  });
  assert.equal(valid.success, true);

  const missingEvent = PassportAdminActionSchema.safeParse({
    action: "assignment.upsert",
    channelSlug: "lacy",
    eventId: null,
    staffId: STAFF_ID,
    role: "scorekeeper",
    scopeType: "event",
    permissions: ["manage_scores"],
    endsAt: null,
  });
  assert.equal(missingEvent.success, false);
});

test("Passport poll drafts reject duplicate choices and unscoped events", () => {
  const base = {
    action: "poll.create",
    channelSlug: "core",
    eventId: EVENT_ID,
    question: "Who was tonight's MVP?",
    kind: "mvp",
    audience: "live_attendees",
  } as const;
  assert.equal(PassportAdminActionSchema.safeParse({ ...base, options: ["Adapt", "Lacy"] }).success, true);
  assert.equal(PassportAdminActionSchema.safeParse({ ...base, options: ["Adapt", "adapt"] }).success, false);
  assert.equal(PassportAdminActionSchema.safeParse({ ...base, eventId: null, options: ["Adapt", "Lacy"] }).success, false);
  assert.equal(PassportAdminActionSchema.safeParse({ ...base, audience: "members", options: ["Adapt", "Lacy"] }).success, false);
});

test("score revisions require bounded scores, a reason, and an event", () => {
  const parsed = PassportAdminActionSchema.safeParse({
    action: "score.revise",
    channelSlug: "core",
    eventId: EVENT_ID,
    scoreboardId: null,
    title: "CORE vs Guests",
    homeName: "CORE",
    awayName: "Guests",
    homeScore: 72,
    awayScore: 71,
    reason: "Buzzer-beater confirmed",
  });
  assert.equal(parsed.success, true);
  assert.equal(PassportAdminActionSchema.safeParse({
    ...(parsed.success ? parsed.data : {}),
    homeScore: -1,
  }).success, false);
});

test("reward nominations need durable recipient and reason fields", () => {
  const valid = PassportAdminActionSchema.safeParse({
    action: "reward.nominate",
    channelSlug: "jason",
    eventId: EVENT_ID,
    recipientUserId: STAFF_ID,
    rewardType: "achievement",
    rewardKey: "opening-night",
    rewardLabel: "Opening Night",
    rarity: "rare",
    quantity: 1,
    reason: "Verified opening-night attendee",
  });
  assert.equal(valid.success, true);
  assert.equal(PassportAdminActionSchema.safeParse({
    ...(valid.success ? valid.data : {}),
    reason: "x",
  }).success, false);
  assert.equal(PassportAdminActionSchema.safeParse({
    action: "reward.revoke",
    channelSlug: "jason",
    eventId: EVENT_ID,
    rewardId: STAFF_ID,
    reason: "Award issued to the wrong account",
  }).success, true);
  assert.equal(PassportAdminActionSchema.safeParse({
    action: "reward.revoke",
    channelSlug: "jason",
    eventId: EVENT_ID,
    rewardId: STAFF_ID,
    reason: "x",
  }).success, false);
});

test("attendance corrections are explicit, idempotent, and admin-private", () => {
  const correction = PassportAdminActionSchema.safeParse({
    action: "presence.correct",
    channelSlug: "core",
    eventId: EVENT_ID,
    userId: STAFF_ID,
    decision: "revoke",
    reason: "Automated heartbeat pattern confirmed during review",
    idempotencyKey: "33333333-3333-4333-8333-333333333333",
  });
  assert.equal(correction.success, true);
  assert.equal(PassportAdminActionSchema.safeParse({
    ...(correction.success ? correction.data : {}),
    reason: "x",
  }).success, false);

  const raw = {
    staffCandidates: [{ id: STAFF_ID, email: "admin@example.com", displayName: "Admin", role: "admin" }],
    eligibleRecipients: [], rewardRecipients: [], assignments: [], activeShifts: [], channelControls: [],
    events: [], scores: [], polls: [], moments: [], editions: [], nominations: [], appeals: [], audit: [],
    presenceRecords: [{
      userId: STAFF_ID,
      displayName: "CORE Fan",
      publicSlug: "core-fan",
      state: "verified",
      watchSeconds: 900,
      heartbeatCount: 31,
      claimedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      email: "never-expose@example.com",
    }],
  };
  const admin = normalizePassportAdminOverview(raw, { id: STAFF_ID, email: "admin@example.com", role: "admin", memberSlug: null }, "core", EVENT_ID);
  assert.equal(admin.presenceRecords[0]?.displayName, "CORE Fan");
  assert.equal(admin.presenceRecords[0]?.watchSeconds, 900);
  assert.equal(JSON.stringify(admin.presenceRecords).includes("never-expose@example.com"), false);
  const moderator = normalizePassportAdminOverview(raw, { id: STAFF_ID, email: "moderator@example.com", role: "member_manager", memberSlug: "core" }, "core", EVENT_ID);
  assert.deepEqual(moderator.presenceRecords, []);
});

test("signed editions require a named signer and poll certification accepts an explicit winner", () => {
  assert.equal(PassportAdminActionSchema.safeParse({
    action: "moment.publish",
    channelSlug: "core",
    eventId: EVENT_ID,
    momentId: STAFF_ID,
    variant: "signed",
    signedBy: "Lacy",
  }).success, true);
  assert.equal(PassportAdminActionSchema.safeParse({
    action: "moment.publish",
    channelSlug: "core",
    eventId: EVENT_ID,
    momentId: STAFF_ID,
    variant: "signed",
    signedBy: null,
  }).success, false);
  assert.equal(PassportAdminActionSchema.safeParse({
    action: "poll.transition",
    channelSlug: "core",
    eventId: EVENT_ID,
    pollId: STAFF_ID,
    status: "certified",
    winnerOptionId: EVENT_ID,
  }).success, true);
});

test("edition collection policy defaults safe and rejects conflicting transfers", () => {
  const safe = PassportAdminActionSchema.safeParse({
    action: "moment.publish",
    channelSlug: "core",
    eventId: EVENT_ID,
    momentId: STAFF_ID,
    variant: "base",
  });
  assert.equal(safe.success, true);
  if (safe.success && safe.data.action === "moment.publish") {
    assert.equal(safe.data.accountBound, true);
    assert.equal(safe.data.giftable, false);
    assert.equal(safe.data.tradeable, false);
    assert.equal(safe.data.craftValue, 0);
  }
  assert.equal(PassportAdminActionSchema.safeParse({
    action: "moment.publish",
    channelSlug: "core",
    eventId: EVENT_ID,
    momentId: STAFF_ID,
    accountBound: false,
    giftable: true,
    tradeable: true,
    craftValue: 250,
  }).success, true);
  assert.equal(PassportAdminActionSchema.safeParse({
    action: "moment.publish",
    channelSlug: "core",
    eventId: EVENT_ID,
    momentId: STAFF_ID,
    accountBound: true,
    giftable: true,
  }).success, false);
  assert.equal(PassportAdminActionSchema.safeParse({
    action: "moment.publish",
    channelSlug: "core",
    eventId: EVENT_ID,
    momentId: STAFF_ID,
    accountBound: false,
    giftable: false,
    tradeable: false,
  }).success, false);
  assert.equal(PassportAdminActionSchema.safeParse({
    action: "moment.publish",
    channelSlug: "core",
    eventId: EVENT_ID,
    momentId: STAFF_ID,
    craftValue: 10_001,
  }).success, false);
});

test("moment cards support bounded rarity, HTTPS artwork, and capped supply", () => {
  const moment = PassportAdminActionSchema.safeParse({
    action: "moment.create",
    channelSlug: "core",
    eventId: EVENT_ID,
    title: "The winning shot",
    rarity: "legendary",
    timestampSeconds: 321,
    windowBeforeSeconds: 90,
    windowAfterSeconds: 60,
    watchThresholdPercent: 80,
  });
  assert.equal(moment.success, true);
  assert.equal(PassportAdminActionSchema.safeParse({
    action: "moment.publish",
    channelSlug: "core",
    eventId: EVENT_ID,
    momentId: STAFF_ID,
    artworkUrl: "https://cdn.thecoreboys.com/cards/winning-shot.jpg",
    maxSupply: 250,
  }).success, true);
  assert.equal(PassportAdminActionSchema.safeParse({
    action: "moment.publish",
    channelSlug: "core",
    eventId: EVENT_ID,
    momentId: STAFF_ID,
    artworkUrl: "http://example.com/tracking.jpg",
  }).success, false);
  assert.equal(PassportAdminActionSchema.safeParse({
    action: "moment.publish",
    channelSlug: "core",
    eventId: EVENT_ID,
    momentId: STAFF_ID,
    maxSupply: 0,
  }).success, false);
});

test("events accept a bounded exact playback reference", () => {
  assert.equal(PassportAdminActionSchema.safeParse({
    action: "event.create",
    channelSlug: "core",
    eventId: null,
    title: "Opening night",
    externalRef: "youtube:dQw4w9WgXcQ",
    scheduledStartAt: new Date().toISOString(),
  }).success, true);
  assert.equal(PassportAdminActionSchema.safeParse({
    action: "event.create",
    channelSlug: "core",
    eventId: null,
    title: "Opening night",
    externalRef: "x".repeat(201),
  }).success, false);
});

test("query filters reject unsafe channel and excessive audit limits", () => {
  assert.equal(PassportAdminQuerySchema.safeParse({ channel: "core", auditLimit: "100" }).success, true);
  assert.equal(PassportAdminQuerySchema.safeParse({ channel: "../../core" }).success, false);
  assert.equal(PassportAdminQuerySchema.safeParse({ auditLimit: "1000" }).success, false);
});

test("control-room helpers preserve second-approval and freeze rules", () => {
  assert.equal(canSecondApprove(STAFF_ID, STAFF_ID), false);
  assert.equal(canSecondApprove(STAFF_ID, EVENT_ID), true);
  assert.equal(budgetPercent(9, 10), 90);
  assert.equal(budgetPercent(50, 10), 100);
  assert.equal(formatMomentTime(3_661), "1:01:01");
  assert.equal(activeFreeze([
    {
      id: STAFF_ID,
      channelSlug: "core",
      eventId: null,
      capabilities: ["all"],
      reason: "Safety hold",
      active: true,
      actorName: "Admin",
      createdAt: new Date().toISOString(),
    },
  ], "core", EVENT_ID)?.reason, "Safety hold");
});

test("Studio normalization never exposes global staff PII, fan appeals, or another actor's audit", () => {
  const raw = {
    staffCandidates: [
      { id: STAFF_ID, email: "lacy-staff@example.com", displayName: "Lacy staff", role: "member_manager" },
      { id: EVENT_ID, email: "global-admin@example.com", displayName: "Global admin", role: "admin" },
    ],
    eligibleRecipients: [],
    rewardRecipients: [],
    assignments: [{
      id: "33333333-3333-4333-8333-333333333333",
      staff_user_id: EVENT_ID,
      display_name: "Other channel moderator",
      email: "other-moderator@example.com",
      channel_slug: "lacy",
      roles: ["poll_host"],
      permissions: ["poll.create"],
    }],
    activeShifts: [],
    channelControls: [],
    events: [],
    scores: [],
    polls: [{
      id: "55555555-5555-4555-8555-555555555555",
      channel_slug: "lacy",
      question: "Who won the round?",
      kind: "standard",
      lifecycle_state: "draft",
      created_by: "other-poll-host@example.com",
      created_at: new Date().toISOString(),
      options: [],
    }],
    moments: [],
    editions: [],
    nominations: [{
      id: "44444444-4444-4444-8444-444444444444",
      channel_slug: "lacy",
      event_id: EVENT_ID,
      reward_type: "achievement",
      reward_code: "opening-night",
      reward_data: { label: "Opening Night", rarity: "rare", quantity: 1 },
      user_ids: ["fan-1"],
      reason: "Reversed award",
      state: "revoked",
      nominated_by: STAFF_ID,
      created_at: new Date().toISOString(),
    }],
    appeals: [{ id: EVENT_ID, user_id: "fan", email: "fan@example.com", reason: "Private appeal" }],
    audit: [
      { id: "1", actor_id: STAFF_ID, actor_email: "lacy-staff@example.com", action: "poll.create", scope_type: "channel", scope_id: "lacy", created_at: new Date().toISOString() },
      { id: "2", actor_id: EVENT_ID, actor_email: "global-admin@example.com", action: "reward.approve", scope_type: "channel", scope_id: "core", created_at: new Date().toISOString() },
    ],
  };
  const normalized = normalizePassportAdminOverview(raw, {
    id: STAFF_ID,
    email: "lacy-staff@example.com",
    role: "member_manager",
    memberSlug: "lacy",
  }, "lacy");
  assert.deepEqual(normalized.staff.map((staff) => staff.email), ["lacy-staff@example.com"]);
  assert.deepEqual(normalized.appeals, []);
  assert.deepEqual(normalized.audit.map((entry) => entry.id), ["1"]);
  assert.equal(normalized.rewards[0]?.status, "revoked");
  assert.equal(JSON.stringify(normalized).includes("global-admin@example.com"), false);
  assert.equal(JSON.stringify(normalized).includes("fan@example.com"), false);
    assert.equal(JSON.stringify(normalized).includes("other-moderator@example.com"), false);
    assert.equal(JSON.stringify(normalized).includes("other-poll-host@example.com"), false);
    assert.equal(normalized.polls[0]?.createdByName, "Staff");
});

test("event recipient picker is scoped, deduplicated, and public-identity only", () => {
  const OTHER_EVENT_ID = "33333333-3333-4333-8333-333333333333";
  const RECIPIENT_ID = "44444444-4444-4444-8444-444444444444";
  const raw = {
    staffCandidates: [{ id: STAFF_ID, email: "moderator@example.com", displayName: "Moderator", role: "member_manager" }],
    eligibleRecipients: [
      { id: RECIPIENT_ID, displayName: "Core Fan", publicSlug: "core-fan", eventId: EVENT_ID, channelSlug: "lacy", email: "must-not-leak@example.com", privateNote: "hidden" },
      { id: RECIPIENT_ID, displayName: "Core Fan", publicSlug: "core-fan", eventId: EVENT_ID, channelSlug: "lacy" },
      { id: "55555555-5555-4555-8555-555555555555", displayName: "Other event", publicSlug: "other-event", eventId: OTHER_EVENT_ID, channelSlug: "lacy" },
      { id: "66666666-6666-4666-8666-666666666666", displayName: "Other channel", publicSlug: "other-channel", eventId: EVENT_ID, channelSlug: "core" },
    ],
    rewardRecipients: [{ id: RECIPIENT_ID, displayName: "Core Fan", publicSlug: "core-fan", email: "history-must-not-leak@example.com" }],
    assignments: [],
    activeShifts: [],
    channelControls: [],
    events: [],
    scores: [],
    polls: [],
    moments: [],
    editions: [],
    nominations: [{
      id: "77777777-7777-4777-8777-777777777777",
      channel_slug: "lacy",
      event_id: EVENT_ID,
      reward_type: "achievement",
      reward_code: "opening-night",
      reward_data: { label: "Opening Night", rarity: "rare", quantity: 1 },
      user_ids: [RECIPIENT_ID],
      reason: "Verified attendee",
      state: "pending",
      nominated_by: STAFF_ID,
      created_at: new Date().toISOString(),
    }],
    appeals: [],
    audit: [],
  };
  const actor = { id: STAFF_ID, email: "moderator@example.com", role: "member_manager" as const, memberSlug: "lacy" };
  const normalized = normalizePassportAdminOverview(raw, actor, "lacy", EVENT_ID);
  assert.deepEqual(normalized.eligibleRecipients, [{ id: RECIPIENT_ID, displayName: "Core Fan", publicSlug: "core-fan" }]);
  assert.equal(normalized.rewards[0]?.recipientName, "Core Fan");
  assert.equal(normalized.rewards[0]?.recipientPublicSlug, "core-fan");
  assert.equal(JSON.stringify(normalized).includes("must-not-leak@example.com"), false);
  assert.equal(JSON.stringify(normalized).includes("history-must-not-leak@example.com"), false);
  assert.equal(JSON.stringify(normalized).includes("hidden"), false);
  assert.deepEqual(normalizePassportAdminOverview(raw, actor, "lacy", null).eligibleRecipients, []);
});

test("admin route preserves staff scope and uses nomination-wide compensation", () => {
  const routeSource = readFileSync(join(process.cwd(), "app/api/admin/passport/route.ts"), "utf8");
  assert.match(routeSource, /requireStaff\(\)/);
  assert.match(routeSource, /revokePassportNomination/);
  assert.doesNotMatch(routeSource, /revokePassportAsset/);
  assert.match(routeSource, /const freezeAll = requested\.has\("all"\)/);
  assert.match(routeSource, /actor\.role !== "admin" && usesCustomCollectionPolicy/);
  assert.doesNotMatch(routeSource, /requested\.has\("all"\) \|\| requested\.has\("moments"\)/);

  const controlRoomSource = readFileSync(join(process.cwd(), "components/admin/passport/PassportControlRoom.tsx"), "utf8");
  assert.match(controlRoomSource, /publishable && canPublish && canSetCollectionPolicy/);
  assert.match(controlRoomSource, /new Set\(overview\.effectivePermissions\)/);
  assert.match(controlRoomSource, /new Set\(overview\.dutyPermissions\)/);
  assert.match(controlRoomSource, /allowedCapabilities\.map/);
  assert.match(controlRoomSource, /permissions\.has\("chat\.freeze"\)[\s\S]*?\["chat"\]/);
  assert.match(controlRoomSource, /assignment\.staffId === currentStaffId/);
  assert.match(controlRoomSource, /isAdmin && assignment\.active/);

  const backendSource = readFileSync(join(process.cwd(), "lib/passport/admin.ts"), "utf8");
  const policySource = readFileSync(join(process.cwd(), "lib/passport/policy.ts"), "utf8");
  assert.match(backendSource, /actorFanId/);
  assert.match(policySource, /export function assertPassportNoSelfGrant/);
  assert.ok((backendSource.match(/assertPassportNoSelfGrant\(/g) ?? []).length >= 2);
  assert.match(policySource, /export function assertPassportEligibleRewardRecipients/);
  assert.match(backendSource, /assertPassportEligibleRewardRecipients\(recipientUserIds,eligible\)/);
  assert.match(backendSource, /user_id=ANY\(\$2::text\[\]\)/);
  assert.match(backendSource, /nomination\.revoke/);
  assert.match(backendSource, /xp\.revoke|sparks\.revoke/);
  assert.match(backendSource, /canonicalPassportReward/);
  assert.doesNotMatch(backendSource, /const supplied=nomination\.reward_data\?\.rarity/);
  assert.match(backendSource, /approvedBudgetUnitsPerRecipient/);
  assert.match(backendSource, /state IN\('eligible','verified'\).*user_id=ANY\(\$2::text\[\]\)/s);

  const legacyPollRoute = readFileSync(join(process.cwd(), "app/api/admin/polls/route.ts"), "utf8");
  assert.doesNotMatch(legacyPollRoute, /z\.enum\(\[[^\]]*"members"/);
});

test("control-room normalization preserves effective and on-duty permission sets", () => {
  const raw = {
    effectivePermissions: ["poll.create", "poll.certify", "chat.freeze"] as PassportPermission[],
    dutyPermissions: ["poll.create"] as PassportPermission[],
    onDuty: true,
    staffCandidates: [{ id: STAFF_ID, email: "moderator@example.com", displayName: "Moderator", role: "member_manager" }],
    eligibleRecipients: [], rewardRecipients: [], assignments: [], activeShifts: [], channelControls: [],
    events: [], scores: [], polls: [], moments: [], editions: [], nominations: [], appeals: [], audit: [], presenceRecords: [],
  };
  const normalized = normalizePassportAdminOverview(raw, {
    id: STAFF_ID,
    email: "moderator@example.com",
    role: "member_manager",
    memberSlug: "lacy",
  }, "lacy");
  assert.deepEqual(normalized.effectivePermissions, ["poll.create", "poll.certify", "chat.freeze"]);
  assert.deepEqual(normalized.dutyPermissions, ["poll.create"]);
  assert.equal(normalized.onDuty, true);
});
