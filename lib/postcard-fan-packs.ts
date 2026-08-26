import { z } from "zod";
import {
  PostcardPackConfigSchema,
  PostcardPackDesignSchema,
  PostcardPackMotifSchema,
  PostcardPackPaletteSchema,
  PostcardPackPhraseSchema,
  PostcardPackPromptSchema,
} from "./postcard-pack-schema";
import {
  PostcardDraftSchema,
  retargetPostcardDraft,
  type PostcardDraft,
} from "./postcard-draft";
import { POSTCARD_LIMITS } from "./postcard";
import { postcardIdentityFor, type PostcardIdentitySlug } from "./postcard-identities";

const RECIPIENT_SLUGS = ["ron", "jason", "lacy", "marlon", "adapt"] as const;
const RecipientSlugSchema = z.enum(RECIPIENT_SLUGS);
const UuidSchema = z.string().uuid();
const SafeIdSchema = z.string().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const ContentHashSchema = z.string().regex(/^[0-9a-f]{64}$/);
const PlainTextSchema = (maximum: number, minimum = 0) => z.string().trim().min(minimum).max(maximum)
  .refine((value) => !/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value));
const HttpsUrlSchema = z.string().max(2_048).refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}, "Only credential-free HTTPS asset URLs are allowed.");

export const FanPostcardPackAssetSchema = z.object({
  id: UuidSchema,
  kind: z.enum(["sticker", "texture", "background", "frame", "overlay", "mask", "logo", "photo"]),
  url: HttpsUrlSchema,
  mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
  width: z.number().int().min(1).max(10_000),
  height: z.number().int().min(1).max(10_000),
  attribution: PlainTextSchema(300).nullable(),
}).strict();

export const FanPostcardPackDesignSchema = PostcardPackDesignSchema.extend({
  /** A catalog design with the same composition and slot topology. */
  baseDesignId: SafeIdSchema,
}).strict();

export const FanPostcardPackDropSchema = z.object({
  id: UuidSchema,
  code: z.string().regex(/^[a-z][a-z0-9-]{0,79}$/),
  title: PlainTextSchema(120, 1),
  description: PlainTextSchema(1_000).nullable(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }).nullable(),
}).strict();

export const FanPostcardPackSchema = z.object({
  packId: UuidSchema,
  revisionId: UuidSchema,
  recipientSlug: RecipientSlugSchema,
  slug: z.string().regex(/^[a-z][a-z0-9-]{0,79}$/),
  title: PlainTextSchema(120, 1),
  description: PlainTextSchema(1_000).nullable(),
  contentHash: ContentHashSchema,
  publishedAt: z.string().datetime({ offset: true }),
  palettes: z.array(PostcardPackPaletteSchema).min(1).max(12),
  motifs: z.array(PostcardPackMotifSchema).max(48),
  prompts: z.array(PostcardPackPromptSchema).max(24),
  phrases: z.array(PostcardPackPhraseSchema).max(64),
  designs: z.array(FanPostcardPackDesignSchema).min(1).max(24),
  assets: z.array(FanPostcardPackAssetSchema).max(48),
  activeDrops: z.array(FanPostcardPackDropSchema).max(12),
}).strict();

export const FanPostcardPackCatalogSchema = z.object({
  available: z.boolean(),
  recipientSlug: RecipientSlugSchema,
  packs: z.array(FanPostcardPackSchema).max(12),
}).strict();

export type FanPostcardPackAsset = z.infer<typeof FanPostcardPackAssetSchema>;
export type FanPostcardPackDesign = z.infer<typeof FanPostcardPackDesignSchema>;
export type FanPostcardPack = z.infer<typeof FanPostcardPackSchema>;
export type FanPostcardPackCatalog = z.infer<typeof FanPostcardPackCatalogSchema>;

export type FanPostcardPackSource = {
  packId: string;
  revisionId: string;
  publishedRevisionId: string | null;
  memberSlug: string;
  packState: string;
  revisionState: string;
  slug: string;
  title: string;
  description: string | null;
  contentHash: string;
  publishedAt: string | null;
  config: unknown;
};

export type FanPostcardDropSource = {
  id: string;
  packId: string;
  revisionId: string;
  memberSlug: string;
  code: string;
  title: string;
  description: string | null;
  state: string;
  startsAt: string;
  endsAt: string | null;
};

export type FanPostcardAssetSource = {
  id: string;
  packId: string;
  memberSlug: string;
  kind: string;
  publicUrl: string | null;
  mime: string;
  width: number;
  height: number;
  attribution: string | null;
  moderationState: string;
  rightsAttested: boolean;
  rightsSource: string;
};

const PackSourceSchema = z.object({
  packId: UuidSchema,
  revisionId: UuidSchema,
  publishedRevisionId: UuidSchema.nullable(),
  memberSlug: RecipientSlugSchema,
  packState: z.string(),
  revisionState: z.string(),
  slug: z.string().regex(/^[a-z][a-z0-9-]{0,79}$/),
  title: PlainTextSchema(120, 1),
  description: PlainTextSchema(1_000).nullable(),
  contentHash: ContentHashSchema,
  publishedAt: z.string().datetime({ offset: true }).nullable(),
  config: z.unknown(),
}).strict();

const DropSourceSchema = z.object({
  id: UuidSchema,
  packId: UuidSchema,
  revisionId: UuidSchema,
  memberSlug: RecipientSlugSchema,
  code: z.string().regex(/^[a-z][a-z0-9-]{0,79}$/),
  title: PlainTextSchema(120, 1),
  description: PlainTextSchema(1_000).nullable(),
  state: z.string(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }).nullable(),
}).strict();

const AssetSourceSchema = z.object({
  id: UuidSchema,
  packId: UuidSchema,
  memberSlug: RecipientSlugSchema,
  kind: z.string(),
  publicUrl: HttpsUrlSchema.nullable(),
  mime: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  attribution: PlainTextSchema(300).nullable(),
  moderationState: z.string(),
  rightsAttested: z.boolean(),
  rightsSource: z.string(),
}).strict();

/**
 * Build the public catalog from database rows. Every state/scope/window check
 * is repeated here so a future SQL refactor cannot accidentally publish a
 * draft, another member's content, an expired drop, or an unapproved asset.
 */
export function projectFanPostcardPackCatalog(
  recipientValue: string,
  packSources: readonly FanPostcardPackSource[],
  dropSources: readonly FanPostcardDropSource[],
  assetSources: readonly FanPostcardAssetSource[],
  nowValue = new Date().toISOString(),
): FanPostcardPackCatalog {
  const recipientSlug = RecipientSlugSchema.parse(recipientValue);
  const now = Date.parse(nowValue);
  if (!Number.isFinite(now)) throw new RangeError("Catalog time must be a valid ISO instant.");
  const identity = postcardIdentityFor(recipientSlug);
  if (!identity) return { available: true, recipientSlug, packs: [] };

  const packs: FanPostcardPack[] = [];
  for (const rawSource of packSources) {
    if (packs.length >= 12) break;
    const parsedSource = PackSourceSchema.safeParse(rawSource);
    if (!parsedSource.success) continue;
    const source = parsedSource.data;
    if (
      source.memberSlug !== recipientSlug
      || source.packState !== "active"
      || source.revisionState !== "published"
      || source.publishedRevisionId !== source.revisionId
      || !source.publishedAt
    ) continue;

    const parsedConfig = PostcardPackConfigSchema.safeParse(source.config);
    if (!parsedConfig.success) continue;
    const config = parsedConfig.data;
    const designs = config.designs.flatMap((design) => {
      const base = identity.frontDesigns.find((candidate) => (
        candidate.composition === design.composition
        && candidate.photoSlots === design.photoSlots
      ));
      return base ? [{ ...design, baseDesignId: base.id }] : [];
    });
    if (designs.length === 0) continue;

    const referencedAssetIds = new Set([
      ...config.motifs.flatMap((motif) => motif.assetId ? [motif.assetId] : []),
      ...designs.flatMap((design) => design.assetIds),
    ]);
    const assets = assetSources.flatMap((rawAsset) => {
      if (rawAsset.packId !== source.packId || rawAsset.memberSlug !== recipientSlug) return [];
      const parsedAsset = AssetSourceSchema.safeParse(rawAsset);
      if (!parsedAsset.success) return [];
      const asset = parsedAsset.data;
      if (
        !referencedAssetIds.has(asset.id)
        || asset.moderationState !== "approved"
        || !asset.rightsAttested
        || asset.rightsSource === "unknown"
        || !asset.publicUrl
      ) return [];
      const projected = FanPostcardPackAssetSchema.safeParse({
        id: asset.id,
        kind: asset.kind,
        url: asset.publicUrl,
        mime: asset.mime,
        width: asset.width,
        height: asset.height,
        attribution: asset.attribution,
      });
      return projected.success ? [projected.data] : [];
    }).slice(0, 48);
    const safeAssetIds = new Set(assets.map((asset) => asset.id));
    const motifs = config.motifs.flatMap((motif) => {
      if (motif.assetId && !safeAssetIds.has(motif.assetId) && !motif.mark) return [];
      return [{ ...motif, assetId: motif.assetId && safeAssetIds.has(motif.assetId) ? motif.assetId : undefined }];
    });
    const motifIds = new Set(motifs.map((motif) => motif.id));
    const safeDesigns = designs.map((design) => ({
      ...design,
      motifIds: design.motifIds.filter((id) => motifIds.has(id)),
      assetIds: design.assetIds.filter((id) => safeAssetIds.has(id)),
    }));

    const activeDrops = dropSources.flatMap((rawDrop) => {
      const parsedDrop = DropSourceSchema.safeParse(rawDrop);
      if (!parsedDrop.success) return [];
      const drop = parsedDrop.data;
      const startsAt = Date.parse(drop.startsAt);
      const endsAt = drop.endsAt ? Date.parse(drop.endsAt) : null;
      if (
        drop.memberSlug !== recipientSlug
        || drop.packId !== source.packId
        || drop.revisionId !== source.revisionId
        || drop.state !== "scheduled"
        || startsAt > now
        || (endsAt !== null && endsAt <= now)
      ) return [];
      return [{
        id: drop.id,
        code: drop.code,
        title: drop.title,
        description: drop.description,
        startsAt: drop.startsAt,
        endsAt: drop.endsAt,
      }];
    }).slice(0, 12);

    const projected = FanPostcardPackSchema.safeParse({
      packId: source.packId,
      revisionId: source.revisionId,
      recipientSlug,
      slug: source.slug,
      title: source.title,
      description: source.description,
      contentHash: source.contentHash,
      publishedAt: source.publishedAt,
      palettes: config.palettes,
      motifs,
      prompts: config.prompts,
      phrases: config.phrases,
      designs: safeDesigns,
      assets,
      activeDrops,
    });
    if (projected.success) packs.push(projected.data);
  }
  return { available: true, recipientSlug, packs };
}

/** Materialize an approved pack design into ordinary draft fields. */
export function applyFanPostcardPackDesign(
  value: unknown,
  packValue: unknown,
  packDesignId: string,
): PostcardDraft {
  const draft = PostcardDraftSchema.parse(value);
  const pack = FanPostcardPackSchema.parse(packValue);
  if (pack.recipientSlug !== draft.recipientSlug) {
    throw new RangeError("This design pack belongs to a different postcard recipient.");
  }
  const design = pack.designs.find((candidate) => candidate.id === packDesignId);
  if (!design) throw new RangeError("This design is not available in the selected pack.");
  const palette = pack.palettes.find((candidate) => design.paletteIds.includes(candidate.id));
  if (!palette) throw new RangeError("This pack design has no approved palette.");
  const retargeted = retargetPostcardDraft(draft, {
    recipientSlug: draft.recipientSlug,
    designId: design.baseDesignId,
  });
  const defaults = new Map(design.fields.flatMap((field) => (
    field.defaultValue ? [[field.key, field.defaultValue] as const] : []
  )));
  const identity = postcardIdentityFor(draft.recipientSlug);
  const nativeMotifs = new Set(identity?.motifs.map((motif) => motif.id) ?? []);
  const stats = design.fields.flatMap((field) => {
    if ((field.key !== "primaryStat" && field.key !== "secondaryStat") || !field.defaultValue) return [];
    return [{ id: `pack-${field.key}`, label: field.label, value: field.defaultValue }];
  });
  const backgroundType = design.backgroundStyle === "radial"
    ? "radial-gradient"
    : design.backgroundStyle;
  return PostcardDraftSchema.parse({
    ...retargeted,
    visual: {
      ...retargeted.visual,
      palettePresetId: null,
      palette: {
        background: palette.background,
        surface: palette.surface,
        ink: palette.ink,
        primary: palette.primary,
        secondary: palette.secondary,
        highlight: palette.highlight,
        sampleAccentFromSlotId: null,
      },
      background: {
        type: backgroundType,
        colors: design.backgroundStyle === "solid"
          ? [palette.background]
          : [palette.background, palette.primary, palette.highlight],
        angleDeg: design.gradientDirection ?? 0,
      },
      motifIds: design.motifIds.filter((id) => nativeMotifs.has(id)).slice(0, 12),
      edge: design.edgeTreatments[0] ?? "template",
      frame: design.frameStyles[0] ?? "template",
    },
    photoSlots: retargeted.photoSlots.map((slot) => ({
      ...slot,
      attachment: design.attachmentStyles[0] ?? "template",
    })),
    fields: {
      ...retargeted.fields,
      headline: defaults.get("headline") ?? retargeted.fields.headline,
      caption: defaults.get("caption") ?? "",
      issueNumber: defaults.get("issueNumber") ?? "",
      date: defaults.get("date") ?? "",
      score: defaults.get("score") ?? "",
      location: defaults.get("location") ?? "",
      stats,
    },
    // Server-issued collectible proof can never carry between designs.
    collectible: { setId: null, releaseId: null, variantId: null, serial: null },
  });
}

/** Apply one creator-owned, approved pack asset to a photo slot. */
export function applyFanPostcardPackAsset(
  value: unknown,
  packValue: unknown,
  packDesignId: string,
  assetId: string,
  position: number,
): PostcardDraft {
  const draft = PostcardDraftSchema.parse(value);
  const pack = FanPostcardPackSchema.parse(packValue);
  if (pack.recipientSlug !== draft.recipientSlug) {
    throw new RangeError("This asset belongs to a different postcard recipient.");
  }
  const design = pack.designs.find((candidate) => candidate.id === packDesignId);
  const asset = pack.assets.find((candidate) => candidate.id === assetId);
  const motifAssetIds = new Set(pack.motifs.flatMap((motif) => (
    design?.motifIds.includes(motif.id) && motif.assetId ? [motif.assetId] : []
  )));
  if (!design || !asset || (!design.assetIds.includes(asset.id) && !motifAssetIds.has(asset.id))) {
    throw new RangeError("This asset is not approved for the selected pack design.");
  }
  if (draft.designId !== design.baseDesignId) {
    throw new RangeError("Apply this pack design before adding its artwork.");
  }
  if (!draft.photoSlots.some((slot) => slot.position === position)) {
    throw new RangeError("Photo slot is not available in this design.");
  }
  return PostcardDraftSchema.parse({
    ...draft,
    photoSlots: draft.photoSlots.map((slot) => slot.position === position ? {
      ...slot,
      asset: {
        id: `pack-asset-${asset.id}`,
        altText: asset.attribution ? `Creator artwork · ${asset.attribution}` : "Creator-approved artwork",
        source: {
          kind: "managed",
          origin: "upload",
          assetId: asset.id,
          previewUrl: asset.url,
        },
      },
    } : slot),
  });
}

/** Apply one of the selected design's creator-approved palette variations. */
export function applyFanPostcardPackPalette(
  value: unknown,
  packValue: unknown,
  packDesignId: string,
  paletteId: string,
): PostcardDraft {
  const draft = PostcardDraftSchema.parse(value);
  const pack = FanPostcardPackSchema.parse(packValue);
  const design = pack.designs.find((candidate) => candidate.id === packDesignId);
  const palette = pack.palettes.find((candidate) => candidate.id === paletteId);
  if (
    pack.recipientSlug !== draft.recipientSlug
    || !design
    || draft.designId !== design.baseDesignId
    || !palette
    || !design.paletteIds.includes(palette.id)
  ) throw new RangeError("This palette is not approved for the selected pack design.");
  return PostcardDraftSchema.parse({
    ...draft,
    visual: {
      ...draft.visual,
      palettePresetId: null,
      palette: {
        background: palette.background,
        surface: palette.surface,
        ink: palette.ink,
        primary: palette.primary,
        secondary: palette.secondary,
        highlight: palette.highlight,
        sampleAccentFromSlotId: null,
      },
      background: {
        ...draft.visual.background,
        colors: design.backgroundStyle === "solid"
          ? [palette.background]
          : [palette.background, palette.primary, palette.highlight],
      },
    },
  });
}

/** Place a creator-authored text mark in the printable caption overlay. */
export function applyFanPostcardPackMotif(
  value: unknown,
  packValue: unknown,
  packDesignId: string,
  motifId: string,
): PostcardDraft {
  const draft = PostcardDraftSchema.parse(value);
  const pack = FanPostcardPackSchema.parse(packValue);
  if (pack.recipientSlug !== draft.recipientSlug) {
    throw new RangeError("This mark belongs to a different postcard recipient.");
  }
  const design = pack.designs.find((candidate) => candidate.id === packDesignId);
  const motif = pack.motifs.find((candidate) => candidate.id === motifId);
  if (!design || !motif || !design.motifIds.includes(motif.id) || !motif.mark) {
    throw new RangeError("This text mark is not approved for the selected pack design.");
  }
  const caption = draft.fields.caption.trim()
    ? `${draft.fields.caption.trim()} · ${motif.mark}`
    : motif.mark;
  return PostcardDraftSchema.parse({
    ...draft,
    fields: { ...draft.fields, caption: caption.slice(0, 240) },
  });
}

/** Insert a bounded published phrase while preserving the draft schema. */
export function applyFanPostcardPhrase(value: unknown, phraseValue: unknown): PostcardDraft {
  const draft = PostcardDraftSchema.parse(value);
  const phrase = PostcardPackPhraseSchema.parse(phraseValue);
  const combined = draft.writing.message.trim()
    ? `${draft.writing.message.trim()}\n${phrase.text}`
    : phrase.text;
  const message = combined
    .slice(0, POSTCARD_LIMITS.message)
    .split(/\r\n?|\n/)
    .slice(0, POSTCARD_LIMITS.messageLines)
    .join("\n");
  const purpose = phrase.category === "celebration"
    ? "congratulations"
    : phrase.category === "other" ? "freeform" : phrase.category;
  return PostcardDraftSchema.parse({
    ...draft,
    writing: { ...draft.writing, message, purpose },
  });
}

export function isPostcardPackRecipient(value: string): value is PostcardIdentitySlug {
  return RecipientSlugSchema.safeParse(value).success;
}
