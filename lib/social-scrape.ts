/**
 * Public-profile scrapers for follower / subscriber counts. Used as a
 * fallback when the Social Fetch API fails (out of credits, 5xx, etc.).
 *
 * These are intentionally tolerant: every scraper returns `null` on any
 * error so the caller can fall through to the next strategy. Real
 * scraping is brittle — sites change markup, ban IPs, throttle bots —
 * so we treat any non-numeric outcome as "no data" and keep going.
 *
 * IMPORTANT: only call these from the snapshot cron, not from render
 * paths. They're slow (1–3s per platform) and can get the server's IP
 * temp-banned if hammered. The cron writes results into
 * `metric_snapshots` and pages read from there.
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const FETCH_TIMEOUT_MS = 12_000;

async function getText(url: string, extraHeaders: Record<string, string> = {}): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "user-agent": UA,
        "accept-language": "en-US,en;q=0.9",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        ...extraHeaders,
      },
      // Bypass Next's data cache — this only runs in the cron, fresh
      // every time, and a stale cached error shouldn't be sticky.
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Parse human numbers like "1.2M", "3,400", "5.6K" into a base-10 int. */
function parseCompact(input: string): number | null {
  const cleaned = input.replace(/[, ]/g, "").trim();
  const m = /^([0-9]+(?:\.[0-9]+)?)([kKmMbB])?/.exec(cleaned);
  if (!m) return null;
  const base = parseFloat(m[1]!);
  if (!Number.isFinite(base)) return null;
  const unit = (m[2] ?? "").toLowerCase();
  const mul = unit === "k" ? 1_000 : unit === "m" ? 1_000_000 : unit === "b" ? 1_000_000_000 : 1;
  return Math.round(base * mul);
}

/**
 * YouTube — fetch the channel page, look for `subscriberCountText`
 * embedded in the ytInitialData JSON blob. Returns subscriber count.
 */
export async function scrapeYouTubeSubs(channelUrl: string): Promise<number | null> {
  // YouTube serves a richer embedded JSON when the URL is the /about page.
  const url = channelUrl.replace(/\/+$/, "") + "/about";
  const html = await getText(url);
  if (!html) return null;

  // Two known shapes:
  //   "subscriberCountText":{"accessibility":{"accessibilityData":{"label":"3.2M subscribers"}},"simpleText":"3.2M subscribers"}
  //   "subscriberCountText":{"simpleText":"3.2M subscribers"}
  // The simpleText form is most reliable across locales.
  const m = /"subscriberCountText"\s*:\s*\{[^}]*?"simpleText"\s*:\s*"([^"]+)"/.exec(html);
  if (!m) return null;
  // Strip trailing " subscribers" / " subscriber" / locale variants.
  const text = m[1]!.replace(/\s*subscribers?\b.*$/i, "").trim();
  return parseCompact(text);
}

/**
 * Instagram — fetch the profile page, pull the OG description meta.
 * Public format: "X Followers, Y Following, Z Posts - See Instagram..."
 * IG localizes the words, so we accept any locale by parsing the first
 * comma-separated chunk that looks like "<number> Followers".
 */
export async function scrapeInstagramFollowers(handle: string): Promise<number | null> {
  const stripped = handle.replace(/^@/, "").trim();
  if (!stripped) return null;
  const html = await getText(`https://www.instagram.com/${encodeURIComponent(stripped)}/`);
  if (!html) return null;

  const og = /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i.exec(html);
  if (!og) return null;
  const desc = og[1]!;
  // "1,234,567 Followers, 234 Following, 1,234 Posts - ..."
  const match = /([0-9][0-9,.]*\s*[KMB]?)\s+followers/i.exec(desc);
  if (!match) return null;
  return parseCompact(match[1]!);
}

/**
 * TikTok — public profile page embeds a SIGI_STATE / __UNIVERSAL_DATA_FOR_REHYDRATION__
 * blob with the user's stats. Returns null if TikTok serves the
 * anti-bot interstitial (no embedded data) — that's expected,
 * scraping TikTok is unreliable.
 */
export async function scrapeTikTokFollowers(handle: string): Promise<number | null> {
  const stripped = handle.replace(/^@/, "").trim();
  if (!stripped) return null;
  const html = await getText(`https://www.tiktok.com/@${encodeURIComponent(stripped)}`);
  if (!html) return null;

  // followerCount appears multiple times; the first match is the
  // profile owner's. Look in either of two known JSON containers.
  const m = /"followerCount"\s*:\s*([0-9]+)/.exec(html);
  if (!m) return null;
  const n = parseInt(m[1]!, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * X / Twitter — both the live site and Nitter mirrors are unreliable
 * (auth wall, rate limits, mirror outages). We try a small list of
 * Nitter instances; if every one fails we return null and let the
 * caller fall back to the manual override.
 */
const NITTER_INSTANCES = [
  "https://nitter.net",
  "https://nitter.poast.org",
  "https://nitter.privacydev.net",
];

export async function scrapeXFollowers(handle: string): Promise<number | null> {
  const stripped = handle.replace(/^@/, "").trim();
  if (!stripped) return null;
  for (const base of NITTER_INSTANCES) {
    const html = await getText(`${base}/${encodeURIComponent(stripped)}`);
    if (!html) continue;
    // Nitter renders <span class="profile-stat-num">12,345</span> with
    // a sibling <span class="profile-stat-header">Followers</span>.
    const m =
      /<li[^>]*class=["']followers["'][^>]*>[\s\S]*?<span[^>]*class=["']profile-stat-num["'][^>]*>([^<]+)<\/span>/i.exec(
        html,
      );
    if (m) {
      const n = parseCompact(m[1]!);
      if (n != null && n > 0) return n;
    }
  }
  return null;
}

export type ScrapePlatform = "youtube" | "tiktok" | "instagram" | "x" | "twitter";

/** Single entry point — picks the right scraper for the platform. */
export async function scrapeSocialCount(
  platform: ScrapePlatform,
  handle: string,
  url?: string,
): Promise<number | null> {
  try {
    switch (platform) {
      case "youtube":
        if (!url) return null;
        return await scrapeYouTubeSubs(url);
      case "instagram":
        return await scrapeInstagramFollowers(handle);
      case "tiktok":
        return await scrapeTikTokFollowers(handle);
      case "x":
      case "twitter":
        return await scrapeXFollowers(handle);
    }
  } catch {
    return null;
  }
}
