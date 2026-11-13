export type InstagramPlayback = { url: string; expiresAt: number };

export function instagramPlaybackShortcode(source?: string | null): string | null {
  try {
    const url = new URL(source ?? "");
    if (url.protocol !== "https:" || !/^(?:www\.)?instagram\.com$/i.test(url.hostname)) return null;
    return /^\/(?:reels?|p|tv)\/([A-Za-z0-9_-]{4,64})(?:\/embed)?\/?$/.exec(url.pathname)?.[1] ?? null;
  } catch { return null; }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** Read only fresh, already cached video media. Never persist these URLs in the archive. */
export function cachedInstagramPlayback(payload: unknown, cacheExpiresAt: number, now = Date.now()): Map<string, InstagramPlayback> {
  const result = new Map<string, InstagramPlayback>();
  const response = record(payload);
  if (response?.status !== "ok" || !Number.isFinite(cacheExpiresAt)) return result;
  const data = record(record(response.body)?.data);
  for (const name of ["reels", "posts"] as const) {
    const collection = data?.[name];
    if (!Array.isArray(collection)) continue;
    for (const value of collection) {
      const media = record(value);
      // The Reels endpoint omits mediaType: membership in `reels` identifies video.
      if (!media || (name === "posts" && media.mediaType !== "video") || ["image", "sidecar"].includes(String(media.mediaType)) || typeof media.shortcode !== "string" || !/^[A-Za-z0-9_-]{4,64}$/.test(media.shortcode) || typeof media.videoUrl !== "string") continue;
      try {
        const url = new URL(media.videoUrl);
        if (url.protocol !== "https:" || url.username || url.password || !/(?:^|\.)(?:cdninstagram\.com|fbcdn\.net)$/i.test(url.hostname)) continue;
        const expiry = url.searchParams.get("oe");
        if (expiry && !/^[a-f\d]{1,12}$/i.test(expiry)) continue;
        const expiresAt = Math.min(cacheExpiresAt, expiry ? parseInt(expiry, 16) * 1_000 : cacheExpiresAt) - 60_000;
        if (expiresAt <= now) continue;
        result.set(media.shortcode, { url: media.videoUrl, expiresAt });
      } catch { /* Missing, expired, or malformed media uses Instagram's official embed. */ }
    }
  }
  return result;
}
