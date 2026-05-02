/**
 * Clips data layer. In Phase 4 this swaps for `/v1/clips` on
 * coreboys-api backed by the `Clip` table — the type is identical so
 * the swap is mechanical. For Phase 1, clips live in this seed file
 * (and the admin console writes to localStorage as a stub).
 *
 * Safe to import from both server + client components: this file is
 * pure data + pure functions.
 */

export type ClipSource = "twitch" | "youtube" | "tiktok" | "instagram";

export type ClipAspect = "vertical" | "horizontal";

export type Clip = {
  id: string;
  source: ClipSource;
  /** Platform-specific identifier — clip slug, video ID, etc. */
  externalId: string;
  /** Canonical link to view the clip on the original platform. */
  url: string;
  /** Human title. */
  title: string;
  /** Best-known thumbnail. Used for the cover before embed loads. */
  thumbnailUrl?: string;
  /** Total views or watches. Used for the "Popular" sort. */
  viewCount?: number;
  /** Engagement count (likes / hearts). */
  likeCount?: number;
  /** ISO datetime when the clip was first published. */
  publishedAt: string;
  /** Member slugs in the clip — used for filtering. */
  memberSlugs: string[];
  /** AI description of the clip — used for search. */
  aiDescription?: string;
  /** Seconds. Optional. */
  durationMs?: number;
  /** 9:16 (Shorts / Reels / TikTok / Twitch portrait) or 16:9 (long-form). */
  aspect: ClipAspect;
};

/** Sensible default per platform when uploaders don't specify. */
export function defaultAspectFor(source: ClipSource, url: string): ClipAspect {
  if (source === "tiktok") return "vertical";
  if (source === "instagram") return /\/reel\//i.test(url) ? "vertical" : "horizontal";
  if (source === "youtube") return /\/shorts\//i.test(url) ? "vertical" : "horizontal";
  // Twitch: most published clips are 16:9 from desktop streams.
  return "horizontal";
}

/**
 * Public clips list. Empty by default — populated from the database
 * (admin-managed). Phase 4 swaps for `GET /v1/clips` on coreboys-api.
 */
export const SEED_CLIPS: Clip[] = [];

export type ClipSortKey = "newest" | "oldest" | "popular" | "ai";

export function sortClips(clips: readonly Clip[], key: ClipSortKey, query?: string): Clip[] {
  const list = [...clips];
  switch (key) {
    case "newest":
      return list.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
    case "oldest":
      return list.sort((a, b) => (a.publishedAt > b.publishedAt ? 1 : -1));
    case "popular":
      return list.sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0));
    case "ai":
      // Placeholder ranking — Phase 4 wires real embedding similarity.
      // Until then, AI-mode filters by description match.
      if (!query) return list;
      const q = query.toLowerCase();
      return list
        .filter(
          (c) =>
            (c.aiDescription ?? "").toLowerCase().includes(q) ||
            c.title.toLowerCase().includes(q),
        )
        .sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0));
    default:
      return list;
  }
}
