import type { QueryResultRow } from "pg";
import { query } from "./db";
import {
  projectFanPostcardPackCatalog,
  type FanPostcardAssetSource,
  type FanPostcardDropSource,
  type FanPostcardPackCatalog,
  type FanPostcardPackSource,
} from "./postcard-fan-packs";
import { isTrustedManagedPostcardAssetUrl } from "./postcard-managed-assets";

type PackRow = QueryResultRow & {
  pack_id: string;
  revision_id: string;
  published_revision_id: string | null;
  member_slug: string;
  pack_state: string;
  revision_state: string;
  slug: string;
  title: string;
  description: string | null;
  content_hash: string;
  published_at: string | Date | null;
  config: unknown;
};

type DropRow = QueryResultRow & {
  id: string;
  pack_id: string;
  revision_id: string;
  member_slug: string;
  code: string;
  title: string;
  description: string | null;
  state: string;
  starts_at: string | Date;
  ends_at: string | Date | null;
};

type AssetRow = QueryResultRow & {
  id: string;
  pack_id: string;
  member_slug: string;
  kind: string;
  public_url: string | null;
  mime: string;
  width: number;
  height: number;
  attribution: string | null;
  moderation_state: string;
  rights_attested: boolean;
  rights_source: string;
};

function iso(value: string | Date | null): string | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

/** Load the public, recipient-scoped projection; never return revision drafts. */
export async function loadFanPostcardPackCatalog(
  recipientSlug: string,
  now = new Date(),
): Promise<FanPostcardPackCatalog> {
  const packsResult = await query<PackRow>(
    `SELECT packs.id::text AS pack_id,
            revisions.id::text AS revision_id,
            packs.published_revision_id::text,
            packs.member_slug,
            packs.state AS pack_state,
            revisions.state AS revision_state,
            packs.slug,
            packs.title,
            packs.description,
            revisions.content_hash,
            revisions.published_at,
            revisions.config
       FROM postcard_design_packs packs
       JOIN postcard_pack_revisions revisions
         ON revisions.id = packs.published_revision_id
        AND revisions.pack_id = packs.id
      WHERE packs.member_slug = $1
        AND packs.state = 'active'
        AND revisions.state = 'published'
      ORDER BY revisions.published_at DESC, packs.id
      LIMIT 24`,
    [recipientSlug],
  );
  const packIds = packsResult.rows.map((row) => row.pack_id);
  const [dropsResult, assetsResult] = packIds.length === 0
    ? [{ rows: [] as DropRow[] }, { rows: [] as AssetRow[] }]
    : await Promise.all([
      query<DropRow>(
        `SELECT drops.id::text,
                drops.pack_id::text,
                drops.revision_id::text,
                drops.member_slug,
                drops.code,
                drops.title,
                drops.description,
                drops.state,
                drops.starts_at,
                drops.ends_at
           FROM postcard_drops drops
          WHERE drops.member_slug = $1
            AND drops.pack_id = ANY($2::uuid[])
            AND drops.state = 'scheduled'
            AND drops.starts_at <= $3
            AND (drops.ends_at IS NULL OR drops.ends_at > $3)
          ORDER BY drops.starts_at DESC, drops.id
          LIMIT 144`,
        [recipientSlug, packIds, now.toISOString()],
      ),
      query<AssetRow>(
        `SELECT assets.id::text,
                assets.pack_id::text,
                assets.member_slug,
                assets.kind,
                assets.public_url,
                assets.mime,
                assets.width,
                assets.height,
                assets.attribution,
                assets.moderation_state,
                assets.rights_attested,
                assets.rights_source
           FROM postcard_pack_assets assets
          WHERE assets.member_slug = $1
            AND assets.pack_id = ANY($2::uuid[])
            AND assets.moderation_state = 'approved'
            AND assets.rights_attested
            AND assets.rights_source <> 'unknown'
            AND assets.public_url IS NOT NULL
          ORDER BY assets.created_at, assets.id
          LIMIT 576`,
        [recipientSlug, packIds],
      ),
    ]);

  const packs: FanPostcardPackSource[] = packsResult.rows.map((row) => ({
    packId: row.pack_id,
    revisionId: row.revision_id,
    publishedRevisionId: row.published_revision_id,
    memberSlug: row.member_slug,
    packState: row.pack_state,
    revisionState: row.revision_state,
    slug: row.slug,
    title: row.title,
    description: row.description,
    contentHash: row.content_hash,
    publishedAt: iso(row.published_at),
    config: row.config,
  }));
  const drops: FanPostcardDropSource[] = dropsResult.rows.flatMap((row) => {
    const startsAt = iso(row.starts_at);
    if (!startsAt) return [];
    return [{
      id: row.id,
      packId: row.pack_id,
      revisionId: row.revision_id,
      memberSlug: row.member_slug,
      code: row.code,
      title: row.title,
      description: row.description,
      state: row.state,
      startsAt,
      endsAt: iso(row.ends_at),
    }];
  });
  const assets: FanPostcardAssetSource[] = assetsResult.rows.map((row) => ({
    id: row.id,
    packId: row.pack_id,
    memberSlug: row.member_slug,
    kind: row.kind,
    publicUrl: row.public_url && isTrustedManagedPostcardAssetUrl(row.public_url) ? row.public_url : null,
    mime: row.mime,
    width: Number(row.width),
    height: Number(row.height),
    attribution: row.attribution,
    moderationState: row.moderation_state,
    rightsAttested: row.rights_attested,
    rightsSource: row.rights_source,
  }));
  return projectFanPostcardPackCatalog(recipientSlug, packs, drops, assets, now.toISOString());
}

export function isMissingPostcardStudioSchema(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  return code === "42P01" || code === "42703";
}
