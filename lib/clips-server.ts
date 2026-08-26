/**
 * Server-only clips data layer. Kept separate from lib/clips.ts (which is
 * client-safe pure data/functions) because this imports lib/db. Phase-4
 * prereq for clip upvotes: the public /clips page must render real, stable
 * clip uuids from the database instead of the empty SEED_CLIPS array.
 */
import { query } from "@/lib/db";
import { defaultAspectFor, type Clip } from "@/lib/clips";

/**
 * Public clips list, read from the `clips` table (admin-managed via
 * POST /api/admin/clips). Returns the same `Clip` shape the page already
 * renders, so it is a drop-in replacement for SEED_CLIPS.
 */
export async function getPublicClips(): Promise<Clip[]> {
  const r = await query<{
    id: string;
    source: Clip["source"];
    external_id: string;
    url: string;
    title: string;
    thumbnail_url: string | null;
    view_count: string | null;
    like_count: string | null;
    published_at: string;
    duration_ms: number | null;
    member_slugs: string[];
    description: string | null;
  }>(
    `SELECT c.id::text,
            c.source,
            c.external_id,
            c.url,
            c.title,
            c.thumbnail_url,
            c.view_count,
            c.like_count,
            c.published_at::text,
            c.duration_ms,
            COALESCE(ARRAY_AGG(t.member_slug) FILTER (WHERE t.member_slug IS NOT NULL), '{}') AS member_slugs,
            (SELECT description FROM clip_descriptions d WHERE d.clip_id = c.id LIMIT 1) AS description
       FROM clips c
       LEFT JOIN clip_member_tags t ON t.clip_id = c.id
      GROUP BY c.id
      ORDER BY c.published_at DESC NULLS LAST`,
  );

  return r.rows.map((row) => ({
    id: row.id,
    source: row.source,
    externalId: row.external_id,
    url: row.url,
    title: row.title,
    thumbnailUrl: row.thumbnail_url ?? undefined,
    viewCount: row.view_count != null ? Number(row.view_count) : undefined,
    likeCount: row.like_count != null ? Number(row.like_count) : undefined,
    publishedAt: row.published_at,
    memberSlugs: row.member_slugs ?? [],
    aiDescription: row.description ?? undefined,
    durationMs: row.duration_ms ?? undefined,
    aspect: defaultAspectFor(row.source, row.url),
  }));
}
