/** Deterministic, side-effect-free remix trays for a validated postcard draft. */
import { z } from "zod";
import {
  PostcardDraftSchema,
  type PostcardDraft,
  type PostcardPhotoSlot,
} from "./postcard-draft";
import {
  hashPostcardSeed,
  postcardIdentityFor,
  seededPostcardUnit,
  type PostcardArchetype,
} from "./postcard-identities";

export const POSTCARD_REMIX_ALGORITHM_VERSION = 1 as const;
export const POSTCARD_REMIX_COUNT = 6 as const;

const SAFE_SEED = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const RemixSeedSchema = z.string().min(1).max(80).regex(SAFE_SEED);

export const PostcardRemixDimensionSchema = z.enum([
  "crop",
  "colors",
  "motifs",
  "texture",
  "edges",
  "stamps",
  "layout",
]);

export const PostcardRemixAlternativeSchema = z.object({
  algorithmVersion: z.literal(POSTCARD_REMIX_ALGORITHM_VERSION),
  id: z.string().min(1).max(100).regex(SAFE_SEED),
  index: z.number().int().min(0).max(POSTCARD_REMIX_COUNT - 1),
  seed: RemixSeedSchema,
  baseDraftId: z.string().min(1).max(160).regex(SAFE_SEED),
  baseRevision: z.number().int().nonnegative(),
  baseFingerprint: z.number().int().nonnegative(),
  changed: z.array(PostcardRemixDimensionSchema).max(7),
  preview: PostcardDraftSchema,
}).strict().superRefine((alternative, context) => {
  if (alternative.preview.id !== alternative.baseDraftId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["preview", "id"], message: "Preview belongs to another draft." });
  }
  if (alternative.preview.revision !== alternative.baseRevision) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["preview", "revision"], message: "Preview revision is stale." });
  }
  if (new Set(alternative.changed).size !== alternative.changed.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["changed"], message: "Changed dimensions must be unique." });
  }
});

export type PostcardRemixDimension = z.infer<typeof PostcardRemixDimensionSchema>;
export type PostcardRemixAlternative = z.infer<typeof PostcardRemixAlternativeSchema>;
export type PostcardRemixTray = readonly [
  PostcardRemixAlternative,
  PostcardRemixAlternative,
  PostcardRemixAlternative,
  PostcardRemixAlternative,
  PostcardRemixAlternative,
  PostcardRemixAlternative,
];

export type GeneratePostcardRemixesOptions = {
  /** Change this safe token to intentionally request another deterministic tray. */
  seed?: string;
};

export type ApplyPostcardRemixOptions = {
  /** Injectable so applying a preview remains testable and persistence-friendly. */
  now?: string;
};

type Texture = PostcardDraft["visual"]["texture"];
type Edge = PostcardDraft["visual"]["edge"];
type Frame = PostcardDraft["visual"]["frame"];
type BackgroundType = PostcardDraft["visual"]["background"]["type"];
type SlotMask = PostcardPhotoSlot["mask"];
type SlotBorder = PostcardPhotoSlot["border"];
type SlotAttachment = PostcardPhotoSlot["attachment"];

const TEXTURES: Readonly<Record<PostcardArchetype, readonly Texture[]>> = {
  "broadcast-freeze-frame": ["crt", "grain", "smooth", "none"],
  "creator-trading-card": ["smooth", "grain", "halftone", "none"],
  "newspaper-front-page": ["newsprint", "halftone", "grain", "paper-fibers"],
  "editorial-magazine": ["smooth", "grain", "halftone", "none"],
  "scrapbook-contact-sheet": ["paper-fibers", "grain", "smooth", "none"],
};

const EDGES: Readonly<Record<PostcardArchetype, readonly Edge[]>> = {
  "broadcast-freeze-frame": ["clean", "worn", "inked"],
  "creator-trading-card": ["rounded", "clean", "inked"],
  "newspaper-front-page": ["worn", "deckled", "inked", "clean"],
  "editorial-magazine": ["clean", "inked", "rounded"],
  "scrapbook-contact-sheet": ["deckled", "worn", "rounded", "clean"],
};

const FRAMES: Readonly<Record<PostcardArchetype, readonly Frame[]>> = {
  "broadcast-freeze-frame": ["full-bleed", "keyline", "frameless"],
  "creator-trading-card": ["collector", "keyline", "full-bleed"],
  "newspaper-front-page": ["keyline", "frameless", "full-bleed"],
  "editorial-magazine": ["full-bleed", "frameless", "keyline"],
  "scrapbook-contact-sheet": ["keyline", "collector", "frameless"],
};

const MASKS: Readonly<Record<PostcardArchetype, readonly SlotMask[]>> = {
  "broadcast-freeze-frame": ["monitor", "rectangle", "template"],
  "creator-trading-card": ["shield", "arch", "rectangle", "template"],
  "newspaper-front-page": ["torn-paper", "rectangle", "ticket", "template"],
  "editorial-magazine": ["arch", "rectangle", "circle", "template"],
  "scrapbook-contact-sheet": ["torn-paper", "rectangle", "circle", "template"],
};

const BORDERS: Readonly<Record<PostcardArchetype, readonly SlotBorder[]>> = {
  "broadcast-freeze-frame": ["neon", "thin", "heavy", "none"],
  "creator-trading-card": ["double", "heavy", "thin", "none"],
  "newspaper-front-page": ["distressed", "thin", "none"],
  "editorial-magazine": ["thin", "heavy", "none"],
  "scrapbook-contact-sheet": ["distressed", "thin", "none"],
};

const ATTACHMENTS: Readonly<Record<PostcardArchetype, readonly SlotAttachment[]>> = {
  "broadcast-freeze-frame": ["brackets", "tape", "none"],
  "creator-trading-card": ["photo-corners", "brackets", "none"],
  "newspaper-front-page": ["staples", "clips", "tape"],
  "editorial-magazine": ["clips", "brackets", "none"],
  "scrapbook-contact-sheet": ["tape", "clips", "photo-corners", "staples"],
};

const BACKGROUNDS: readonly Exclude<BackgroundType, "template">[] = [
  "solid",
  "linear-gradient",
  "radial-gradient",
  "striped",
  "grid",
  "checker",
  "starburst",
];

function cyclePick<T>(
  values: readonly T[],
  seed: string,
  alternativeIndex: number,
  channel: string,
  stride = 1,
): T {
  if (values.length === 0) throw new RangeError(`Empty remix catalog for ${channel}.`);
  const offset = hashPostcardSeed(seed, channel) % values.length;
  return values[(offset + alternativeIndex * stride) % values.length]!;
}

function seededRange(
  seed: string,
  alternativeIndex: number,
  channel: string,
  minimum: number,
  maximum: number,
  decimals = 3,
): number {
  const unit = seededPostcardUnit(`${seed}:${alternativeIndex}`, channel);
  const value = minimum + (maximum - minimum) * unit;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function remixFingerprint(draft: PostcardDraft): number {
  return hashPostcardSeed(JSON.stringify(draft), "postcard-remix-base");
}

function remixCrops(draft: PostcardDraft, seed: string, alternativeIndex: number): void {
  const identity = postcardIdentityFor(draft.recipientSlug)!;
  for (const slot of draft.photoSlots) {
    const channel = `slot-${slot.position}`;
    const width = seededRange(seed, alternativeIndex, `${channel}:crop-width`, 0.78, 0.98);
    const height = seededRange(seed, alternativeIndex, `${channel}:crop-height`, 0.78, 0.98);
    slot.crop = {
      x: seededRange(seed, alternativeIndex, `${channel}:crop-x`, 0, 1 - width),
      y: seededRange(seed, alternativeIndex, `${channel}:crop-y`, 0, 1 - height),
      width,
      height,
    };
    slot.focalPoint = {
      x: seededRange(seed, alternativeIndex, `${channel}:focal-x`, 0.25, 0.75),
      y: seededRange(seed, alternativeIndex, `${channel}:focal-y`, 0.25, 0.75),
    };
    slot.zoom = seededRange(seed, alternativeIndex, `${channel}:zoom`, 1, 1.45, 2);
    slot.rotationDeg = seededRange(
      seed,
      alternativeIndex,
      `${channel}:rotation`,
      identity.variation.artworkRotationRangeDeg[0],
      identity.variation.artworkRotationRangeDeg[1],
      2,
    );
    slot.flipHorizontal = cyclePick([false, false, false, true], seed, alternativeIndex, `${channel}:flip-horizontal`);
    slot.flipVertical = false;
  }
}

function remixColors(draft: PostcardDraft, seed: string, alternativeIndex: number): void {
  const identity = postcardIdentityFor(draft.recipientSlug)!;
  const design = identity.frontDesigns.find((candidate) => candidate.id === draft.designId)!;
  const palette = identity.palette;
  const primaryChoices = [palette.primary, palette.secondary, palette.highlight, design.print.accent];
  const surfaceChoices = [palette.surface, palette.background, design.print.background];
  const inkChoices = [palette.ink, design.print.ink];
  const primary = cyclePick(primaryChoices, seed, alternativeIndex, "color-primary");
  const secondary = cyclePick(primaryChoices, seed, alternativeIndex, "color-secondary", 2);
  const highlight = cyclePick(primaryChoices, seed, alternativeIndex, "color-highlight", 3);
  const background = cyclePick(surfaceChoices, seed, alternativeIndex, "color-background");
  const surface = cyclePick(surfaceChoices, seed, alternativeIndex, "color-surface", 2);
  const ink = cyclePick(inkChoices, seed, alternativeIndex, "color-ink");
  const backgroundType = cyclePick(BACKGROUNDS, seed, alternativeIndex, "background-type");

  draft.visual.palettePresetId = null;
  draft.visual.palette = {
    background,
    surface,
    ink,
    primary,
    secondary,
    highlight,
    sampleAccentFromSlotId: null,
  };
  draft.visual.background = {
    type: backgroundType,
    colors: backgroundType === "solid" ? [background] : [background, primary],
    angleDeg: seededRange(seed, alternativeIndex, "background-angle", 0, 360, 1),
  };
}

function remixMotifs(draft: PostcardDraft, seed: string, alternativeIndex: number): void {
  const identity = postcardIdentityFor(draft.recipientSlug)!;
  const primary = cyclePick(identity.motifs, seed, alternativeIndex, "motif-primary");
  const remaining = identity.motifs.filter((motif) => motif.id !== primary.id);
  const secondary = cyclePick(remaining, seed, alternativeIndex, "motif-secondary", 2);
  const tertiaryPool = remaining.filter((motif) => motif.id !== secondary.id);
  const tertiary = cyclePick(tertiaryPool, seed, alternativeIndex, "motif-tertiary", 3);
  draft.visual.motifIds = [primary.id, secondary.id, tertiary.id];
}

function remixTexture(draft: PostcardDraft, seed: string, alternativeIndex: number): void {
  const identity = postcardIdentityFor(draft.recipientSlug)!;
  const texture = cyclePick(TEXTURES[identity.archetype], seed, alternativeIndex, "texture");
  draft.visual.texture = texture;
  draft.visual.effects = {
    grain: seededRange(seed, alternativeIndex, "effect-grain", identity.variation.grainOpacityRange[0], identity.variation.grainOpacityRange[1]),
    halftoneDotSize: texture === "halftone" || texture === "newsprint"
      ? seededRange(seed, alternativeIndex, "effect-halftone", 0.2, 0.85)
      : 0,
    scanlineDensity: texture === "crt"
      ? seededRange(seed, alternativeIndex, "effect-scanlines", 0.2, 0.9)
      : 0,
    signalDistortion: texture === "crt"
      ? seededRange(seed, alternativeIndex, "effect-distortion", 0.04, 0.45)
      : 0,
    colorSeparation: seededRange(seed, alternativeIndex, "effect-separation", 0, 0.35),
    inkBleed: seededRange(seed, alternativeIndex, "effect-ink-bleed", identity.variation.inkBleedRangePx[0], identity.variation.inkBleedRangePx[1]),
    registrationOffset: seededRange(seed, alternativeIndex, "effect-registration", 0, 0.4),
  };
}

function remixEdges(draft: PostcardDraft, seed: string, alternativeIndex: number): void {
  const identity = postcardIdentityFor(draft.recipientSlug)!;
  draft.visual.edge = cyclePick(EDGES[identity.archetype], seed, alternativeIndex, "edge");
  draft.visual.frame = cyclePick(FRAMES[identity.archetype], seed, alternativeIndex, "frame", 2);
  for (const slot of draft.photoSlots) {
    slot.mask = cyclePick(MASKS[identity.archetype], seed, alternativeIndex, `slot-${slot.position}:mask`);
    slot.border = cyclePick(BORDERS[identity.archetype], seed, alternativeIndex, `slot-${slot.position}:border`, 2);
  }
}

function remixStamp(draft: PostcardDraft, seed: string, alternativeIndex: number): void {
  const identity = postcardIdentityFor(draft.recipientSlug)!;
  const minimum = Math.max(-30, identity.postage.stamp.rotationRangeDeg[0]);
  const maximum = Math.min(30, identity.postage.stamp.rotationRangeDeg[1]);
  draft.visual.stamp = {
    visible: true,
    styleId: identity.postage.stamp.treatment,
    position: cyclePick(identity.postage.postmark.positions, seed, alternativeIndex, "stamp-position"),
    rotationDeg: seededRange(seed, alternativeIndex, "stamp-rotation", minimum, maximum, 2),
  };
}

function remixLayout(draft: PostcardDraft, seed: string, alternativeIndex: number): void {
  const identity = postcardIdentityFor(draft.recipientSlug)!;
  draft.visual.layoutVariant = cyclePick(identity.variation.layoutVariants, seed, alternativeIndex, "layout-variant");
  for (const slot of draft.photoSlots) {
    slot.attachment = cyclePick(
      ATTACHMENTS[identity.archetype],
      seed,
      alternativeIndex,
      `slot-${slot.position}:attachment`,
      slot.position + 1,
    );
  }
}

function cropSlice(draft: PostcardDraft) {
  return draft.photoSlots.map((slot) => ({
    crop: slot.crop,
    focalPoint: slot.focalPoint,
    zoom: slot.zoom,
    rotationDeg: slot.rotationDeg,
    flipHorizontal: slot.flipHorizontal,
    flipVertical: slot.flipVertical,
  }));
}

function edgeSlice(draft: PostcardDraft) {
  return {
    edge: draft.visual.edge,
    frame: draft.visual.frame,
    slots: draft.photoSlots.map((slot) => ({ mask: slot.mask, border: slot.border })),
  };
}

function layoutSlice(draft: PostcardDraft) {
  return {
    layoutVariant: draft.visual.layoutVariant,
    attachments: draft.photoSlots.map((slot) => slot.attachment),
  };
}

function dimensionSlice(draft: PostcardDraft, dimension: PostcardRemixDimension): unknown {
  switch (dimension) {
    case "crop": return cropSlice(draft);
    case "colors": return { palettePresetId: draft.visual.palettePresetId, palette: draft.visual.palette, background: draft.visual.background };
    case "motifs": return draft.visual.motifIds;
    case "texture": return { texture: draft.visual.texture, effects: draft.visual.effects };
    case "edges": return edgeSlice(draft);
    case "stamps": return draft.visual.stamp;
    case "layout": return layoutSlice(draft);
  }
}

const DIMENSIONS = PostcardRemixDimensionSchema.options;

/** Generate the six preview choices shown in a remix tray. Never mutates input. */
export function generatePostcardRemixes(
  value: unknown,
  options: GeneratePostcardRemixesOptions = {},
): PostcardRemixTray {
  const base = PostcardDraftSchema.parse(value);
  const seed = RemixSeedSchema.parse(options.seed ?? base.variationSeed);
  const baseFingerprint = remixFingerprint(base);

  const alternatives = Array.from({ length: POSTCARD_REMIX_COUNT }, (_, alternativeIndex) => {
    const preview = PostcardDraftSchema.parse(base);
    const before = new Map(DIMENSIONS.map((dimension) => [dimension, dimensionSlice(base, dimension)]));

    if (!base.remixLocks.crop) remixCrops(preview, seed, alternativeIndex);
    if (!base.remixLocks.colors) remixColors(preview, seed, alternativeIndex);
    if (!base.remixLocks.motifs) remixMotifs(preview, seed, alternativeIndex);
    if (!base.remixLocks.texture) remixTexture(preview, seed, alternativeIndex);
    if (!base.remixLocks.edges) remixEdges(preview, seed, alternativeIndex);
    if (!base.remixLocks.stamps) remixStamp(preview, seed, alternativeIndex);
    if (!base.remixLocks.layout) remixLayout(preview, seed, alternativeIndex);

    const validatedPreview = PostcardDraftSchema.parse(preview);
    const changed = DIMENSIONS.filter((dimension) =>
      !sameValue(before.get(dimension), dimensionSlice(validatedPreview, dimension)));
    const idHash = hashPostcardSeed(
      `${base.id}:${base.revision}:${baseFingerprint}:${seed}:${alternativeIndex}`,
      "postcard-remix-id",
    );
    return PostcardRemixAlternativeSchema.parse({
      algorithmVersion: POSTCARD_REMIX_ALGORITHM_VERSION,
      id: `remix-${idHash.toString(36)}`,
      index: alternativeIndex,
      seed,
      baseDraftId: base.id,
      baseRevision: base.revision,
      baseFingerprint,
      changed,
      preview: validatedPreview,
    });
  });

  // Array.from cannot express a fixed length to TypeScript, but the literal
  // POSTCARD_REMIX_COUNT above is the sole constructor for this value.
  return alternatives as unknown as PostcardRemixTray;
}

/**
 * Apply one generated preview. The alternative is regenerated and compared so
 * stale or caller-mutated preview data cannot bypass locks or change assets.
 */
export function applyPostcardRemix(
  value: unknown,
  alternativeValue: unknown,
  options: ApplyPostcardRemixOptions = {},
): PostcardDraft {
  const base = PostcardDraftSchema.parse(value);
  const alternative = PostcardRemixAlternativeSchema.parse(alternativeValue);
  const fingerprint = remixFingerprint(base);
  if (
    alternative.baseDraftId !== base.id
    || alternative.baseRevision !== base.revision
    || alternative.baseFingerprint !== fingerprint
  ) {
    throw new RangeError("This postcard remix is stale or belongs to another draft.");
  }

  const expected = generatePostcardRemixes(base, { seed: alternative.seed })[alternative.index]!;
  if (expected.id !== alternative.id || !sameValue(expected.preview, alternative.preview)) {
    throw new RangeError("This postcard remix was modified after it was generated.");
  }

  const updatedAt = options.now ?? new Date().toISOString();
  const result = {
    ...expected.preview,
    revision: base.revision + 1,
    createdAt: base.createdAt,
    updatedAt,
  };
  return PostcardDraftSchema.parse(result);
}
