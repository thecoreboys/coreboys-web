import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin-api";
import { getGroupPhotos, getMemberPhotos } from "@/lib/asset-index";
import { query } from "@/lib/db";
import { normalizeMemberGalleryPhotos } from "@/lib/member-gallery";
import { MEMBERS_BY_SLUG } from "@/lib/members";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UpdateGalleryBody = z.object({
  photoUrls: z.array(z.string().trim().min(1).max(2_048)).max(100),
});

type AssetUrlRow = { cdn_url: string };

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { slug } = await params;
  if (!MEMBERS_BY_SLUG[slug]) {
    return NextResponse.json({ error: "Unknown creator." }, { status: 404 });
  }

  let body: z.infer<typeof UpdateGalleryBody>;
  try {
    body = UpdateGalleryBody.parse(await req.json());
  } catch (error) {
    return NextResponse.json(
      { error: "Invalid gallery selection.", detail: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }

  const photoUrls = normalizeMemberGalleryPhotos(body.photoUrls);
  if (photoUrls.length !== body.photoUrls.length) {
    return NextResponse.json({ error: "Gallery URLs must be unique, valid image URLs." }, { status: 400 });
  }

  const allowedUrls = new Set<string>(normalizeMemberGalleryPhotos([
    ...getMemberPhotos(slug),
    ...getGroupPhotos(),
  ]));
  if (photoUrls.length > 0) {
    try {
      const assets = await query<AssetUrlRow>(
        `SELECT cdn_url
           FROM media_assets
          WHERE cdn_url = ANY($1::text[])`,
        [photoUrls],
      );
      for (const asset of assets.rows) allowedUrls.add(asset.cdn_url);
    } catch {
      // Static legacy assets remain editable even if a photo upload schema is
      // temporarily unavailable. Unknown remote URLs stay rejected below.
    }
  }

  if (photoUrls.some((photoUrl) => !allowedUrls.has(photoUrl))) {
    return NextResponse.json(
      { error: "Choose photos from this creator's gallery or Admin Photos." },
      { status: 400 },
    );
  }

  try {
    await query(
      `INSERT INTO member_gallery_overrides (member_slug, photo_urls)
       VALUES ($1, $2::text[])
       ON CONFLICT (member_slug) DO UPDATE
         SET photo_urls = EXCLUDED.photo_urls,
             updated_at = NOW()`,
      [slug, photoUrls],
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "Gallery curation is not ready yet.",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true, photoUrls });
}

/** Remove the override and immediately restore the existing static gallery. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { slug } = await params;
  if (!MEMBERS_BY_SLUG[slug]) {
    return NextResponse.json({ error: "Unknown creator." }, { status: 404 });
  }
  try {
    await query(`DELETE FROM member_gallery_overrides WHERE member_slug = $1`, [slug]);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Gallery curation is not ready yet.",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true });
}
