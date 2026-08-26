import { PostcardDraftSchema, type PostcardDraft } from "./postcard-draft";
import type {
  PostcardArchetype,
  SeededPostcardVariation,
} from "./postcard-identities";
import {
  hashPostcardCreativeSnapshot,
  POSTCARD_CREATIVE_SNAPSHOT_VERSION,
  type PostcardCreativeSnapshot,
} from "./print-mail";

const DATA_IMAGE = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const MAX_PROOF_HTML_BYTES = 10 * 1024 * 1024;
const MAX_REVIEW_ASSET_BYTES = 1_000_000;

export type PersistedPostcardProofRecord = {
  recipientSlug: string;
  designId: string;
  snapshotVersion: number | null;
  identityId: string | null;
  identityVersion: number | null;
  archetypeId: string | null;
  templateId: string | null;
  rendererVersion: number;
  variationAlgorithmVersion: number;
  resolvedVariation: SeededPostcardVariation | null;
  creativeFrontHtml: string | null;
  creativeBackHtml: string | null;
  creativeHash: string | null;
};

export type VerifiedPostcardProof = {
  snapshot: PostcardCreativeSnapshot;
  hash: string;
};

export type PostcardProofVerification =
  | { ok: true; proof: VerifiedPostcardProof }
  | { ok: false; error: string };

function positiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function boundedHtml(value: string | null): value is string {
  return Boolean(value) && Buffer.byteLength(value!, "utf8") <= MAX_PROOF_HTML_BYTES;
}

/**
 * Rebuild and verify the immutable snapshot without invoking the current
 * renderer. Admin review must show the bytes that were purchased, even after a
 * future renderer or catalog release changes how new cards are composed.
 */
export function verifyPersistedPostcardProof(
  record: PersistedPostcardProofRecord,
): PostcardProofVerification {
  if (
    record.snapshotVersion !== POSTCARD_CREATIVE_SNAPSHOT_VERSION
    || !record.identityId
    || !positiveInteger(record.identityVersion)
    || !record.archetypeId
    || !record.templateId
    || !positiveInteger(record.rendererVersion)
    || !positiveInteger(record.variationAlgorithmVersion)
    || !record.resolvedVariation
    || typeof record.resolvedVariation.designId !== "string"
    || !boundedHtml(record.creativeFrontHtml)
    || !boundedHtml(record.creativeBackHtml)
    || !record.creativeHash
    || !/^[0-9a-f]{64}$/i.test(record.creativeHash)
  ) {
    return { ok: false, error: "The stored postcard proof is incomplete." };
  }

  if (
    record.identityId !== record.recipientSlug
    || record.templateId !== record.designId
    || record.resolvedVariation.designId !== record.designId
  ) {
    return { ok: false, error: "The stored postcard proof does not match this order." };
  }

  const withoutHash: Omit<PostcardCreativeSnapshot, "creativeHash"> = {
    snapshotVersion: POSTCARD_CREATIVE_SNAPSHOT_VERSION,
    identityId: record.identityId,
    identityVersion: record.identityVersion,
    archetypeId: record.archetypeId as PostcardArchetype,
    templateId: record.templateId,
    rendererVersion: record.rendererVersion,
    variationAlgorithmVersion: record.variationAlgorithmVersion,
    resolvedVariation: record.resolvedVariation,
    frontHtml: record.creativeFrontHtml,
    backHtml: record.creativeBackHtml,
  };
  const expectedHash = hashPostcardCreativeSnapshot(withoutHash);
  if (expectedHash !== record.creativeHash.toLowerCase()) {
    return { ok: false, error: "The stored postcard proof failed its integrity check." };
  }

  return {
    ok: true,
    proof: {
      hash: expectedHash,
      snapshot: { ...withoutHash, creativeHash: expectedHash },
    },
  };
}

export type PostcardReviewAssetDescriptor = {
  key: `slot-${number}` | "signature";
  kind: "photo" | "signature";
  slot: number | null;
  label: string;
  altText: string;
  caption: string | null;
};

export type PersistedPostcardAssetRecord = {
  draftCreative: PostcardDraft | null;
  imageUrl: string | null;
  assetCount: number;
};

function parsedDraft(record: PersistedPostcardAssetRecord): PostcardDraft | null {
  const parsed = PostcardDraftSchema.safeParse(record.draftCreative);
  return parsed.success ? parsed.data : null;
}

/** Metadata only: private base64 payloads stay out of the review-queue JSON. */
export function describePostcardReviewAssets(
  record: PersistedPostcardAssetRecord,
): {
  assets: PostcardReviewAssetDescriptor[];
  expectedPhotoCount: number;
  complete: boolean;
} {
  const draft = parsedDraft(record);
  const photos: PostcardReviewAssetDescriptor[] = draft
    ? [...draft.photoSlots]
      .sort((left, right) => left.position - right.position)
      .filter((slot) => Boolean(slot.asset))
      .map((slot) => ({
        key: `slot-${slot.position}` as const,
        kind: "photo" as const,
        slot: slot.position,
        label: `Photo ${slot.position + 1}`,
        altText: slot.asset?.altText.trim() || `Postcard photo ${slot.position + 1}`,
        caption: slot.caption.trim() || null,
      }))
    : record.imageUrl
      ? [{
          key: "slot-0" as const,
          kind: "photo" as const,
          slot: 0,
          label: "Uploaded artwork",
          altText: "Uploaded postcard artwork",
          caption: null,
        }]
      : [];
  const signature = draft?.writing.signatureDataUrl
    ? [{
        key: "signature" as const,
        kind: "signature" as const,
        slot: null,
        label: draft.writing.savedSignatureLabel.trim() || "Handwritten signature",
        altText: "Private handwritten postcard signature",
        caption: null,
      }]
    : [];
  return {
    assets: [...photos, ...signature],
    expectedPhotoCount: record.assetCount,
    complete: photos.length === record.assetCount,
  };
}

export type PostcardReviewAsset = {
  bytes: Uint8Array;
  contentType: "image/jpeg" | "image/png" | "image/webp";
};

function decodePersistedImage(dataUrl: string | null): PostcardReviewAsset | null {
  if (!dataUrl) return null;
  const match = DATA_IMAGE.exec(dataUrl);
  if (!match) return null;
  const buffer = Buffer.from(match[2]!, "base64");
  if (buffer.length === 0 || buffer.length > MAX_REVIEW_ASSET_BYTES) return null;
  return {
    bytes: new Uint8Array(buffer),
    contentType: `image/${match[1]}` as PostcardReviewAsset["contentType"],
  };
}

/** Resolve one normalized persisted source asset by stable slot position. */
export function readPostcardReviewAsset(
  record: PersistedPostcardAssetRecord,
  key: `slot-${number}` | "signature",
): PostcardReviewAsset | null {
  const draft = parsedDraft(record);
  if (key === "signature") {
    return decodePersistedImage(draft?.writing.signatureDataUrl ?? null);
  }
  const position = Number(key.slice("slot-".length));
  if (!Number.isInteger(position) || position < 0 || position > 5) return null;
  const slot = draft?.photoSlots.find((candidate) => candidate.position === position);
  if (slot?.asset?.source.kind === "embedded") {
    return decodePersistedImage(slot.asset.source.dataUrl);
  }
  // V1 orders persisted the first normalized upload only in image_url.
  if (!draft && position === 0) return decodePersistedImage(record.imageUrl);
  return null;
}
