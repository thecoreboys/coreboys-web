/**
 * Versioned, client/server-safe creative state for the postcard studio.
 *
 * This is deliberately separate from PostcardInput. A draft can contain rich
 * editor state, but checkout continues to accept the small, established order
 * payload until a canonical renderer and storage contract are wired in.
 *
 * Keep this module data-only: it is safe to use in React, local persistence,
 * proof generation, and server-side review.
 */
import { z } from "zod";
import { POSTCARD_LIMITS, type PostcardInput } from "./postcard";
import { postcardIdentityFor, type PostcardIdentitySlug } from "./postcard-identities";
import {
  creatorFieldDefinition,
  creatorFieldDefinitionsFor,
  emptyPostcardCreatorFields,
} from "./postcard-creator-fields";

export const POSTCARD_DRAFT_SCHEMA_VERSION = 2 as const;

export const POSTCARD_DRAFT_LIMITS = {
  photoSlots: 6,
  motifs: 12,
  stats: 8,
  creatorFields: 24,
  text: 160,
  caption: 240,
  memoryAnswer: 500,
  embeddedImageCharacters: 900_000,
} as const;

const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const EMBEDDED_IMAGE = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const EMBEDDED_SIGNATURE = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;

const safeText = (maximum: number) => z.string().max(maximum).refine(
  (value) => !CONTROL_CHARACTERS.test(value),
  "Text contains unsupported control characters.",
);
const safeId = (maximum = 100) => z.string().min(1).max(maximum).regex(SAFE_ID);
const colorOrNull = z.string().regex(HEX_COLOR).nullable();
const unitInterval = z.number().finite().min(0).max(1);

const HttpOrRootRelativeUrlSchema = z.string().max(2_048).refine((value) => {
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}, "Use an HTTP(S) or root-relative URL.");

export const PostcardCropSchema = z.object({
  x: unitInterval,
  y: unitInterval,
  width: z.number().finite().gt(0).max(1),
  height: z.number().finite().gt(0).max(1),
}).strict().superRefine((crop, context) => {
  if (crop.x + crop.width > 1.000001) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["width"], message: "Crop extends past the image width." });
  }
  if (crop.y + crop.height > 1.000001) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["height"], message: "Crop extends past the image height." });
  }
});

export const PostcardImageSourceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("embedded"),
    origin: z.enum(["upload", "clipboard", "camera"]),
    dataUrl: z.string()
      .max(POSTCARD_DRAFT_LIMITS.embeddedImageCharacters)
      .regex(EMBEDDED_IMAGE),
  }).strict(),
  z.object({
    kind: z.literal("managed"),
    origin: z.enum(["upload", "clipboard", "camera", "background-removal"]),
    assetId: safeId(160),
    previewUrl: HttpOrRootRelativeUrlSchema.nullable(),
  }).strict(),
  z.object({
    kind: z.literal("core-moment"),
    momentId: safeId(160),
    platform: z.enum(["instagram", "twitch", "youtube", "core"]),
    imageUrl: HttpOrRootRelativeUrlSchema,
    sourceUrl: HttpOrRootRelativeUrlSchema.nullable(),
    attribution: safeText(160),
  }).strict(),
]);

export const PostcardImageAssetSchema = z.object({
  id: safeId(160),
  altText: safeText(240),
  source: PostcardImageSourceSchema,
}).strict();

export const PostcardImageAdjustmentsSchema = z.object({
  exposure: z.number().finite().min(-1).max(1),
  contrast: z.number().finite().min(-1).max(1),
  warmth: z.number().finite().min(-1).max(1),
  saturation: z.number().finite().min(-1).max(1),
  filterId: safeId().nullable(),
  filterStrength: unitInterval,
  duotone: z.object({ shadow: z.string().regex(HEX_COLOR), highlight: z.string().regex(HEX_COLOR) }).strict().nullable(),
  backgroundRemoved: z.boolean(),
}).strict();

export const PostcardPhotoSlotSchema = z.object({
  id: safeId(),
  position: z.number().int().min(0).max(POSTCARD_DRAFT_LIMITS.photoSlots - 1),
  asset: PostcardImageAssetSchema.nullable(),
  crop: PostcardCropSchema,
  focalPoint: z.object({ x: unitInterval, y: unitInterval }).strict(),
  zoom: z.number().finite().min(1).max(5),
  rotationDeg: z.number().finite().min(-180).max(180),
  flipHorizontal: z.boolean(),
  flipVertical: z.boolean(),
  adjustments: PostcardImageAdjustmentsSchema,
  mask: z.enum(["template", "rectangle", "arch", "shield", "ticket", "circle", "monitor", "torn-paper"]),
  border: z.enum(["template", "none", "thin", "heavy", "neon", "distressed", "double"]),
  attachment: z.enum(["template", "none", "tape", "staples", "clips", "brackets", "photo-corners"]),
  caption: safeText(POSTCARD_DRAFT_LIMITS.caption),
  subjectOverlap: z.boolean(),
}).strict();

export const PostcardRemixLocksSchema = z.object({
  crop: z.boolean(),
  colors: z.boolean(),
  motifs: z.boolean(),
  texture: z.boolean(),
  edges: z.boolean(),
  stamps: z.boolean(),
  layout: z.boolean(),
}).strict();

export const PostcardVisualOverridesSchema = z.object({
  palettePresetId: safeId().nullable(),
  palette: z.object({
    background: colorOrNull,
    surface: colorOrNull,
    ink: colorOrNull,
    primary: colorOrNull,
    secondary: colorOrNull,
    highlight: colorOrNull,
    sampleAccentFromSlotId: safeId().nullable(),
  }).strict(),
  background: z.object({
    type: z.enum(["template", "solid", "linear-gradient", "radial-gradient", "striped", "grid", "checker", "starburst"]),
    colors: z.array(z.string().regex(HEX_COLOR)).max(3),
    angleDeg: z.number().finite().min(0).max(360),
  }).strict().superRefine((background, context) => {
    const required = background.type === "template" ? 0 : background.type === "solid" ? 1 : 2;
    if (background.colors.length < required) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["colors"], message: `${background.type} needs at least ${required} color${required === 1 ? "" : "s"}.` });
    }
  }),
  layoutVariant: safeId().nullable(),
  motifIds: z.array(safeId()).max(POSTCARD_DRAFT_LIMITS.motifs),
  texture: z.enum(["template", "none", "smooth", "grain", "halftone", "crt", "paper-fibers", "newsprint"]),
  edge: z.enum(["template", "clean", "worn", "rounded", "inked", "deckled"]),
  frame: z.enum(["template", "frameless", "keyline", "collector", "full-bleed"]),
  stamp: z.object({
    visible: z.boolean(),
    styleId: safeId().nullable(),
    position: z.enum(["template", "top-left", "top-right", "center-right", "bottom-right"]),
    rotationDeg: z.number().finite().min(-30).max(30),
  }).strict(),
  effects: z.object({
    grain: unitInterval,
    halftoneDotSize: unitInterval,
    scanlineDensity: unitInterval,
    signalDistortion: unitInterval,
    colorSeparation: unitInterval,
    inkBleed: unitInterval,
    registrationOffset: unitInterval,
  }).strict(),
}).strict();

export const PostcardTemplateFieldsSchema = z.object({
  headline: safeText(POSTCARD_DRAFT_LIMITS.text),
  caption: safeText(POSTCARD_DRAFT_LIMITS.caption),
  issueNumber: safeText(40),
  date: safeText(40),
  score: safeText(40),
  location: safeText(100),
  stats: z.array(z.object({
    id: safeId(),
    label: safeText(60),
    value: safeText(60),
  }).strict()).max(POSTCARD_DRAFT_LIMITS.stats),
}).strict();

const PostcardCreatorValuesSchema = z.record(safeId(100), safeText(POSTCARD_DRAFT_LIMITS.text))
  .superRefine((values, context) => {
    if (Object.keys(values).length > POSTCARD_DRAFT_LIMITS.creatorFields) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Creator fields are limited to ${POSTCARD_DRAFT_LIMITS.creatorFields} entries.`,
      });
    }
  });

/** A recipient-tagged field bag; draft-level validation adds exact design scope. */
export const PostcardCreatorFieldsSchema = z.discriminatedUnion("recipientSlug", [
  z.object({ recipientSlug: z.literal("ron"), values: PostcardCreatorValuesSchema }).strict(),
  z.object({ recipientSlug: z.literal("jason"), values: PostcardCreatorValuesSchema }).strict(),
  z.object({ recipientSlug: z.literal("lacy"), values: PostcardCreatorValuesSchema }).strict(),
  z.object({ recipientSlug: z.literal("marlon"), values: PostcardCreatorValuesSchema }).strict(),
  z.object({ recipientSlug: z.literal("adapt"), values: PostcardCreatorValuesSchema }).strict(),
]).superRefine((creatorFields, context) => {
  for (const [fieldId, value] of Object.entries(creatorFields.values)) {
    const definition = creatorFieldDefinition(creatorFields.recipientSlug, fieldId);
    if (!definition) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["values", fieldId],
        message: `Field does not belong to ${creatorFields.recipientSlug}.`,
      });
      continue;
    }
    if (definition.options && !definition.options.includes(value)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["values", fieldId],
        message: "Value is not one of this creator field's approved options.",
      });
    }
  }
});

export const PostcardWritingSchema = z.object({
  message: safeText(POSTCARD_LIMITS.message).refine(
    (message) => message.split(/\r\n?|\n/).length <= POSTCARD_LIMITS.messageLines,
    `Message can have at most ${POSTCARD_LIMITS.messageLines} lines.`,
  ),
  purpose: z.enum(["freeform", "thank-you", "memory", "roast", "prediction", "advice", "congratulations"]),
  greeting: safeText(80),
  signoff: safeText(80),
  senderName: safeText(POSTCARD_LIMITS.senderName),
  lettering: z.enum(["template", "handwritten", "marker", "ballpoint", "label-maker", "typewriter"]),
  alignment: z.enum(["left", "center", "letter"]),
  paper: z.enum(["template", "plain", "lined", "notebook", "editorial", "stat-sheet"]),
  senderVisibility: z.enum(["full-name", "handle", "anonymous"]),
  signatureAssetId: safeId(160).nullable(),
  signatureDataUrl: z.string().max(220_000).regex(EMBEDDED_SIGNATURE).nullable().default(null),
  savedSignatureLabel: safeText(80).default(""),
  groupSigners: z.array(safeText(60)).max(12).default([]),
  featuredQuote: safeText(240).default(""),
  whyMomentMattered: safeText(300).default(""),
  secondaryLanguage: z.enum(["none", "spanish", "french", "portuguese"]).default("none"),
  secondaryMessage: safeText(POSTCARD_LIMITS.message).refine(
    (message) => message.split(/\r\n?|\n/).length <= POSTCARD_LIMITS.messageLines,
    `Secondary message can have at most ${POSTCARD_LIMITS.messageLines} lines.`,
  ).default(""),
  scheduledFor: z.string().regex(ISO_INSTANT).nullable().default(null),
  contentWarnings: z.array(z.enum(["grief", "illness", "loss", "mental-health", "violence", "other"])).max(6).default([]),
}).strict();

export const PostcardMemoryAnswersSchema = z.object({
  occasion: safeText(120),
  happenedOn: safeText(40),
  location: safeText(120),
  people: safeText(240),
  favoriteMoment: safeText(POSTCARD_DRAFT_LIMITS.memoryAnswer),
  whyItMattered: safeText(POSTCARD_DRAFT_LIMITS.memoryAnswer),
  insideJoke: safeText(POSTCARD_DRAFT_LIMITS.memoryAnswer),
  desiredTone: z.enum(["unspecified", "sincere", "funny", "hype", "nostalgic", "roast"]),
}).strict();

/** A serial is displayable only after a server authority has issued proof. */
export const PostcardCollectibleSchema = z.object({
  setId: safeId(160).nullable(),
  releaseId: safeId(160).nullable(),
  variantId: safeId(160).nullable(),
  serial: z.object({
    sequence: z.number().int().positive(),
    editionSize: z.number().int().positive(),
    issuedAt: z.string().regex(ISO_INSTANT),
    proofId: safeId(200),
    authority: z.literal("server"),
  }).strict().nullable(),
}).strict().superRefine((collectible, context) => {
  if (collectible.serial && collectible.serial.sequence > collectible.serial.editionSize) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["serial", "sequence"], message: "Serial exceeds the edition size." });
  }
});

const PostcardDraftV2Shape = z.object({
  schemaVersion: z.literal(POSTCARD_DRAFT_SCHEMA_VERSION),
  id: safeId(160),
  revision: z.number().int().nonnegative(),
  createdAt: z.string().regex(ISO_INSTANT),
  updatedAt: z.string().regex(ISO_INSTANT),
  recipientSlug: z.enum(["ron", "jason", "lacy", "marlon", "adapt"]),
  designId: safeId(160),
  variationSeed: safeId(POSTCARD_LIMITS.variationSeed),
  mode: z.enum(["quick", "fine"]),
  photoSlots: z.array(PostcardPhotoSlotSchema).min(1).max(POSTCARD_DRAFT_LIMITS.photoSlots),
  remixLocks: PostcardRemixLocksSchema,
  visual: PostcardVisualOverridesSchema,
  fields: PostcardTemplateFieldsSchema,
  creatorFields: PostcardCreatorFieldsSchema,
  writing: PostcardWritingSchema,
  memory: PostcardMemoryAnswersSchema,
  collectible: PostcardCollectibleSchema,
}).strict();

const PostcardDraftV2Schema = PostcardDraftV2Shape.superRefine((draft, context) => {
  const identity = postcardIdentityFor(draft.recipientSlug);
  const design = identity?.frontDesigns.find((candidate) => candidate.id === draft.designId);
  if (!design) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["designId"], message: "Design does not belong to this recipient." });
    return;
  }
  if (draft.photoSlots.length !== design.photoSlots) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["photoSlots"],
      message: `Design requires ${design.photoSlots} photo slot${design.photoSlots === 1 ? "" : "s"}.`,
    });
  }
  const positions = draft.photoSlots.map((slot) => slot.position);
  if (new Set(positions).size !== positions.length || positions.some((position) => position >= draft.photoSlots.length)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["photoSlots"], message: "Photo-slot positions must be unique and contiguous." });
  }
  const ids = draft.photoSlots.map((slot) => slot.id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["photoSlots"], message: "Photo-slot ids must be unique." });
  }
  const sampledSlot = draft.visual.palette.sampleAccentFromSlotId;
  if (sampledSlot && !ids.includes(sampledSlot)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["visual", "palette", "sampleAccentFromSlotId"], message: "Accent source must reference a photo slot in this draft." });
  }
  if (draft.creatorFields.recipientSlug !== draft.recipientSlug) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["creatorFields", "recipientSlug"],
      message: "Creator fields must belong to the postcard recipient.",
    });
  } else {
    const allowedForDesign = new Set(
      creatorFieldDefinitionsFor(draft.recipientSlug, draft.designId).map((field) => field.id),
    );
    for (const fieldId of Object.keys(draft.creatorFields.values)) {
      if (!allowedForDesign.has(fieldId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["creatorFields", "values", fieldId],
          message: "Creator field is not available for this postcard design.",
        });
      }
    }
  }
});

function upgradeV1Draft(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== 1) return value;

  const recipientSlug = raw.recipientSlug;
  const identity = typeof recipientSlug === "string" ? postcardIdentityFor(recipientSlug) : null;
  if (!identity) return { ...raw, schemaVersion: POSTCARD_DRAFT_SCHEMA_VERSION };

  const fields = raw.fields && typeof raw.fields === "object" && !Array.isArray(raw.fields)
    ? raw.fields as Record<string, unknown>
    : {};
  const designId = typeof raw.designId === "string" ? raw.designId : "";
  const allowedForDesign = new Set(
    creatorFieldDefinitionsFor(identity.slug, designId).map((field) => field.id),
  );
  const creatorValues: Record<string, string> = {};
  const genericStats: unknown[] = [];
  for (const candidate of Array.isArray(fields.stats) ? fields.stats : []) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      genericStats.push(candidate);
      continue;
    }
    const stat = candidate as Record<string, unknown>;
    if (
      typeof stat.id === "string"
      && typeof stat.value === "string"
      && creatorFieldDefinition(identity.slug, stat.id)
      && allowedForDesign.has(stat.id)
    ) {
      // V1 stored recipient controls in the eight-item generic stats array.
      // Move every recognized entry before applying the generic stats cap.
      creatorValues[stat.id] = stat.value;
    } else {
      genericStats.push(candidate);
    }
  }

  return {
    ...raw,
    schemaVersion: POSTCARD_DRAFT_SCHEMA_VERSION,
    fields: { ...fields, stats: genericStats },
    creatorFields: { recipientSlug: identity.slug, values: creatorValues },
  };
}

/** Current schema accepts persisted V1 drafts and produces canonical V2 data. */
export const PostcardDraftSchema = z.preprocess(upgradeV1Draft, PostcardDraftV2Schema);

export type PostcardDraft = z.infer<typeof PostcardDraftSchema>;
export type PostcardPhotoSlot = z.infer<typeof PostcardPhotoSlotSchema>;
export type PostcardImageAsset = z.infer<typeof PostcardImageAssetSchema>;
export type PostcardRemixLocks = z.infer<typeof PostcardRemixLocksSchema>;

export type CreatePostcardDraftOptions = {
  recipientSlug?: PostcardIdentitySlug;
  designId?: string;
  draftId?: string;
  variationSeed?: string;
  now?: string;
  message?: string;
  senderName?: string;
};

export type RetargetPostcardDraftOptions = {
  recipientSlug?: PostcardIdentitySlug;
  designId?: string;
  /** Injectable for deterministic persistence and tests. */
  now?: string;
};

function defaultAdjustments(): z.infer<typeof PostcardImageAdjustmentsSchema> {
  return {
    exposure: 0,
    contrast: 0,
    warmth: 0,
    saturation: 0,
    filterId: null,
    filterStrength: 0,
    duotone: null,
    backgroundRemoved: false,
  };
}

function defaultPhotoSlot(position: number): PostcardPhotoSlot {
  return {
    id: `slot-${position + 1}`,
    position,
    asset: null,
    crop: { x: 0, y: 0, width: 1, height: 1 },
    focalPoint: { x: 0.5, y: 0.5 },
    zoom: 1,
    rotationDeg: 0,
    flipHorizontal: false,
    flipVertical: false,
    adjustments: defaultAdjustments(),
    mask: "template",
    border: "template",
    attachment: "template",
    caption: "",
    subjectOverlap: false,
  };
}

function safeGeneratedToken(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.().replaceAll("-", "");
  if (uuid) return `${prefix}-${uuid}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Create a complete valid V1 draft, using recipient-scoped design defaults. */
export function createPostcardDraft(options: CreatePostcardDraftOptions = {}): PostcardDraft {
  const requestedIdentity = options.recipientSlug ? postcardIdentityFor(options.recipientSlug) : null;
  const identity = requestedIdentity ?? postcardIdentityFor("ron");
  if (!identity) throw new Error("Postcard identity catalog is empty.");
  const design = identity.frontDesigns.find((candidate) => candidate.id === options.designId)
    ?? identity.frontDesigns[0];
  if (!design) throw new Error(`No postcard designs exist for ${identity.slug}.`);

  const now = options.now && ISO_INSTANT.test(options.now) ? options.now : new Date().toISOString();
  const draftId = options.draftId && SAFE_ID.test(options.draftId) ? options.draftId : safeGeneratedToken("draft");
  const variationSeed = options.variationSeed && SAFE_ID.test(options.variationSeed)
    ? options.variationSeed.slice(0, POSTCARD_LIMITS.variationSeed)
    : safeGeneratedToken("variation").slice(0, POSTCARD_LIMITS.variationSeed);

  const draft: PostcardDraft = {
    schemaVersion: POSTCARD_DRAFT_SCHEMA_VERSION,
    id: draftId,
    revision: 0,
    createdAt: now,
    updatedAt: now,
    recipientSlug: identity.slug,
    designId: design.id,
    variationSeed,
    mode: "quick",
    photoSlots: Array.from({ length: design.photoSlots }, (_, position) => defaultPhotoSlot(position)),
    remixLocks: { crop: false, colors: false, motifs: false, texture: false, edges: false, stamps: false, layout: false },
    visual: {
      palettePresetId: null,
      palette: { background: null, surface: null, ink: null, primary: null, secondary: null, highlight: null, sampleAccentFromSlotId: null },
      background: { type: "template", colors: [], angleDeg: 0 },
      layoutVariant: null,
      motifIds: [],
      texture: "template",
      edge: "template",
      frame: "template",
      stamp: { visible: true, styleId: null, position: "template", rotationDeg: 0 },
      effects: { grain: 0, halftoneDotSize: 0, scanlineDensity: 0, signalDistortion: 0, colorSeparation: 0, inkBleed: 0, registrationOffset: 0 },
    },
    fields: { headline: design.headline, caption: "", issueNumber: "", date: "", score: "", location: "", stats: [] },
    creatorFields: emptyPostcardCreatorFields(identity.slug),
    writing: {
      message: options.message ?? "",
      purpose: "freeform",
      greeting: "",
      signoff: "",
      senderName: options.senderName ?? "",
      lettering: "template",
      alignment: "left",
      paper: "template",
      senderVisibility: "full-name",
      signatureAssetId: null,
      signatureDataUrl: null,
      savedSignatureLabel: "",
      groupSigners: [],
      featuredQuote: "",
      whyMomentMattered: "",
      secondaryLanguage: "none",
      secondaryMessage: "",
      scheduledFor: null,
      contentWarnings: [],
    },
    memory: { occasion: "", happenedOn: "", location: "", people: "", favoriteMoment: "", whyItMattered: "", insideJoke: "", desiredTone: "unspecified" },
    collectible: { setId: null, releaseId: null, variantId: null, serial: null },
  };
  return PostcardDraftSchema.parse(draft);
}

function uniqueSlotId(preferred: string, used: Set<string>): string {
  if (!used.has(preferred)) return preferred;
  let suffix = 2;
  while (used.has(`${preferred}-${suffix}`)) suffix += 1;
  return `${preferred}-${suffix}`;
}

/**
 * Move a valid draft to another recipient/design without discarding the fan's
 * work. Position-compatible art and image edits survive; new positions receive
 * clean defaults. Template-owned fields and collectible issuance reset because
 * they cannot truthfully be carried to a different design.
 */
export function retargetPostcardDraft(
  value: unknown,
  options: RetargetPostcardDraftOptions,
): PostcardDraft {
  const current = PostcardDraftSchema.parse(value);
  const recipientSlug = options.recipientSlug ?? current.recipientSlug;
  const identity = postcardIdentityFor(recipientSlug);
  if (!identity) throw new RangeError(`Unknown postcard recipient: ${String(recipientSlug)}.`);

  const requestedDesignId = options.designId
    ?? (recipientSlug === current.recipientSlug ? current.designId : identity.frontDesigns[0]?.id);
  const design = identity.frontDesigns.find((candidate) => candidate.id === requestedDesignId);
  if (!design) {
    throw new RangeError(`Design ${String(requestedDesignId)} does not belong to ${recipientSlug}.`);
  }

  const updatedAt = options.now ?? new Date().toISOString();
  if (!ISO_INSTANT.test(updatedAt)) throw new RangeError("Retarget timestamp must be an ISO UTC instant.");

  const fresh = createPostcardDraft({
    recipientSlug: identity.slug,
    designId: design.id,
    draftId: current.id,
    variationSeed: current.variationSeed,
    now: updatedAt,
  });
  const slotsByPosition = new Map(current.photoSlots.map((slot) => [slot.position, slot]));
  const usedSlotIds = new Set<string>();
  const photoSlots = fresh.photoSlots.map((defaultSlot, position) => {
    const compatible = slotsByPosition.get(position);
    const preferredId = compatible?.id ?? defaultSlot.id;
    const id = uniqueSlotId(preferredId, usedSlotIds);
    usedSlotIds.add(id);
    return compatible
      ? { ...compatible, id, position }
      : { ...defaultSlot, id, position };
  });

  const recipientChanged = identity.slug !== current.recipientSlug;
  const targetMotifIds = new Set(identity.motifs.map((motif) => motif.id));
  const layoutVariant = current.visual.layoutVariant
    && identity.variation.layoutVariants.includes(current.visual.layoutVariant)
    ? current.visual.layoutVariant
    : null;
  const visual = {
    ...current.visual,
    palette: {
      ...current.visual.palette,
      sampleAccentFromSlotId: current.visual.palette.sampleAccentFromSlotId
        && usedSlotIds.has(current.visual.palette.sampleAccentFromSlotId)
        ? current.visual.palette.sampleAccentFromSlotId
        : null,
    },
    palettePresetId: recipientChanged ? null : current.visual.palettePresetId,
    motifIds: recipientChanged
      ? current.visual.motifIds.filter((motifId) => targetMotifIds.has(motifId))
      : current.visual.motifIds,
    layoutVariant,
    stamp: {
      ...current.visual.stamp,
      styleId: recipientChanged ? null : current.visual.stamp.styleId,
    },
  };

  return PostcardDraftSchema.parse({
    ...fresh,
    id: current.id,
    revision: current.revision + 1,
    createdAt: current.createdAt,
    updatedAt,
    mode: current.mode,
    photoSlots,
    remixLocks: current.remixLocks,
    visual,
    writing: current.writing,
    memory: current.memory,
    // `fields` and `collectible` intentionally remain the new design defaults.
  });
}

const LegacyPostcardInputSchema = z.object({
  recipientSlug: safeId(100),
  designId: safeId(160),
  message: safeText(POSTCARD_LIMITS.message).refine(
    (message) => message.split(/\r\n?|\n/).length <= POSTCARD_LIMITS.messageLines,
    `Message can have at most ${POSTCARD_LIMITS.messageLines} lines.`,
  ).default(""),
  imageDataUrl: z.string().max(POSTCARD_DRAFT_LIMITS.embeddedImageCharacters).nullable().optional(),
  senderName: safeText(POSTCARD_LIMITS.senderName).optional(),
  variationSeed: safeId(POSTCARD_LIMITS.variationSeed).optional(),
}).passthrough();

export type PostcardDraftMigrationResult =
  | { ok: true; draft: PostcardDraft; sourceVersion: 0 | 1 | 2; warnings: string[] }
  | { ok: false; error: string; issues: string[] };

function issuesFor(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.join(".") || "draft"}: ${issue.message}`);
}

function decodeDraftValue(value: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  if (typeof value !== "string") return { ok: true, value };
  try {
    return { ok: true, value: JSON.parse(value) as unknown };
  } catch {
    return { ok: false, error: "Draft is not valid JSON." };
  }
}

/**
 * Validate a current draft or migrate the legacy PostcardInput-shaped studio
 * state. Unknown future versions fail closed instead of losing editor data.
 */
export function migratePostcardDraft(value: unknown): PostcardDraftMigrationResult {
  const decoded = decodeDraftValue(value);
  if (!decoded.ok) return { ok: false, error: decoded.error, issues: [decoded.error] };
  const raw = decoded.value;

  if (raw && typeof raw === "object" && "schemaVersion" in raw) {
    const version = (raw as { schemaVersion?: unknown }).schemaVersion;
    if (version !== 1 && version !== POSTCARD_DRAFT_SCHEMA_VERSION) {
      const error = `Unsupported postcard draft version: ${String(version)}.`;
      return { ok: false, error, issues: [error] };
    }
    const parsed = PostcardDraftSchema.safeParse(raw);
    return parsed.success
      ? {
          ok: true,
          draft: parsed.data,
          sourceVersion: version,
          warnings: version === 1 ? ["Migrated postcard editor state from draft schema V1 to V2."] : [],
        }
      : { ok: false, error: "Postcard draft is invalid.", issues: issuesFor(parsed.error) };
  }

  const legacy = LegacyPostcardInputSchema.safeParse(raw);
  if (!legacy.success) {
    return { ok: false, error: "Postcard draft is invalid.", issues: issuesFor(legacy.error) };
  }
  const identity = postcardIdentityFor(legacy.data.recipientSlug);
  const design = identity?.frontDesigns.find((candidate) => candidate.id === legacy.data.designId);
  if (!identity || !design) {
    return { ok: false, error: "Legacy draft uses an unknown recipient or design.", issues: ["recipientSlug/designId: Unknown recipient-scoped design."] };
  }

  const draft = createPostcardDraft({
    recipientSlug: identity.slug,
    designId: design.id,
    variationSeed: legacy.data.variationSeed,
    message: legacy.data.message,
    senderName: legacy.data.senderName,
  });
  const warnings = [`Migrated legacy postcard editor state to draft schema V${POSTCARD_DRAFT_SCHEMA_VERSION}.`];
  if (legacy.data.imageDataUrl) {
    const source = PostcardImageSourceSchema.safeParse({ kind: "embedded", origin: "upload", dataUrl: legacy.data.imageDataUrl });
    if (source.success && draft.photoSlots[0]) {
      draft.photoSlots[0].asset = { id: "legacy-upload", altText: "", source: source.data };
    } else {
      warnings.push("Legacy image data was invalid and was not restored.");
    }
  }
  const parsed = PostcardDraftSchema.safeParse(draft);
  return parsed.success
    ? { ok: true, draft: parsed.data, sourceVersion: 0, warnings }
    : { ok: false, error: "Migrated postcard draft is invalid.", issues: issuesFor(parsed.error) };
}

export type PostcardDraftRestoreResult = {
  draft: PostcardDraft;
  status: "current" | "migrated" | "defaulted";
  warnings: string[];
};

/** Restore user-controlled persistence without ever returning malformed state. */
export function restorePostcardDraft(
  value: unknown,
  fallback: CreatePostcardDraftOptions = {},
): PostcardDraftRestoreResult {
  const result = migratePostcardDraft(value);
  if (result.ok) {
    return {
      draft: result.draft,
      status: result.sourceVersion === POSTCARD_DRAFT_SCHEMA_VERSION ? "current" : "migrated",
      warnings: result.warnings,
    };
  }
  return {
    draft: createPostcardDraft(fallback),
    status: "defaulted",
    warnings: [result.error, ...result.issues.filter((issue) => issue !== result.error)],
  };
}

/** Serialize only state that satisfies the complete current contract. */
export function serializePostcardDraft(draft: unknown): string {
  return JSON.stringify(PostcardDraftSchema.parse(draft));
}

/** Narrow compatibility helper for migrating state shaped like PostcardInput. */
export function migratePostcardInputToDraft(input: PostcardInput): PostcardDraftMigrationResult {
  return migratePostcardDraft(input);
}
