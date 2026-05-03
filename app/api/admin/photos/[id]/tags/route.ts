import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Manual face / people tags for a photo. No AI — admin picks from
 *  the member / crew / talent dropdown. Uses the existing
 *  media_face_tags table. */

const Tag = z.object({
  personKind: z.enum(["member", "crew", "talent"]),
  personRef: z.string().min(1),
});
const PutBody = z.object({
  tags: z.array(Tag),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const r = await query<{ person_kind: string; person_id: string }>(
    `SELECT person_kind, person_id FROM media_face_tags WHERE asset_id = $1`,
    [id],
  );
  return NextResponse.json({
    tags: r.rows.map((row) => ({ personKind: row.person_kind, personRef: row.person_id })),
  });
}

/** Replace the full set of tags for the asset. */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  let body: z.infer<typeof PutBody>;
  try {
    body = PutBody.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "invalid payload", detail: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
  await query("DELETE FROM media_face_tags WHERE asset_id = $1 AND source = 'manual-admin'", [id]);
  for (const t of body.tags) {
    await query(
      `INSERT INTO media_face_tags (asset_id, person_kind, person_id, source)
       VALUES ($1, $2, $3, 'manual-admin')
       ON CONFLICT DO NOTHING`,
      [id, t.personKind, t.personRef],
    );
  }
  return NextResponse.json({ ok: true });
}
