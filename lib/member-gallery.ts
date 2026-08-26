import "server-only";

import { query } from "@/lib/db";

/**
 * A deliberately small curation layer over the checked-in gallery folders.
 *
 * A member has no row until an admin saves a selection. That absence is
 * meaningful: it lets the public site keep serving the existing static
 * member + group gallery while the database is unavailable or before the
 * photo team has made a first edit. Once a row exists, its ordered URLs are
 * the source of truth (including an intentionally empty list).
 */
type MemberGalleryRow = {
  photo_urls: string[] | null;
};

export function normalizeMemberGalleryPhotos(photoUrls: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of photoUrls) {
    const photoUrl = value.trim();
    if (!isSafeGalleryPhotoUrl(photoUrl) || seen.has(photoUrl)) continue;
    seen.add(photoUrl);
    normalized.push(photoUrl);
  }

  return normalized;
}

/**
 * Resolve the admin-curated order when present, otherwise preserve the
 * checked-in gallery exactly as it works today. Consumers should pass the
 * member's legacy own + group photo list as `fallbackPhotos`.
 */
export async function getMemberGalleryPhotos(
  memberSlug: string,
  fallbackPhotos: readonly string[],
): Promise<string[]> {
  const fallback = normalizeMemberGalleryPhotos(fallbackPhotos);
  if (!memberSlug) return fallback;

  try {
    const result = await query<MemberGalleryRow>(
      `SELECT photo_urls
         FROM member_gallery_overrides
        WHERE member_slug = $1
        LIMIT 1`,
      [memberSlug],
    );
    const row = result.rows[0];
    // No row means the admin has not taken ownership of this gallery yet.
    // An empty array means they intentionally cleared it.
    return row ? normalizeMemberGalleryPhotos(row.photo_urls ?? []) : fallback;
  } catch {
    // Gallery curation must never make a public profile unavailable. This also
    // makes rollout safe while the additive migration reaches every database.
    return fallback;
  }
}

function isSafeGalleryPhotoUrl(value: string): boolean {
  if (!value || value.length > 2_048) return false;
  if (value.startsWith("/")) return !value.startsWith("//");
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
