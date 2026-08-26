import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-api";
import { deleteFromSpaces } from "@/lib/spaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchBody = z.object({
  takenAt: z.string().nullable().optional(),
  cameraMake: z.string().nullable().optional(),
  cameraModel: z.string().nullable().optional(),
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
  const push = (col: string, v: unknown) => {
    p.push(v);
    sets.push(`${col} = $${p.length}`);
  };
  if (body.takenAt !== undefined) push("taken_at", body.takenAt);
  if (body.cameraMake !== undefined) push("camera_make", body.cameraMake);
  if (body.cameraModel !== undefined) push("camera_model", body.cameraModel);
  if (sets.length === 0) return NextResponse.json({ ok: true });
  await query(
    `UPDATE media_assets SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $1`,
    p,
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  // Look up the s3_key so we can clean Spaces too.
  const r = await query<{ s3_key: string; cdn_url: string }>(
    "SELECT s3_key, cdn_url FROM media_assets WHERE id = $1",
    [id],
  );
  const asset = r.rows[0];
  const key = asset?.s3_key;
  await query("DELETE FROM media_assets WHERE id = $1", [id]);
  if (asset?.cdn_url) {
    // An upload may have been featured in one or more creator galleries.
    // Remove the dead URL but leave the rest of each curator's ordering intact.
    await query(
      `UPDATE member_gallery_overrides
          SET photo_urls = array_remove(photo_urls, $1),
              updated_at = NOW()
        WHERE $1 = ANY(photo_urls)`,
      [asset.cdn_url],
    ).catch(() => {
      // Safe during rollout before the additive gallery migration exists.
    });
  }
  if (key) {
    deleteFromSpaces(key).catch(() => {
      /* DB row already gone — best-effort cleanup of the object */
    });
  }
  return NextResponse.json({ ok: true });
}
