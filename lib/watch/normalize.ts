import type { WatchItem, WatchPlatform } from "./types";

const PLATFORM_ORDER: readonly WatchPlatform[] = [
  "twitch",
  "youtube",
  "tiktok",
  "instagram",
  "x",
  "house",
];

function timestamp(value: string | undefined): number {
  if (!value) return -Infinity;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : -Infinity;
}

function canonicalSourceUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    }
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return raw.trim() || null;
  }
}

function richness(item: WatchItem): number {
  return (
    (item.mediaUrl ? 8 : 0) +
    (item.embedUrl ? 4 : 0) +
    (item.durationSeconds ? 2 : 0) +
    (item.width && item.height ? 2 : 0) +
    (item.poster && !item.poster.endsWith("/embed-preview.png") ? 1 : 0)
  );
}

function normalizedItem(item: WatchItem): WatchItem {
  const published = timestamp(item.publishedAt);
  const sources = `${item.sourceUrl ?? ""}\n${item.href ?? ""}`;
  const isLive = item.kind === "live" || item.format === "live";
  const isPhoto = item.format === "photo";
  const shortForm =
    !isLive &&
    !isPhoto &&
    (item.format === "short" ||
      item.platform === "tiktok" ||
      (item.platform === "youtube" && /\/shorts\//i.test(sources)) ||
      (item.platform === "instagram" && /\/reels?\//i.test(sources)));
  const format =
    isLive ? "live" : isPhoto ? "photo" : shortForm ? "short" : item.format;
  const ratio = item.width && item.height ? item.width / item.height : null;
  const measuredOrientation =
    ratio == null
      ? undefined
      : ratio < 0.88
        ? "portrait"
        : ratio > 1.12
          ? "landscape"
          : "square";
  // The shared short-form lane is deliberately 9:16. Provider metadata can
  // be stale (especially RSS thumbnails), so a known Short/Reel/TikTok must
  // win over a misleading landscape poster or cached orientation.
  const orientation = format === "photo"
    ? measuredOrientation ?? item.orientation ?? "square"
    : shortForm
      ? "portrait"
      : measuredOrientation ?? item.orientation ?? "landscape";
  return {
    ...item,
    publishedAt: Number.isFinite(published) ? new Date(published).toISOString() : undefined,
    format,
    orientation,
  };
}

/**
 * Canonicalize, de-duplicate and order catalog items. Live rooms always lead;
 * everything else is newest-first with deterministic platform/id tie breaks.
 */
export function normalizeWatchItems(items: readonly WatchItem[]): WatchItem[] {
  const byKey = new Map<string, WatchItem>();
  const sourceToKey = new Map<string, string>();

  for (const raw of items) {
    const item = normalizedItem(raw);
    const idKey = `${item.platform}:${item.id}`;
    const source = canonicalSourceUrl(item.sourceUrl);
    const sourceKey = source ? `${item.platform}:${source}` : null;
    const existingKey = sourceKey ? sourceToKey.get(sourceKey) ?? idKey : idKey;
    const existing = byKey.get(existingKey);

    if (!existing) {
      byKey.set(existingKey, item);
      if (sourceKey) sourceToKey.set(sourceKey, existingKey);
      continue;
    }

    // Prefer the richer transport metadata while retaining any useful fields
    // that only exist on the other representation of the same platform item.
    const preferred = richness(item) > richness(existing) ? item : existing;
    const fallback = preferred === item ? existing : item;
    const mergedFormat =
      preferred.format === "live" || fallback.format === "live"
        ? "live"
        : preferred.format === "photo" || fallback.format === "photo"
          ? "photo"
          : preferred.format === "short" || fallback.format === "short"
            ? "short"
            : preferred.format ?? fallback.format;
    byKey.set(existingKey, normalizedItem({
      ...fallback,
      ...preferred,
      format: mergedFormat,
      mediaUrl: preferred.mediaUrl ?? fallback.mediaUrl,
      embedUrl: preferred.embedUrl ?? fallback.embedUrl,
      duration: preferred.duration ?? fallback.duration,
      durationSeconds: preferred.durationSeconds ?? fallback.durationSeconds,
      chapters: preferred.chapters?.length ? preferred.chapters : fallback.chapters,
      relatedFullVideoId: preferred.relatedFullVideoId ?? fallback.relatedFullVideoId,
      captions: preferred.captions?.length ? preferred.captions : fallback.captions,
      qualities: preferred.qualities?.length ? preferred.qualities : fallback.qualities,
      audioDescriptionUrl: preferred.audioDescriptionUrl ?? fallback.audioDescriptionUrl,
      dvr: preferred.dvr ?? fallback.dvr,
      width: preferred.width ?? fallback.width,
      height: preferred.height ?? fallback.height,
      live: preferred.live ?? fallback.live,
    }));
  }

  const platformIndex = new Map(PLATFORM_ORDER.map((platform, index) => [platform, index]));
  return [...byKey.values()].sort((a, b) => {
    const aLive = a.kind === "live" || a.format === "live";
    const bLive = b.kind === "live" || b.format === "live";
    if (aLive !== bLive) return aLive ? -1 : 1;
    const aTimestamp = timestamp(a.publishedAt);
    const bTimestamp = timestamp(b.publishedAt);
    if (aTimestamp !== bTimestamp) return bTimestamp > aTimestamp ? 1 : -1;
    const platformDelta = (platformIndex.get(a.platform) ?? 99) - (platformIndex.get(b.platform) ?? 99);
    return platformDelta || a.id.localeCompare(b.id);
  });
}

/** Parse Twitch's compact `3h21m4s` duration into seconds. */
export function twitchDurationSeconds(raw: string): number | undefined {
  const hours = Number(/(\d+)h/.exec(raw)?.[1] ?? 0);
  const minutes = Number(/(\d+)m/.exec(raw)?.[1] ?? 0);
  const seconds = Number(/(\d+)s/.exec(raw)?.[1] ?? 0);
  const total = hours * 3600 + minutes * 60 + seconds;
  return Number.isFinite(total) && total > 0 ? total : undefined;
}

export function groupWatchItemsByPlatform(
  items: readonly WatchItem[],
): Record<WatchPlatform, WatchItem[]> {
  const grouped: Record<WatchPlatform, WatchItem[]> = {
    twitch: [],
    youtube: [],
    tiktok: [],
    instagram: [],
    x: [],
    house: [],
  };
  for (const item of items) grouped[item.platform].push(item);
  return grouped;
}
