import { z } from "zod";

const Uuid = z.string().uuid();
const NullableUuid = Uuid.nullable().optional();
const Code = z.string().trim().min(1).max(80).regex(/^[a-z0-9][a-z0-9._:-]*$/i);
const ChannelSlug = z.string().trim().min(1).max(80).regex(/^[a-z0-9][a-z0-9-]*$/i);
const Reason = z.string().trim().min(3).max(600);
const Timestamp = z.string().datetime().nullable().optional();
const HttpsUrl = z.string().trim().url().max(2_048).refine((value) => {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}, "Artwork must use HTTPS.").nullable().optional();
const Role = z.enum(["channel_lead", "live_producer", "chat_guardian", "poll_host", "scorekeeper", "moment_archivist", "reward_curator", "judge"]);

function scoped<const A extends string, T extends z.ZodRawShape>(action: A, shape: T) {
  return z.object({
    action: z.literal(action),
    channelSlug: ChannelSlug,
    eventId: NullableUuid,
    ...shape,
  }).strict();
}

const AssignmentUpsert = scoped("assignment.upsert", {
  assignmentId: Uuid.optional(),
  staffId: Uuid,
  role: Role,
  scopeType: z.enum(["network", "channel", "event"]),
  permissions: z.array(Code).min(1).max(24),
  endsAt: Timestamp,
}).superRefine((value, context) => {
  if (value.scopeType === "event" && !value.eventId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["eventId"], message: "Event-scoped roles require an event." });
  }
});

const ScoreRevision = scoped("score.revise", {
  scoreboardId: NullableUuid,
  title: z.string().trim().min(3).max(140),
  homeName: z.string().trim().min(1).max(80),
  awayName: z.string().trim().min(1).max(80),
  homeScore: z.number().int().min(0).max(9_999),
  awayScore: z.number().int().min(0).max(9_999),
  reason: Reason,
}).superRefine((value, context) => {
  if (!value.eventId) context.addIssue({ code: z.ZodIssueCode.custom, path: ["eventId"], message: "A scoreboard must belong to an event." });
});

const MomentCreate = scoped("moment.create", {
  title: z.string().trim().min(3).max(140),
  description: z.string().trim().max(1_000).nullable().optional(),
  rarity: z.enum(["common", "rare", "historic", "legendary"]).default("common"),
  timestampSeconds: z.number().int().min(0).max(7 * 24 * 60 * 60),
  windowBeforeSeconds: z.number().int().min(0).max(3_600),
  windowAfterSeconds: z.number().int().min(0).max(3_600),
  watchThresholdPercent: z.number().int().min(1).max(100),
}).superRefine((value, context) => {
  if (!value.eventId) context.addIssue({ code: z.ZodIssueCode.custom, path: ["eventId"], message: "A moment must belong to an event." });
});

const PollCreate = scoped("poll.create", {
  question: z.string().trim().min(3).max(280),
  kind: z.enum(["standard", "prediction", "trivia", "mvp"]),
  // Paid/subscriber entitlement is not wired yet. Keep legacy member polls
  // readable but do not let staff create an audience normal users cannot join.
  audience: z.enum(["everyone", "signed_in", "live_attendees"]),
  options: z.array(z.string().trim().min(1).max(120)).min(2).max(8),
}).superRefine((value, context) => {
  if (!value.eventId) context.addIssue({ code: z.ZodIssueCode.custom, path: ["eventId"], message: "A poll must belong to an event." });
  if (new Set(value.options.map((option) => option.toLocaleLowerCase())).size !== value.options.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["options"], message: "Poll options must be unique." });
  }
});

const RewardNomination = scoped("reward.nominate", {
  recipientUserId: Uuid,
  rewardType: z.enum(["achievement", "card", "cosmetic", "xp", "sparks"]),
  rewardKey: Code,
  rewardLabel: z.string().trim().min(1).max(140),
  rarity: z.enum(["common", "rare", "historic", "legendary"]),
  quantity: z.number().int().min(1).max(10_000),
  reason: Reason,
});

const PresenceCorrection = scoped("presence.correct", {
  eventId: Uuid,
  userId: Uuid,
  decision: z.enum(["revoke", "reject", "reinstate"]),
  reason: Reason,
  idempotencyKey: Code,
});

// A few actions carry cross-field scope checks, which turn their object schema
// into a Zod effect. `z.union` preserves those checks; discriminatedUnion only
// accepts plain objects in Zod 3.
export const PassportAdminActionSchema = z.union([
  AssignmentUpsert,
  scoped("assignment.revoke", { assignmentId: Uuid, reason: Reason }),
  scoped("shift.start", { assignmentId: Uuid }),
  scoped("shift.end", { shiftId: Uuid }),
  scoped("event.create", {
    title: z.string().trim().min(3).max(140),
    description: z.string().trim().max(1_000).nullable().optional(),
    externalRef: z.string().trim().min(1).max(200).nullable().optional(),
    scheduledStartAt: Timestamp,
    scheduledEndAt: Timestamp,
  }),
  scoped("event.update", {
    eventId: Uuid,
    title: z.string().trim().min(3).max(140).optional(),
    description: z.string().trim().max(1_000).nullable().optional(),
    externalRef: z.string().trim().min(1).max(200).nullable().optional(),
    status: z.enum(["draft", "scheduled", "live", "ended", "certified", "cancelled"]).optional(),
    scheduledStartAt: Timestamp,
    scheduledEndAt: Timestamp,
    reason: z.string().trim().min(3).max(600).optional(),
  }).refine((value) => Object.keys(value).some((key) => !["action", "channelSlug", "eventId"].includes(key)), "No event changes supplied."),
  scoped("event.freeze", {
    active: z.boolean(),
    capabilities: z.array(z.enum(["polls", "scores", "moments", "rewards", "chat", "all"])).min(1).max(6).optional(),
    reason: Reason,
  }),
  PollCreate,
  scoped("poll.transition", { pollId: Uuid, status: z.enum(["preview", "live", "locked", "certified"]), winnerOptionId: Uuid.nullable().optional(), reason: z.string().trim().min(3).max(600).optional() }),
  ScoreRevision,
  scoped("score.certify", { scoreboardId: Uuid, revisionId: z.number().int().min(0), reason: z.string().trim().min(3).max(600).optional() }),
  MomentCreate,
  scoped("moment.preview", { momentId: Uuid }),
  scoped("moment.publish", {
    momentId: Uuid,
    variant: z.enum(["base", "signed"]).default("base"),
    signedBy: z.string().trim().min(1).max(120).nullable().optional(),
    artworkUrl: HttpsUrl,
    maxSupply: z.number().int().min(1).max(1_000_000).nullable().optional(),
    accountBound: z.boolean().default(true),
    giftable: z.boolean().default(false),
    tradeable: z.boolean().default(false),
    craftValue: z.number().int().min(0).max(10_000).default(0),
  }).superRefine((value, context) => {
    if (value.variant === "signed" && !value.signedBy) context.addIssue({ code: z.ZodIssueCode.custom, path: ["signedBy"], message: "Signed editions require the signer." });
    if (value.accountBound && (value.giftable || value.tradeable)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["accountBound"], message: "Account-bound editions cannot be transferred." });
    if (!value.accountBound && !value.giftable && !value.tradeable) context.addIssue({ code: z.ZodIssueCode.custom, path: ["giftable"], message: "Transferable editions must allow gifts, trades, or both." });
  }),
  scoped("moment.cancel", { momentId: Uuid, reason: Reason }),
  scoped("edition.seal", { editionId: Uuid }),
  RewardNomination,
  PresenceCorrection,
  scoped("reward.review", { rewardId: Uuid, decision: z.enum(["approve", "reject"]), reason: Reason }),
  scoped("reward.revoke", { rewardId: Uuid, reason: Reason }),
  scoped("appeal.review", { appealId: Uuid, decision: z.enum(["approved", "denied"]), resolution: z.string().trim().min(3).max(2_000) }),
]);

export const PassportAdminQuerySchema = z.object({
  channel: ChannelSlug.optional(),
  event: Uuid.optional(),
  auditCursor: Uuid.optional(),
  auditLimit: z.coerce.number().int().min(1).max(200).default(100),
}).strict();

export type PassportAdminAction = z.infer<typeof PassportAdminActionSchema>;
export type PassportAdminQuery = z.infer<typeof PassportAdminQuerySchema>;
