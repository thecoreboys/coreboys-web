import { z } from "zod";

const MAX_CONFIG_BYTES = 262_144;
const IDENTIFIER = /^[a-z][a-z0-9-]{0,63}$/;
const MEMBER_SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const UNSAFE_TEXT = /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

function plainText(minimum: number, maximum: number) {
  return z.string().trim().min(minimum).max(maximum).refine(
    (value) => !UNSAFE_TEXT.test(value),
    "Markup and control characters are not allowed.",
  );
}

const Identifier = z.string().regex(IDENTIFIER);
const MemberSlug = z.string().regex(MEMBER_SLUG);
const HexColor = z.string().regex(HEX_COLOR);
const AssetId = z.string().uuid();

export const POSTCARD_PACK_SCHEMA_VERSION = 1 as const;

export const POSTCARD_COMPOSITIONS = [
  "lower-third",
  "full-frame-alert",
  "night-vision-monitor",
  "split-screen-recap",
  "rookie-card",
  "stat-leader",
  "quest-card",
  "holographic-mvp",
  "banner-headline",
  "sports-extra",
  "classified-collage",
  "late-edition-photo",
  "cover-story",
  "street-style-cover",
  "match-day-editorial",
  "noir-profile",
  "polaroid-stack",
  "contact-sheet",
  "tour-notes",
  "archive-folder",
] as const;

export const POSTCARD_EDITABLE_FIELD_KEYS = [
  "headline",
  "caption",
  "primaryStat",
  "secondaryStat",
  "issueNumber",
  "date",
  "score",
  "location",
] as const;

export const PostcardPackPaletteSchema = z.object({
  id: Identifier,
  label: plainText(1, 60),
  background: HexColor,
  surface: HexColor,
  ink: HexColor,
  mutedInk: HexColor,
  primary: HexColor,
  secondary: HexColor,
  highlight: HexColor,
}).strict();

export const PostcardPackMotifSchema = z.object({
  id: Identifier,
  label: plainText(1, 60),
  kind: z.enum(["badge", "doodle", "line", "sticker", "texture", "type"]),
  mark: plainText(1, 24).optional(),
  assetId: AssetId.optional(),
  placements: z.array(z.enum([
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
    "edge",
    "field",
  ])).min(1).max(6).refine(uniqueValues, "Motif placements must be unique."),
}).strict().superRefine((value, ctx) => {
  if (!value.mark && !value.assetId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["mark"],
      message: "A motif requires a safe mark or an approved asset reference.",
    });
  }
});

export const PostcardPackPromptSchema = z.object({
  id: Identifier,
  label: plainText(1, 60),
  question: plainText(1, 180),
  placeholder: plainText(1, 180),
}).strict();

export const PostcardPackPhraseSchema = z.object({
  id: Identifier,
  label: plainText(1, 60),
  text: plainText(1, 240),
  category: z.enum([
    "thank-you",
    "memory",
    "roast",
    "prediction",
    "advice",
    "celebration",
    "other",
  ]),
}).strict();

export const PostcardPackFieldSchema = z.object({
  key: z.enum(POSTCARD_EDITABLE_FIELD_KEYS),
  label: plainText(1, 60),
  kind: z.enum(["text", "number", "date", "score"]),
  required: z.boolean().default(false),
  maxLength: z.number().int().min(1).max(180),
  defaultValue: plainText(0, 180).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.defaultValue && value.defaultValue.length > value.maxLength) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["defaultValue"],
      message: "Default value exceeds the field maximum length.",
    });
  }
});

export const PostcardPackDesignSchema = z.object({
  id: Identifier,
  label: plainText(1, 80),
  description: plainText(1, 300),
  composition: z.enum(POSTCARD_COMPOSITIONS),
  photoSlots: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(6),
  ]),
  fields: z.array(PostcardPackFieldSchema).max(12).default([])
    .refine(uniqueBy("key"), "Editable field keys must be unique within a design."),
  paletteIds: z.array(Identifier).min(1).max(12)
    .refine(uniqueValues, "Palette references must be unique."),
  motifIds: z.array(Identifier).max(16).default([])
    .refine(uniqueValues, "Motif references must be unique."),
  assetIds: z.array(AssetId).max(24).default([])
    .refine(uniqueValues, "Asset references must be unique."),
  backgroundStyle: z.enum(["solid", "radial", "striped", "grid", "checker", "starburst"]),
  gradientDirection: z.number().int().min(0).max(359).optional(),
  edgeTreatments: z.array(z.enum(["clean", "worn", "rounded", "inked", "deckled"]))
    .min(1).max(5).refine(uniqueValues, "Edge treatments must be unique."),
  frameStyles: z.array(z.enum(["frameless", "keyline", "collector", "full-bleed"]))
    .min(1).max(4).refine(uniqueValues, "Frame styles must be unique."),
  attachmentStyles: z.array(z.enum(["none", "tape", "staples", "clips", "brackets", "photo-corners"]))
    .min(1).max(6).refine(uniqueValues, "Attachment styles must be unique."),
}).strict();

export const PostcardPackConfigSchema = z.object({
  schemaVersion: z.literal(POSTCARD_PACK_SCHEMA_VERSION),
  title: plainText(1, 120),
  description: plainText(0, 1000).default(""),
  palettes: z.array(PostcardPackPaletteSchema).min(1).max(12)
    .refine(uniqueBy("id"), "Palette ids must be unique."),
  motifs: z.array(PostcardPackMotifSchema).max(48).default([])
    .refine(uniqueBy("id"), "Motif ids must be unique."),
  prompts: z.array(PostcardPackPromptSchema).max(24).default([])
    .refine(uniqueBy("id"), "Prompt ids must be unique."),
  phrases: z.array(PostcardPackPhraseSchema).max(64).default([])
    .refine(uniqueBy("id"), "Phrase ids must be unique."),
  designs: z.array(PostcardPackDesignSchema).min(1).max(24)
    .refine(uniqueBy("id"), "Design ids must be unique."),
}).strict().superRefine((config, ctx) => {
  if (byteLength(config) > MAX_CONFIG_BYTES) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Pack configuration must be at most ${MAX_CONFIG_BYTES} bytes.`,
    });
  }

  const paletteIds = new Set(config.palettes.map((palette) => palette.id));
  const motifIds = new Set(config.motifs.map((motif) => motif.id));
  config.designs.forEach((design, designIndex) => {
    design.paletteIds.forEach((paletteId, referenceIndex) => {
      if (!paletteIds.has(paletteId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["designs", designIndex, "paletteIds", referenceIndex],
          message: `Unknown palette reference: ${paletteId}`,
        });
      }
    });
    design.motifIds.forEach((motifId, referenceIndex) => {
      if (!motifIds.has(motifId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["designs", designIndex, "motifIds", referenceIndex],
          message: `Unknown motif reference: ${motifId}`,
        });
      }
    });
  });
});

export const PostcardPackCreateSchema = z.object({
  memberSlug: MemberSlug,
  slug: z.string().regex(/^[a-z][a-z0-9-]{0,79}$/),
  title: plainText(1, 120),
  description: plainText(0, 1000).nullable().optional(),
}).strict();

export const PostcardPackRevisionCreateSchema = z.object({
  packId: z.string().uuid(),
  config: PostcardPackConfigSchema,
}).strict();

export const PostcardPackAssetMetadataSchema = z.object({
  packId: z.string().uuid(),
  memberSlug: MemberSlug,
  kind: z.enum(["sticker", "texture", "background", "frame", "overlay", "mask", "logo", "photo"]),
  rightsSource: z.enum(["official", "original", "licensed"]),
  rightsAttested: z.literal(true),
  attribution: plainText(0, 300).nullable().optional(),
}).strict();

export const PostcardDropCreateSchema = z.object({
  packId: z.string().uuid(),
  revisionId: z.string().uuid(),
  memberSlug: MemberSlug,
  code: z.string().regex(/^[a-z][a-z0-9-]{0,79}$/),
  title: plainText(1, 120),
  description: plainText(0, 1000).nullable().optional(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
  albumCode: Identifier.nullable().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.endsAt && Date.parse(value.endsAt) <= Date.parse(value.startsAt)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endsAt"],
      message: "Drop end time must be after its start time.",
    });
  }
});

export const PostcardSharingChoiceSchema = z.object({
  visibility: z.enum(["private", "anonymous", "credited"]),
  showSender: z.boolean(),
  showMessage: z.boolean(),
  showArtwork: z.boolean(),
  policyVersion: plainText(1, 80),
}).strict().superRefine((value, ctx) => {
  if (value.visibility === "private" && (value.showSender || value.showMessage || value.showArtwork)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["visibility"],
      message: "Private postcards cannot expose sender, message, or artwork.",
    });
  }
  if (value.visibility === "anonymous" && value.showSender) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["showSender"],
      message: "Anonymous sharing cannot expose the sender.",
    });
  }
});

export const PostcardAcknowledgementSchema = z.object({
  reaction: z.enum(["seen", "heart", "thank_you"]),
  visibleToSender: z.boolean().default(true),
}).strict();

export const PostcardProofLinkCreateSchema = z.object({
  draftId: z.string().uuid(),
  draftRevision: z.number().int().positive(),
  expiresAt: z.string().datetime({ offset: true }),
}).strict();

export type PostcardPackConfig = z.infer<typeof PostcardPackConfigSchema>;
export type PostcardPackCreate = z.infer<typeof PostcardPackCreateSchema>;
export type PostcardPackRevisionCreate = z.infer<typeof PostcardPackRevisionCreateSchema>;
export type PostcardPackAssetMetadata = z.infer<typeof PostcardPackAssetMetadataSchema>;
export type PostcardDropCreate = z.infer<typeof PostcardDropCreateSchema>;
export type PostcardSharingChoice = z.infer<typeof PostcardSharingChoiceSchema>;
export type PostcardAcknowledgement = z.infer<typeof PostcardAcknowledgementSchema>;

function uniqueValues<T>(values: readonly T[]): boolean {
  return new Set(values).size === values.length;
}

function uniqueBy<Key extends string>(key: Key) {
  return (values: readonly Partial<Record<Key, unknown>>[]): boolean => {
    const keys = values.map((value) => value[key]);
    return new Set(keys).size === keys.length;
  };
}

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
