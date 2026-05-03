import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Clips — direct admin add OR fan-submitted (latter via /clips/submit
 *  forwards to here too). Tagged members go into clip_member_tags. */

const CreateBody = z.object({
  source: z.enum(["twitch", "youtube", "tiktok", "instagram"]),
  externalId: z.string().min(1).max(120),
  url: z.string().url(),
  title: z.string().default(""),
  thumbnailUrl: z.string().url().optional(),
  publishedAt: z.string().datetime().optional(),
  memberSlugs: z.array(z.string()).default([]),
  description: z.string().optional(),
});

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const r = await query<{
    id: string; source: string; external_id: string; url: string; title: string;
    thumbnail_url: string | null; published_at: string;
    member_slugs: string[]; description: string | null; created_at: string;
  }>(
    `SELECT c.id::text, c.source, c.external_id, c.url, c.title,
            c.thumbnail_url, c.published_at::text,
            COALESCE(ARRAY_AGG(t.member_slug) FILTER (WHERE t.member_slug IS NOT NULL), '{}') AS member_slugs,
            (SELECT description FROM clip_descriptions d WHERE d.clip_id = c.id LIMIT 1) AS description,
            c.created_at::text
     FROM clips c
     LEFT JOIN clip_member_tags t ON t.clip_id = c.id
     GROUP BY c.id
     ORDER BY c.published_at DESC NULLS LAST`,
  );
  return NextResponse.json({ clips: r.rows });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  let body: z.infer<typeof CreateBody>;
  try {
    body = CreateBody.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "invalid payload", detail: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
  const publishedAt = body.publishedAt ?? new Date().toISOString();
  const r = await query<{ id: string }>(
    `INSERT INTO clips (source, external_id, url, title, thumbnail_url, published_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (source, external_id) DO UPDATE
       SET title = EXCLUDED.title,
           thumbnail_url = EXCLUDED.thumbnail_url,
           updated_at = NOW()
     RETURNING id::text`,
    [body.source, body.externalId, body.url, body.title, body.thumbnailUrl ?? null, publishedAt],
  );
  const clipId = r.rows[0]!.id;

  // Replace member tags wholesale.
  await query("DELETE FROM clip_member_tags WHERE clip_id = $1", [clipId]);
  for (const slug of body.memberSlugs) {
    await query(
      "INSERT INTO clip_member_tags (clip_id, member_slug) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [clipId, slug],
    );
  }
  if (body.description) {
    await query(
      `INSERT INTO clip_descriptions (clip_id, description, generated_by)
       VALUES ($1, $2, 'admin')
       ON CONFLICT (clip_id) DO UPDATE
         SET description = EXCLUDED.description, generated_by = 'admin'`,
      [clipId, body.description],
    );
  }

  return NextResponse.json({ id: clipId }, { status: 201 });
}
