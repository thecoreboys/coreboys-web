import type { WatchItem } from "./types";
import { normalizeCreatorSocialHandle } from "./social-account-ref";

export const TIKTOK_EMBED_SCRIPT_SRC = "https://www.tiktok.com/embed.js";
export const INSTAGRAM_EMBED_SCRIPT_SRC = "https://www.instagram.com/embed.js";

const MAX_INSTAGRAM_EMBEDS = 10;

export type TikTokCreatorEmbed = {
  handle: string;
  profileUrl: string;
  referUrl: string;
};

export type InstagramPublicEmbed = {
  key: string;
  kind: "profile" | "post" | "reel";
  permalink: string;
  label: string;
};

function parsedOfficialUrl(raw: string, provider: "tiktok" | "instagram"): URL | null {
  const value = raw.trim();
  if (!value) return null;
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(value)
    ? value
    : /^(?:www\.|m\.)?(?:tiktok\.com|instagram\.com)\//i.test(value)
      ? `https://${value}`
      : null;
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    const host = parsed.hostname.toLowerCase().replace(/^(?:www\.|m\.)/, "");
    const expected = provider === "tiktok" ? "tiktok.com" : "instagram.com";
    return parsed.protocol === "https:" && host === expected ? parsed : null;
  } catch {
    return null;
  }
}

/** Build the exact public Creator Profile Embed identity documented by TikTok. */
export function tiktokCreatorEmbed(
  handleOrProfileUrl: string | null | undefined,
): TikTokCreatorEmbed | null {
  const handle = normalizeCreatorSocialHandle("tiktok", handleOrProfileUrl);
  if (!handle) return null;
  const profileUrl = `https://www.tiktok.com/@${handle}`;
  return {
    handle,
    profileUrl,
    referUrl: `${profileUrl}?refer=creator_embed`,
  };
}

/**
 * Canonicalize only the public URL formats Meta documents for Instagram
 * oEmbed. Stories, private paths, arbitrary subdomains, and nested routes are
 * deliberately rejected instead of being probed or scraped.
 */
export function instagramPublicEmbed(
  handleOrPublicUrl: string | null | undefined,
): InstagramPublicEmbed | null {
  const raw = handleOrPublicUrl?.trim() ?? "";
  if (!raw) return null;

  const handle = normalizeCreatorSocialHandle("instagram", raw);
  if (handle) {
    const permalink = `https://www.instagram.com/${handle}/`;
    return {
      key: `profile:${handle}`,
      kind: "profile",
      permalink,
      label: `View @${handle} on Instagram`,
    };
  }

  const parsed = parsedOfficialUrl(raw, "instagram");
  if (!parsed) return null;
  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length !== 2) return null;
  const route = segments[0]?.toLowerCase();
  const shortcode = segments[1];
  if ((route !== "p" && route !== "reel") || !shortcode || !/^[A-Za-z0-9_-]{3,100}$/.test(shortcode)) {
    return null;
  }
  const kind = route === "p" ? "post" : "reel";
  const permalink = `https://www.instagram.com/${route}/${encodeURIComponent(shortcode)}/`;
  return {
    key: `${kind}:${shortcode}`,
    kind,
    permalink,
    label: `View this Instagram ${kind}`,
  };
}

/** Keep a bounded, stable list of exact public embeds without network calls. */
export function instagramPublicEmbeds(
  values: readonly (string | null | undefined)[],
  limit = MAX_INSTAGRAM_EMBEDS,
): InstagramPublicEmbed[] {
  const output: InstagramPublicEmbed[] = [];
  const seen = new Set<string>();
  const bounded = Number.isFinite(limit)
    ? Math.max(1, Math.min(MAX_INSTAGRAM_EMBEDS, Math.trunc(limit)))
    : MAX_INSTAGRAM_EMBEDS;
  for (const value of values) {
    const embed = instagramPublicEmbed(value);
    if (!embed || seen.has(embed.permalink)) continue;
    seen.add(embed.permalink);
    output.push(embed);
    if (output.length >= bounded) break;
  }
  return output;
}

/**
 * Explicit Watch Programming picks are the only item URLs eligible for the
 * Instagram fallback. Provider-feed records never become embed configuration
 * implicitly, which keeps this path separate from discovery and scraping.
 */
export function configuredInstagramEmbedUrls(
  items: readonly Pick<WatchItem, "platform" | "sourceUrl" | "programming">[],
): string[] {
  return instagramPublicEmbeds(items.flatMap((item) => (
    item.platform === "instagram" && item.programming?.curatedItemId && item.sourceUrl
      ? [item.sourceUrl]
      : []
  ))).filter((embed) => embed.kind !== "profile").map((embed) => embed.permalink);
}
