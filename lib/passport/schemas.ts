import { z } from "zod";

const Uuid = z.string().uuid();
const Code = z.string().trim().min(1).max(80).regex(/^[a-z0-9][a-z0-9._:-]*$/i);
const IdempotencyKey = z.string().trim().min(8).max(160).regex(/^[A-Za-z0-9._:-]+$/);
const ShowcaseCardIds = z.array(Uuid).max(3).refine((values) => new Set(values).size === values.length, "Card showcase entries must be unique");
const ShowcaseAchievementCodes = z.array(Code).max(3).refine((values) => new Set(values).size === values.length, "Achievement showcase entries must be unique");
const ReactionCodes = z.array(Code).max(8).refine((values) => new Set(values).size === values.length, "Reaction codes must be unique");
const BadgeCodes = z.array(Code).max(3).refine((values) => new Set(values).size === values.length, "Badge codes must be unique");
const Privacy = z.object({
  profile: z.enum(["public", "members", "private"]),
  inventory: z.enum(["public", "members", "private"]),
  activity: z.enum(["public", "members", "private"]),
  channelAffinity: z.enum(["public", "members", "private"]),
}).strict();

const Loadout = z.object({
  scope: Code,
  titleCode: Code.nullable(),
  nameplateCode: Code.nullable(),
  frameCode: Code.nullable(),
  themeCode: Code.nullable(),
  reactionCodes: ReactionCodes,
  featuredCardId: Uuid.nullable(),
  badgeCodes: BadgeCodes,
}).strict();

export const PassportActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("presence.heartbeat"),
    payload: z.object({
      eventId: Uuid,
      sessionId: z.string().min(12).max(120).regex(/^[A-Za-z0-9_-]+$/),
      playbackRef: z.string().trim().min(1).max(200),
      positionSeconds: z.number().int().min(0).max(7 * 24 * 60 * 60),
      playing: z.boolean(),
      visible: z.boolean(),
    }).strict(),
  }),
  z.object({
    action: z.literal("presence.claim"),
    payload: z.object({ eventId: Uuid, editionId: Uuid.optional(), idempotencyKey: IdempotencyKey }).strict(),
  }),
  z.object({
    action: z.literal("quest.claim"),
    payload: z.object({ questCode: Code, idempotencyKey: IdempotencyKey }).strict(),
  }),
  z.object({
    action: z.literal("showcase.save"),
    payload: z.object({ cardIds: ShowcaseCardIds, achievementCodes: ShowcaseAchievementCodes }).strict(),
  }),
  z.object({ action: z.literal("privacy.save"), payload: Privacy }),
  z.object({
    action: z.literal("profile.update"),
    payload: z.object({
      displayTitle: z.string().trim().max(60).nullable().optional(),
      exchangeEnabled:z.boolean().optional(),
      privacy: Privacy.optional(),
      cardIds: ShowcaseCardIds.optional(),
      achievementCodes: ShowcaseAchievementCodes.optional(),
    }).strict(),
  }),
  z.object({ action: z.literal("loadout.save"), payload: Loadout }),
  z.object({ action: z.literal("loadout.activate"), payload: z.object({ scope: Code }).strict() }),
  z.object({
    action: z.literal("album.claim"),
    payload: z.object({ albumCode: Code, idempotencyKey: IdempotencyKey }).strict(),
  }),
  z.object({
    action: z.literal("community_goal.claim"),
    payload: z.object({ goalCode: Code, idempotencyKey: IdempotencyKey }).strict(),
  }),
  z.object({
    action: z.literal("card.craft"),
    payload: z.object({ recipeCode: Code, cardIds: z.array(Uuid).min(1).max(100), idempotencyKey: IdempotencyKey }).strict(),
  }),
  z.object({
    action: z.literal("gift.create"),
    payload: z.object({
      cardId: Uuid,
      recipient: z.string().trim().min(1).max(33).regex(/^@?[a-z0-9][a-z0-9-]{0,31}$/i),
      message: z.string().trim().max(280).optional(),
      idempotencyKey: IdempotencyKey,
    }).strict(),
  }),
  z.object({
    action: z.enum(["gift.accept", "gift.decline", "gift.cancel"]),
    payload: z.object({ giftId: Uuid, idempotencyKey: IdempotencyKey }).strict(),
  }),
  z.object({
    action: z.literal("trade.create"),
    payload: z.object({
      recipient: z.string().trim().min(1).max(33).regex(/^@?[a-z0-9][a-z0-9-]{0,31}$/i),
      offeredCardIds: z.array(Uuid).min(1).max(20),
      requestedCardIds: z.array(Uuid).min(1).max(20),
      message: z.string().trim().max(280).optional(),
      idempotencyKey: IdempotencyKey,
    }).strict().superRefine((value, context) => {
      if (new Set([...value.offeredCardIds, ...value.requestedCardIds]).size !== value.offeredCardIds.length + value.requestedCardIds.length) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "cards_must_be_unique" });
      }
    }),
  }),
  z.object({
    action: z.enum(["trade.accept", "trade.confirm", "trade.decline", "trade.cancel"]),
    payload: z.object({ tradeId: Uuid, idempotencyKey: IdempotencyKey }).strict(),
  }),
  z.object({
    action: z.literal("appeal.create"),
    payload: z.object({
      subjectType: z.enum(["achievement", "card", "presence", "gift", "trade", "moderation", "other"]),
      subjectId: z.string().trim().min(1).max(160),
      reason: z.string().trim().min(20).max(2000),
      idempotencyKey: IdempotencyKey,
    }).strict(),
  }),
]);

export const PassportInventoryQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
  channel: Code.optional(),
  album: Code.optional(),
});

export type ParsedPassportAction = z.infer<typeof PassportActionSchema>;
