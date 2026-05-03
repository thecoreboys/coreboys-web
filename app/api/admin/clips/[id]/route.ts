import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchBody = z.object({
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  memberSlugs: z.array(z.string()).optional(),
  publishedAt: z.string().datetime().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  let body: z.infer<typeof PatchBody>;
  try {
    body = PatchBody.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "invalid payload", detail: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }

  const sets: string[] = [];
  const p: unknown[] = [id];
  if (body.title !== undefined) {
    p.push(body.title);
    sets.push(`title = $${p.length}`);
  }
  if (body.publishedAt !== undefined) {
    p.push(body.publishedAt);
    sets.push(`published_at = $${p.length}`);
  }
  if (sets.length > 0) {
    await query(
      `UPDATE clips SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $1`,
      p,
    );
  }

  if (body.memberSlugs !== undefined) {
    await query("DELETE FROM clip_member_tags WHERE clip_id = $1", [id]);
    for (const slug of body.memberSlugs) {
      await query(
        "INSERT INTO clip_member_tags (clip_id, member_slug) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [id, slug],
      );
    }
  }

  if (body.description !== undefined) {
    if (body.description === null) {
      await query("DELETE FROM clip_descriptions WHERE clip_id = $1", [id]);
    } else {
      await query(
        `INSERT INTO clip_descriptions (clip_id, description, generated_by)
         VALUES ($1, $2, 'admin')
         ON CONFLICT (clip_id) DO UPDATE
           SET description = EXCLUDED.description, generated_by = 'admin'`,
        [id, body.description],
      );
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  await query("DELETE FROM clips WHERE id = $1", [id]);
  return NextResponse.json({ ok: true });
}
