import { z } from "zod";

const SAFE_TEXT = /^[^<>\u0000-\u001f\u007f]*$/;
const Code = z.string().regex(/^[a-z][a-z0-9-]{0,79}$/);
const MemberSlug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
const Uuid = z.string().uuid();

function plainText(min: number, max: number) {
  return z.string().trim().min(min).max(max).regex(
    SAFE_TEXT,
    "Markup and control characters are not allowed.",
  );
}

export const POSTCARD_COLLECTIBLE_BUNDLE_MODES = [
  "single",
  "send_one_keep_one",
] as const;

export const PostcardCollectibleBundleMetadataSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("single"),
    sendQuantity: z.literal(1),
    keepQuantity: z.literal(0),
    inventoryQuantity: z.literal(1),
  }).strict(),
  z.object({
    mode: z.literal("send_one_keep_one"),
    sendQuantity: z.literal(1),
    keepQuantity: z.literal(1),
    inventoryQuantity: z.literal(2),
  }).strict(),
]);

export const PostcardCollectibleVariantDefinitionSchema = z.object({
  code: Code,
  title: plainText(1, 80),
  maxSupply: z.number().int().min(1).max(1_000_000).nullable().optional(),
  sortOrder: z.number().int().min(0).max(10_000),
}).strict();

export const PostcardCollectibleReleaseDefinitionSchema = z.object({
  code: Code,
  title: plainText(1, 120),
  description: plainText(0, 1_000).nullable().optional(),
  packRevisionId: Uuid,
  designId: Code,
  serialPrefix: z.string().regex(/^[A-Z0-9]{1,12}$/),
  maxSupply: z.number().int().min(1).max(1_000_000),
  setPosition: z.number().int().min(1).max(10_000),
  requiredForCompletion: z.boolean(),
  availableFrom: z.string().datetime({ offset: true }).nullable().optional(),
  availableUntil: z.string().datetime({ offset: true }).nullable().optional(),
  variants: z.array(PostcardCollectibleVariantDefinitionSchema).min(1).max(12),
}).strict().superRefine((release, context) => {
  if (
    release.availableFrom
    && release.availableUntil
    && Date.parse(release.availableUntil) <= Date.parse(release.availableFrom)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["availableUntil"],
      message: "Release end time must be after its start time.",
    });
  }

  const codes = new Set<string>();
  release.variants.forEach((variant, index) => {
    if (codes.has(variant.code)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["variants", index, "code"],
        message: "Variant codes must be unique within a release.",
      });
    }
    codes.add(variant.code);
    if (variant.maxSupply != null && variant.maxSupply > release.maxSupply) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["variants", index, "maxSupply"],
        message: "Variant supply cannot exceed the release supply.",
      });
    }
  });
});

export const PostcardCollectibleSetDefinitionSchema = z.object({
  memberSlug: MemberSlug,
  code: Code,
  title: plainText(1, 120),
  description: plainText(0, 1_000).nullable().optional(),
  releases: z.array(PostcardCollectibleReleaseDefinitionSchema).min(1).max(100),
}).strict().superRefine((set, context) => {
  const codes = new Set<string>();
  const positions = new Set<number>();
  let requiredReleases = 0;
  set.releases.forEach((release, index) => {
    if (codes.has(release.code)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["releases", index, "code"],
        message: "Release codes must be unique within a set.",
      });
    }
    codes.add(release.code);
    if (positions.has(release.setPosition)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["releases", index, "setPosition"],
        message: "Set positions must be unique.",
      });
    }
    positions.add(release.setPosition);
    if (release.requiredForCompletion) requiredReleases += 1;
  });
  if (requiredReleases === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["releases"],
      message: "A collectible set needs at least one completion release.",
    });
  }
});

export const PostcardCollectibleSelectionSchema = z.object({
  releaseId: Uuid,
  variantId: Uuid,
  bundle: PostcardCollectibleBundleMetadataSchema,
}).strict();

/**
 * Checkout currently fulfils one physical postcard. Keep the public order
 * contract just as narrow: a fan chooses an approved variant, but cannot ask
 * the client to mint serials or imply a second physical copy that checkout
 * does not price and fulfil.
 */
export const PostcardCollectibleCheckoutSelectionSchema = z.object({
  releaseId: Uuid,
  variantId: Uuid,
  bundle: z.object({
    mode: z.literal("single"),
    sendQuantity: z.literal(1),
    keepQuantity: z.literal(0),
    inventoryQuantity: z.literal(1),
  }).strict(),
}).strict();

export type PostcardCollectibleVariantOption = {
  id: string;
  code: string;
  title: string;
  remainingNow: number;
};

export type PostcardCollectibleReleaseOption = {
  setId: string;
  setCode: string;
  setTitle: string;
  memberSlug: string;
  releaseId: string;
  releaseCode: string;
  releaseTitle: string;
  description: string | null;
  designId: string;
  editionSize: number;
  remainingNow: number;
  availableUntil: string | null;
  variants: PostcardCollectibleVariantOption[];
};

export const PostcardCollectibleIssueRequestSchema = z.object({
  orderId: Uuid,
  ownerUserId: Uuid,
}).strict();

export type PostcardCollectibleBundleMetadata = z.infer<
  typeof PostcardCollectibleBundleMetadataSchema
>;
export type PostcardCollectibleReleaseDefinition = z.infer<
  typeof PostcardCollectibleReleaseDefinitionSchema
>;
export type PostcardCollectibleSetDefinition = z.infer<
  typeof PostcardCollectibleSetDefinitionSchema
>;
export type PostcardCollectibleSelection = z.infer<
  typeof PostcardCollectibleCheckoutSelectionSchema
>;
