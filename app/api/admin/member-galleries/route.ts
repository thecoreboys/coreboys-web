import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-api";
import { getGroupPhotos, getMemberPhotos } from "@/lib/asset-index";
import { query } from "@/lib/db";
import { normalizeMemberGalleryPhotos } from "@/lib/member-gallery";
import { MEMBERS } from "@/lib/members";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GalleryOverrideRow = {
  member_slug: string;
  photo_urls: string[] | null;
};

/**
 * The Gallery editor starts from the same static image list that powers each
 * public /about page. That means an admin can curate the existing galleries
 * immediately, rather than having to upload every legacy image again.
 */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const configured = new Map<string, string[]>();
  try {
    const result = await query<GalleryOverrideRow>(
      `SELECT member_slug, photo_urls
         FROM member_gallery_overrides`,
    );
    for (const row of result.rows) {
      configured.set(row.member_slug, normalizeMemberGalleryPhotos(row.photo_urls ?? []));
    }
  } catch {
    // The public resolver has the same fallback. Returning the static catalog
    // keeps the admin page useful during a staggered migration rollout.
  }

  const groupPhotos = getGroupPhotos();
  return NextResponse.json({
    galleries: MEMBERS.map((member) => {
      const fallbackPhotos = normalizeMemberGalleryPhotos([
        ...getMemberPhotos(member.slug),
        ...groupPhotos,
      ]);
      const customPhotos = configured.get(member.slug);
      return {
        slug: member.slug,
        name: member.stageName,
        fallbackPhotos,
        photoUrls: customPhotos ?? fallbackPhotos,
        isCustomized: configured.has(member.slug),
      };
    }),
  });
}
