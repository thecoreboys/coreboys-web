import type { QueryResultRow } from "pg";
import { query } from "./db";
import { PostcardPackConfigSchema } from "./postcard-pack-schema";
import { postcardIdentityFor } from "./postcard-identities";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_ASSET_BYTES = 650_000;

export type ManagedPostcardAssetSource = {
  assetId: string;
  previewUrl: string | null;
};

export type ManagedPostcardAssetAuthorityRecord = {
  id: string;
  memberSlug: string;
  packId: string;
  packState: string;
  publishedRevisionId: string | null;
  revisionId: string;
  revisionState: string;
  config: unknown;
  moderationState: string;
  rightsAttested: boolean;
  rightsSource: string;
  publicUrl: string | null;
  mime: string;
};

export type AuthorizedManagedPostcardAsset = {
  id: string;
  url: string;
  mime: "image/jpeg" | "image/png" | "image/webp";
};

type ManagedAssetRow = QueryResultRow & {
  id: string;
  member_slug: string;
  pack_id: string;
  pack_state: string;
  published_revision_id: string | null;
  revision_id: string;
  revision_state: string;
  config: unknown;
  moderation_state: string;
  rights_attested: boolean;
  rights_source: string;
  public_url: string | null;
  mime: string;
};

function safeHttpsUrl(value: string | null): string | null {
  if (!value || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Pure authorization boundary used after a scoped database lookup. */
export function authorizeManagedPostcardAssetRecord(
  record: ManagedPostcardAssetAuthorityRecord | null,
  expected: { assetId: string; recipientSlug: string; designId: string },
): AuthorizedManagedPostcardAsset | null {
  if (!record || !UUID.test(expected.assetId) || record.id !== expected.assetId) return null;
  if (
    record.memberSlug !== expected.recipientSlug
    || record.packState !== "active"
    || record.revisionState !== "published"
    || record.publishedRevisionId !== record.revisionId
    || record.moderationState !== "approved"
    || !record.rightsAttested
    || record.rightsSource === "unknown"
  ) return null;
  const url = safeHttpsUrl(record.publicUrl);
  if (
    !url
    || !isTrustedManagedPostcardAssetUrl(url)
    || !["image/jpeg", "image/png", "image/webp"].includes(record.mime)
  ) return null;
  const parsedConfig = PostcardPackConfigSchema.safeParse(record.config);
  const identity = postcardIdentityFor(expected.recipientSlug);
  if (!parsedConfig.success || !identity) return null;
  const config = parsedConfig.data;
  const matchingDesign = config.designs.find((design) => {
    const baseDesign = identity.frontDesigns.find((candidate) => (
      candidate.composition === design.composition
      && candidate.photoSlots === design.photoSlots
    ));
    if (baseDesign?.id !== expected.designId) return false;
    if (design.assetIds.includes(record.id)) return true;
    const motifIds = new Set(design.motifIds);
    return config.motifs.some((motif) => motifIds.has(motif.id) && motif.assetId === record.id);
  });
  if (!matchingDesign) return null;
  return { id: record.id, url, mime: record.mime as AuthorizedManagedPostcardAsset["mime"] };
}

export async function resolveAuthorizedManagedPostcardAsset(
  assetId: string,
  recipientSlug: string,
  designId: string,
): Promise<AuthorizedManagedPostcardAsset | null> {
  if (!UUID.test(assetId)) return null;
  const result = await query<ManagedAssetRow>(
    `SELECT assets.id::text,
            assets.member_slug,
            assets.pack_id::text,
            packs.state AS pack_state,
            packs.published_revision_id::text,
            revisions.id::text AS revision_id,
            revisions.state AS revision_state,
            revisions.config,
            assets.moderation_state,
            assets.rights_attested,
            assets.rights_source,
            assets.public_url,
            assets.mime
       FROM postcard_pack_assets assets
       JOIN postcard_design_packs packs
         ON packs.id = assets.pack_id
        AND packs.member_slug = assets.member_slug
       JOIN postcard_pack_revisions revisions
         ON revisions.id = packs.published_revision_id
        AND revisions.pack_id = packs.id
      WHERE assets.id = $1
        AND assets.member_slug = $2
      LIMIT 1`,
    [assetId, recipientSlug],
  );
  const row = result.rows[0];
  return authorizeManagedPostcardAssetRecord(row ? {
    id: row.id,
    memberSlug: row.member_slug,
    packId: row.pack_id,
    packState: row.pack_state,
    publishedRevisionId: row.published_revision_id,
    revisionId: row.revision_id,
    revisionState: row.revision_state,
    config: row.config,
    moderationState: row.moderation_state,
    rightsAttested: row.rights_attested,
    rightsSource: row.rights_source,
    publicUrl: row.public_url,
    mime: row.mime,
  } : null, { assetId, recipientSlug, designId });
}

export function isTrustedManagedPostcardAssetUrl(
  value: string,
  configuredHostsValue = process.env.POSTCARD_PACK_ASSET_HOSTS ?? "",
): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  const configuredHosts = configuredHostsValue
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  const allowedHosts = new Set(["media.thecoreboys.com", ...configuredHosts]);
  return allowedHosts.has(url.hostname.toLowerCase());
}

function trustedAssetUrl(value: string): string {
  const url = new URL(value);
  if (!isTrustedManagedPostcardAssetUrl(value)) {
    throw new Error("Managed postcard asset host is not approved for server download.");
  }
  return url.toString();
}

function detectedMime(bytes: Uint8Array): "jpeg" | "png" | "webp" {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return "png";
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return "webp";
  throw new Error("Managed postcard asset did not return a supported image.");
}

export async function downloadAuthorizedManagedPostcardAsset(
  asset: AuthorizedManagedPostcardAsset,
  fetchImage: typeof fetch = fetch,
): Promise<string> {
  const response = await fetchImage(trustedAssetUrl(asset.url), {
    headers: { Accept: "image/jpeg,image/png,image/webp" },
    redirect: "error",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok || !response.body) throw new Error("Managed postcard asset was unavailable.");
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_ASSET_BYTES) {
    throw new Error("Managed postcard asset is too large.");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_ASSET_BYTES) {
      await reader.cancel("Managed postcard asset is too large.");
      throw new Error("Managed postcard asset is too large.");
    }
    chunks.push(value);
  }
  const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
  if (bytes.length === 0) throw new Error("Managed postcard asset was empty.");
  const mime = detectedMime(bytes);
  return `data:image/${mime};base64,${bytes.toString("base64")}`;
}

/**
 * Resolve only the opaque ID. The submitted preview URL is deliberately never
 * read, preventing a client from changing what the print worker downloads.
 */
export async function materializeManagedPostcardAssetSource(
  source: ManagedPostcardAssetSource,
  context: { recipientSlug: string; designId: string },
  dependencies: {
    resolve?: typeof resolveAuthorizedManagedPostcardAsset;
    download?: typeof downloadAuthorizedManagedPostcardAsset;
  } = {},
): Promise<string> {
  const resolve = dependencies.resolve ?? resolveAuthorizedManagedPostcardAsset;
  const download = dependencies.download ?? downloadAuthorizedManagedPostcardAsset;
  const asset = await resolve(source.assetId, context.recipientSlug, context.designId);
  if (!asset) throw new Error("That creator asset is no longer available for this postcard.");
  return download(asset);
}
