import "server-only";

/**
 * Combined social feed aggregator. The data model is platform-agnostic
 * so the UI doesn't care where an item came from; the *fetchers* know.
 *
 *   - YouTube  → RSS (free, no API key needed when channel ID is known).
 *   - X        → requires X Premium API ($$). Stubbed.
 *   - IG       → requires Meta Graph API + business token. Stubbed.
 *   - TikTok   → no public read API. Stubbed.
 *
 * See BEFORE_DEPLOY.md at the workspace root for what each platform
 * needs before its fetcher can light up.
 */

export type SocialPlatform = "youtube" | "x" | "instagram" | "tiktok";

export type FeedItem = {
  id: string;
  platform: SocialPlatform;
  url: string;
  title: string;
  /** ISO datetime — used to merge-sort across platforms. */
  publishedAt: string;
  authorSlug: string | null; // member slug, or null for the group account
  authorLabel: string;
  thumbnailUrl?: string;
  /** Optional duration string ("12:04") for video items. */
  duration?: string;
};

// ---------------------------------------------------------------------------
// YouTube — RSS, no key required.
// ---------------------------------------------------------------------------

/**
 * Fetches the latest videos from a YouTube channel via the public RSS
 * feed. Channel IDs follow the `UCxxxxxxxxxxxxxxxxxxxxx` form — that's
 * what `https://www.youtube.com/feeds/videos.xml?channel_id=UC...`
 * accepts. There is no API key required for this endpoint.
 */
export async function fetchYouTubeChannelFeed(
  channelId: string,
  authorSlug: string | null,
  authorLabel: string,
  limit = 6,
): Promise<FeedItem[]> {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
  try {
    const res = await fetch(url, { next: { revalidate: 600 } });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseYouTubeRss(xml, authorSlug, authorLabel).slice(0, limit);
  } catch {
    return [];
  }
}

function parseYouTubeRss(
  xml: string,
  authorSlug: string | null,
  authorLabel: string,
): FeedItem[] {
  const items: FeedItem[] = [];
  // Loose regex parser — sufficient for YouTube's stable RSS shape and
  // avoids pulling in a full XML lib for one endpoint.
  const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(xml))) {
    const block = m[1] ?? "";
    const id = pick(block, /<yt:videoId>([^<]+)<\/yt:videoId>/);
    const title = pick(block, /<title>([^<]+)<\/title>/);
    const published = pick(block, /<published>([^<]+)<\/published>/);
    const thumb = pick(block, /<media:thumbnail[^>]*url="([^"]+)"/);
    if (!id || !title || !published) continue;
    items.push({
      id: `yt-${id}`,
      platform: "youtube",
      url: `https://www.youtube.com/watch?v=${id}`,
      title,
      publishedAt: published,
      authorSlug,
      authorLabel,
      thumbnailUrl: thumb || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    });
  }
  return items;
}

function pick(block: string, re: RegExp): string {
  const m = re.exec(block);
  return m?.[1]?.trim() ?? "";
}

// ---------------------------------------------------------------------------
// Stubs — wire up once API access is in place. See BEFORE_DEPLOY.md.
// ---------------------------------------------------------------------------

export async function fetchXFeed(_handle: string): Promise<FeedItem[]> {
  // Requires X (Twitter) API v2 with at least the Basic plan ($100/mo at
  // time of writing) for `users/by/username` + `tweets/search/recent`.
  return [];
}

export async function fetchInstagramFeed(_userId: string): Promise<FeedItem[]> {
  // Requires Meta Graph API + a long-lived Instagram Business access
  // token. The account must be Business or Creator and linked to a
  // Facebook Page.
  return [];
}

export async function fetchTikTokFeed(_username: string): Promise<FeedItem[]> {
  // No public read API. The TikTok Display API is invite-only and gated
  // by app review. Best path is a scraping job in coreboys-api with a
  // rotating proxy pool — flagged as out-of-scope for the web tier.
  return [];
}

// ---------------------------------------------------------------------------
// Aggregator — merge-sort across platforms by publishedAt desc.
// ---------------------------------------------------------------------------

export type FeedRequest = {
  youtubeChannels: Array<{ channelId: string; authorSlug: string | null; authorLabel: string }>;
  // Extend with X/IG/TikTok handles when those APIs are available.
};

export async function fetchCombinedFeed(req: FeedRequest, limit = 12): Promise<FeedItem[]> {
  const ytLists = await Promise.all(
    req.youtubeChannels.map((c) =>
      fetchYouTubeChannelFeed(c.channelId, c.authorSlug, c.authorLabel),
    ),
  );
  const all: FeedItem[] = ytLists.flat();
  all.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  return all.slice(0, limit);
}
