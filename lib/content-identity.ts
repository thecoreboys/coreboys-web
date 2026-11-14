/** Public provider identity only. Never infer deletion from a missing feed page. */
export type ContentProvider = "x" | "youtube" | "instagram" | "tiktok" | "twitch";
export type ContentIdentityInput = {
  provider?: string; platform?: string; providerId?: string; canonicalProviderId?: string;
  canonicalId?: string; id?: string; sourceUrl?: string; url?: string; href?: string;
  x?: { statusId?: string; quote?: { statusId?: string; statusUrl?: string }; quoteReference?: { statusId?: string; statusUrl?: string; unavailable?: boolean } };
  twitch?: { vodId?: string };
  dvr?: { twitchVodId?: string };
};
const providers = new Set<string>(["x", "youtube", "instagram", "tiktok", "twitch"]);

function platformUrl(raw: string | undefined): { provider: ContentProvider; id: string; url: string } | null {
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    const host = parsed.hostname.toLowerCase().replace(/^(?:www|m|mobile)\./, "");
    const path = parsed.pathname;
    let id: string | undefined;
    if (host === "x.com" || host === "twitter.com") {
      id = /\/(?:status|statuses)\/(\d+)(?:\/|$)/.exec(path)?.[1];
      if (id) return { provider: "x", id, url: `https://x.com/i/status/${id}` };
    }
    if (host === "youtube.com" || host === "youtube-nocookie.com" || host === "youtu.be") {
      id = host === "youtu.be" ? path.split("/")[1] : parsed.searchParams.get("v") ?? /\/(?:shorts|embed|live)\/([^/]+)/.exec(path)?.[1];
      if (id && /^[\w-]{11}$/.test(id)) return { provider: "youtube", id, url: `https://www.youtube.com/watch?v=${id}` };
    }
    if (host === "instagram.com") {
      id = /\/(?:p|reel|reels|tv)\/([\w-]+)(?:\/|$)/.exec(path)?.[1];
      if (id) return { provider: "instagram", id, url: `https://www.instagram.com/p/${id}` };
    }
    if (host === "tiktok.com") {
      id = /\/(?:video|photo)\/(\d+)(?:\/|$)/.exec(path)?.[1];
      if (id) return { provider: "tiktok", id, url: `https://www.tiktok.com/@_/video/${id}` };
    }
    if (host === "twitch.tv") {
      id = /^\/videos\/(\d+)(?:\/|$)/.exec(path)?.[1];
      if (id) return { provider: "twitch", id: `video:${id}`, url: `https://www.twitch.tv/videos/${id}` };
      id = /\/clip\/([\w-]+)(?:\/|$)/.exec(path)?.[1];
      if (id) return { provider: "twitch", id: `clip:${id}`, url: `https://clips.twitch.tv/${id}` };
    }
    if (host === "clips.twitch.tv") {
      // /embed is a player route, never the shared identity of its clips.
      id = /^\/embed\/?$/.test(path)
        ? parsed.searchParams.get("clip") ?? undefined
        : /^\/([\w-]+)\/?$/.exec(path)?.[1];
      if (id && /^[\w-]+$/.test(id)) return { provider: "twitch", id: `clip:${id}`, url: `https://clips.twitch.tv/${id}` };
    }
  } catch { /* Invalid/internal/CDN URLs do not identify provider content. */ }
  return null;
}

function inferredProvider(value: string | undefined): ContentProvider | undefined {
  if (!value) return undefined;
  const match = /^(x|youtube|instagram|tiktok|twitch):/.exec(value);
  if (match) return match[1] as ContentProvider;
  const clip = /^clip-(x|youtube|instagram|tiktok|twitch)-/.exec(value);
  if (clip) return clip[1] as ContentProvider;
  if (/^x-\d/.test(value)) return "x";
  if (/^yt-/.test(value)) return "youtube";
  if (/^ig-/.test(value)) return "instagram";
  if (/^tt-/.test(value)) return "tiktok";
  if (/^(?:vod|clip)-/.test(value)) return "twitch";
  // The original saved-list format used bare YouTube video IDs.
  if (/^[\w-]{11}$/.test(value)) return "youtube";
  return undefined;
}

function normalizeId(provider: ContentProvider, raw: string | undefined): string | null {
  if (!raw || raw.length > 500) return null;
  let id = raw.trim().replace(new RegExp(`^${provider}:`), "");
  if (id.startsWith(`clip-${provider}-`)) id = (provider === "twitch" ? "clip:" : "") + id.slice(`clip-${provider}-`.length);
  if (provider === "youtube") return /^[\w-]{11}$/.test(id = id.replace(/^yt-/, "")) ? id : null;
  if (provider === "x") return /^(\d+)(?:[-_:].*)?$/.exec(id.replace(/^x-/, ""))?.[1] ?? null;
  if (provider === "tiktok") return /^\d+$/.test(id = id.replace(/^tt-/, "")) ? id : null;
  if (provider === "instagram") return /^[\w-]+$/.test(id = id.replace(/^ig-/, "")) ? id : null;
  if (/^(?:vod-|video:)?\d+$/.test(id)) return `video:${id.replace(/^(?:vod-|video:)/, "")}`;
  if (/^(?:clip-|clip:)[\w-]+$/.test(id)) return `clip:${id.replace(/^clip[-:]/, "")}`;
  return null;
}

/** Multiple aliases join numeric Instagram IDs to shortcodes and media cards to their parent post. */
export function contentIdentityKeys(input: ContentIdentityInput): string[] {
  const urls = [input.sourceUrl, input.url, input.href].flatMap((raw) => { const parsed = platformUrl(raw); return parsed ? [parsed] : []; });
  const explicit = input.provider ?? input.platform;
  // Editorial items may embed a genuine provider source. Only its validated
  // permalink carries identity; an editorial ID prefix alone proves nothing.
  const editorial = Boolean(explicit && !providers.has(explicit));
  const provider = (editorial ? urls[0]?.provider : explicit as ContentProvider | undefined)
    ?? (editorial ? undefined : urls[0]?.provider ?? inferredProvider(input.canonicalId ?? input.id));
  if (!provider) return [];
  const keys = new Set<string>();
  for (const raw of editorial ? [] : [input.providerId, input.canonicalProviderId, input.canonicalId, input.id,
    provider === "x" ? input.x?.statusId : undefined,
    provider === "twitch" ? input.twitch?.vodId : undefined]) {
    const id = normalizeId(provider, raw);
    if (id) keys.add(`${provider}:id:${id}`);
  }
  for (const parsed of urls) {
    if (parsed.provider !== provider) continue;
    keys.add(`${provider}:id:${parsed.id}`);
    keys.add(`${provider}:url:${parsed.url}`);
  }
  return [...keys].sort();
}

export function contentReferencesIncludingQuotes(input: ContentIdentityInput): ContentIdentityInput[] {
  return [input, ...[input.x?.quote, input.x?.quoteReference].flatMap((quote) => quote
    ? [{ provider: "x", providerId: quote.statusId, sourceUrl: quote.statusUrl }] : []),
    ...(input.dvr?.twitchVodId ? [{ provider: "twitch", providerId: `video:${input.dvr.twitchVodId}` }] : [])];
}

export function isContentUnavailable(input: ContentIdentityInput, keys: ReadonlySet<string>): boolean {
  return contentIdentityKeys(input).some((key) => keys.has(key));
}

/** A removed quote does not remove its still-public parent, but its copied text/media must disappear. */
export function sanitizeAvailableContent<T extends ContentIdentityInput>(items: readonly T[], keys: ReadonlySet<string>): T[] {
  return items.flatMap((item) => {
    if (isContentUnavailable(item, keys)) return [];
    const quote = item.x?.quote;
    const reference = item.x?.quoteReference;
    const blockedQuote = [quote, reference].some((entry) => entry && isContentUnavailable({ provider: "x", providerId: entry.statusId, sourceUrl: entry.statusUrl }, keys));
    const blockedDvr = item.dvr?.twitchVodId && isContentUnavailable({ provider: "twitch", providerId: `video:${item.dvr.twitchVodId}` }, keys);
    if (!blockedQuote && !blockedDvr) return [item];
    const sanitized = { ...item };
    if (blockedQuote) {
      const x = { ...item.x };
      delete x.quote;
      delete x.quoteReference;
      sanitized.x = x;
    }
    // A deleted growing VOD disables rewind without pretending its live channel is deleted.
    if (blockedDvr) delete sanitized.dvr;
    return [sanitized];
  });
}
