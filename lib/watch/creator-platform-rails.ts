import type { WatchItem } from "./types";

export type CuratedChannelPlatform = "twitch" | "youtube" | "tiktok" | "instagram" | "x";

export type CuratedChannelRailKind =
  | "live"
  | "broadcasts"
  | "videos"
  | "shorts"
  | "posts";

/** Safe, token-free state supplied by the server-side official feed adapter. */
export type CuratedChannelSourceState =
  | "ready"
  | "invalid_account_ref"
  | "not_configured"
  | "scope_missing"
  | "token_unavailable"
  | "vault_unavailable";

export type CuratedChannelSourceDiagnostic = {
  platform: "tiktok" | "instagram";
  handle: string;
  state: CuratedChannelSourceState;
};

export type CuratedChannelSourceDescriptor = {
  platform: CuratedChannelPlatform | "snapchat" | "wikipedia";
  label: string;
  handle?: string;
  href?: string;
  ingestState?: CuratedChannelSourceState;
};

export type CuratedChannelRail = {
  id: string;
  /** Shared by format-specific rails from the same connected account. */
  sourceKey: string;
  platform: CuratedChannelPlatform;
  sourceLabel: string;
  accountLabel?: string;
  handle?: string;
  sourceHref?: string;
  ingestState?: CuratedChannelSourceState;
  kind: CuratedChannelRailKind;
  items: WatchItem[];
};

export type CuratedChannelRailOptions = {
  maxItemsPerSource?: number;
  /** Configured sources remain visible when an upstream adapter returns no posts. */
  sources?: readonly CuratedChannelSourceDescriptor[];
};

const SUPPORTED_PLATFORMS = new Set<CuratedChannelPlatform>([
  "twitch",
  "youtube",
  "tiktok",
  "instagram",
  "x",
]);

const PLATFORM_ORDER: Record<CuratedChannelPlatform, number> = {
  twitch: 0,
  youtube: 1,
  tiktok: 2,
  instagram: 3,
  x: 4,
};

const KIND_ORDER: Record<CuratedChannelRailKind, number> = {
  live: 0,
  broadcasts: 1,
  videos: 2,
  shorts: 3,
  posts: 4,
};

const PLATFORM_LABEL: Record<CuratedChannelPlatform, string> = {
  twitch: "Twitch",
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  x: "X",
};

function boundedLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 12;
  return Math.max(1, Math.min(24, Math.trunc(value)));
}

function timestamp(item: WatchItem): number {
  for (const value of [item.live?.startedAt, item.publishedAt]) {
    const parsed = Date.parse(value ?? "");
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function newestFirst(left: WatchItem, right: WatchItem): number {
  return timestamp(right) - timestamp(left) || left.id.localeCompare(right.id);
}

function normalizedAccount(value: string | undefined, platform: CuratedChannelPlatform): string {
  const normalized = value?.trim().toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return normalized || platform;
}

function accountLabel(item: WatchItem): string {
  return item.accountLabel?.trim() || item.memberLabel.trim() || PLATFORM_LABEL[item.platform as CuratedChannelPlatform];
}

function sourceKey(platform: CuratedChannelPlatform, label: string): string {
  return `${platform}:${normalizedAccount(label, platform)}`;
}

function safeHttpUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

function canonicalUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, "https://core.local");
    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_.+|fbclid|gclid|si)$/i.test(key)) url.searchParams.delete(key);
    }
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return null;
  }
}

function dedupeKey(item: WatchItem): string {
  const canonical = canonicalUrl(item.sourceUrl);
  return canonical
    ? `${item.platform}:url:${canonical}`
    : `${item.platform}:id:${item.id.trim().toLocaleLowerCase("en-US")}`;
}

function railKind(item: WatchItem): CuratedChannelRailKind | null {
  if (item.platform === "x") return "posts";
  if (item.kind === "live" || item.format === "live") return "live";
  if (
    (item.platform === "twitch" || item.platform === "youtube") &&
    item.kind === "vod"
  ) {
    return "broadcasts";
  }
  if (item.platform === "youtube") {
    return item.format === "short" ? "shorts" : "videos";
  }
  if (item.platform === "tiktok") return "shorts";
  if (item.platform === "instagram") {
    if (item.format === "photo" || item.kind === "post") return "posts";
    if (item.format === "short") return "shorts";
    return "videos";
  }
  if (item.platform === "twitch") return "videos";
  return null;
}

function descriptorDefaultKind(platform: CuratedChannelPlatform): CuratedChannelRailKind {
  if (platform === "tiktok") return "shorts";
  if (platform === "instagram" || platform === "x") return "posts";
  if (platform === "twitch") return "live";
  return "videos";
}

function railId(source: string, kind: CuratedChannelRailKind): string {
  return `${source}:${kind}`;
}

/**
 * Split a creator's already-scoped catalog window into deterministic rails.
 * The helper deliberately does not infer ownership: callers pass `hub.all`
 * (or another explicitly scoped list), preventing cross-creator leakage.
 */
export function buildCuratedChannelRails(
  items: readonly WatchItem[],
  options: CuratedChannelRailOptions = {},
): CuratedChannelRail[] {
  const limit = boundedLimit(options.maxItemsPerSource);
  const groups = new Map<string, CuratedChannelRail>();
  const seen = new Set<string>();

  for (const item of [...items].sort(newestFirst)) {
    if (!SUPPORTED_PLATFORMS.has(item.platform as CuratedChannelPlatform)) continue;
    const platform = item.platform as CuratedChannelPlatform;
    const kind = railKind(item);
    if (!kind) continue;
    const key = dedupeKey(item);
    if (seen.has(key)) continue;
    seen.add(key);

    const label = accountLabel(item);
    const source = sourceKey(platform, label);
    const id = railId(source, kind);
    const existing = groups.get(id);
    if (existing) {
      if (existing.items.length < limit) existing.items.push(item);
      continue;
    }
    groups.set(id, {
      id,
      sourceKey: source,
      platform,
      sourceLabel: label,
      accountLabel: label,
      kind,
      items: [item],
    });
  }

  for (const descriptor of options.sources ?? []) {
    if (!SUPPORTED_PLATFORMS.has(descriptor.platform as CuratedChannelPlatform)) continue;
    const platform = descriptor.platform as CuratedChannelPlatform;
    const label = descriptor.label.trim() || descriptor.handle?.trim() || PLATFORM_LABEL[platform];
    const source = sourceKey(platform, label);
    const matching = [...groups.values()].filter((rail) => rail.sourceKey === source);
    if (matching.length) {
      for (const rail of matching) {
        rail.sourceLabel = label;
        rail.accountLabel = label;
        rail.handle = descriptor.handle?.trim() || undefined;
        rail.sourceHref = safeHttpUrl(descriptor.href);
        rail.ingestState = rail.items.length ? "ready" : descriptor.ingestState;
      }
      continue;
    }
    const kind = descriptorDefaultKind(platform);
    const id = railId(source, kind);
    groups.set(id, {
      id,
      sourceKey: source,
      platform,
      sourceLabel: label,
      accountLabel: label,
      handle: descriptor.handle?.trim() || undefined,
      sourceHref: safeHttpUrl(descriptor.href),
      ingestState: descriptor.ingestState,
      kind,
      items: [],
    });
  }

  return [...groups.values()].sort((left, right) => {
    // Current broadcasts always lead. After that, keep each provider together
    // so a creator's several YouTube channels do not get interleaved with
    // TikTok or Instagram merely because one channel also publishes Shorts.
    const liveOrder = Number(right.kind === "live") - Number(left.kind === "live");
    return liveOrder ||
      PLATFORM_ORDER[left.platform] - PLATFORM_ORDER[right.platform] ||
      KIND_ORDER[left.kind] - KIND_ORDER[right.kind] ||
      left.sourceLabel.localeCompare(right.sourceLabel);
  });
}
