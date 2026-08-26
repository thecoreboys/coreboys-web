/**
 * Social Fetch — server-only client for socialfetch.dev. One helper to
 * pull follower / subscriber counts across TikTok, Instagram, X (Twitter),
 * and YouTube. Snapchat isn't covered by Social Fetch; those keep
 * coming from each member's `manualCounts` map.
 *
 * Caching: every request goes through Next's fetch cache with a 6h
 * revalidate window + the `social-fetch` tag, so the same handle is
 * pulled at most ~4× per day across all renders. With ~5 socials × 6
 * members that's ~120 credits/day worst-case — well under the free
 * tier on a personal site.
 */

const BASE = "https://api.socialfetch.dev/v1";
// 6 hours — Social Fetch counts move slowly enough that fresher than
// this is wasted credits.
const REVALIDATE_SECONDS = 6 * 60 * 60;
const CACHE_TAG = "social-fetch";
const API_TIMEOUT_MS = 5_000;

export type SocialFetchPlatform = "tiktok" | "instagram" | "x" | "twitter" | "youtube";

/** Normalised response — only the field the UI actually shows. */
export type SocialCount = number;

function endpointFor(platform: SocialFetchPlatform, handle: string, url?: string): string | null {
  const stripped = handle.replace(/^@/, "").trim();
  switch (platform) {
    case "tiktok":
      return stripped ? `${BASE}/tiktok/profiles/${encodeURIComponent(stripped)}` : null;
    case "instagram":
      return stripped ? `${BASE}/instagram/profiles/${encodeURIComponent(stripped)}` : null;
    case "x":
    case "twitter":
      // Social Fetch routes both X and Twitter under `/twitter/`.
      return stripped ? `${BASE}/twitter/profiles/${encodeURIComponent(stripped)}` : null;
    case "youtube":
      // YouTube uniquely takes the full channel URL as a query param —
      // handles aren't enough since two channels can share a vanity name.
      if (!url) return null;
      return `${BASE}/youtube/channel?url=${encodeURIComponent(url)}`;
  }
}

function pickCount(platform: SocialFetchPlatform, body: unknown): number | null {
  if (!body || typeof body !== "object") return null;
  const data = (body as { data?: { metrics?: Record<string, unknown> } }).data;
  const metrics = data?.metrics;
  if (!metrics) return null;
  const key = platform === "youtube" ? "subscribers" : "followers";
  const v = metrics[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Pull a follower / subscriber count for one profile. Tries the Social
 * Fetch API first; on any failure (missing key, 4xx like 402
 * insufficient-credits, 5xx, parse error) falls back to the public-
 * profile scraper. Returns `null` only if both paths fail, so callers
 * can fall through to manual counts without ever throwing.
 *
 * Don't call this on a render path — it can take 1–3s when scraping.
 * Renders should read from the `metric_snapshots` table; the snapshot
 * cron is what actually invokes this helper.
 */
export async function fetchSocialCount(
  platform: SocialFetchPlatform,
  handle: string,
  url?: string,
): Promise<number | null> {
  const fromApi = await tryApi(platform, handle, url);
  if (fromApi != null) return fromApi;

  // Lazy import so the scraper module doesn't load on render paths
  // where this helper might still be referenced from older code.
  const { scrapeSocialCount } = await import("./social-scrape");
  return scrapeSocialCount(platform, handle, url);
}

/**
 * Cached API-only lookup for server-rendered profile cards. Unlike
 * `fetchSocialCount`, this never falls back to the slower public-page
 * scrapers, so a missing/limited upstream cannot hold up a page render.
 * The nightly snapshot job still uses the full API → scraper chain.
 */
export async function fetchSocialCountFromApi(
  platform: SocialFetchPlatform,
  handle: string,
  url?: string,
): Promise<number | null> {
  return tryApi(platform, handle, url);
}

async function tryApi(
  platform: SocialFetchPlatform,
  handle: string,
  url?: string,
): Promise<number | null> {
  const key = process.env.SOCIAL_FETCH_API_KEY;
  if (!key) return null;

  const endpoint = endpointFor(platform, handle, url);
  if (!endpoint) return null;

  try {
    const res = await fetch(endpoint, {
      headers: { "x-api-key": key, accept: "application/json" },
      next: { revalidate: REVALIDATE_SECONDS, tags: [CACHE_TAG] },
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return pickCount(platform, json);
  } catch {
    return null;
  }
}
