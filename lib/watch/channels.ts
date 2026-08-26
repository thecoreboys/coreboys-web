import type { WatchCatalog, WatchItem } from "./types";

export type NetworkChannelSlug =
  | "core"
  | "adapt"
  | "ron"
  | "lacy"
  | "marlon"
  | "jason"
  | "silky";

/**
 * A network's distinct linear channels. `continuous` is the on-air "24/7"
 * rotation; `live` contains current streams and completed broadcasts from
 * every connected provider that exposes them.
 */
export type NetworkChannelMode = "live" | "videos" | "shorts" | "continuous";

export type NetworkChannel = {
  slug: NetworkChannelSlug;
  name: string;
  community: string;
  host: string;
  memberSlug: Exclude<NetworkChannelSlug, "core"> | null;
  description: string;
  artwork: string;
  backdrop: string;
  accent: string;
};

export type ChannelActivityKind =
  | "live"
  | "replay"
  | "youtube"
  | "tiktok"
  | "reel"
  | "photo"
  | "short"
  | "clip";

export type ChannelActivity = {
  item: WatchItem;
  kind: ChannelActivityKind;
  label: string;
};

/** Complete, non-overlapping content shelves for a creator/network page. */
export type NetworkChannelHub = {
  all: WatchItem[];
  live: WatchItem[];
  broadcasts: WatchItem[];
  videos: WatchItem[];
  shorts: WatchItem[];
  photos: WatchItem[];
  xPosts: WatchItem[];
  clips: WatchItem[];
  more: WatchItem[];
};

export type GuideNetworkPlayerChannel = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  artwork: string;
};

/** A player-ready row rendered beneath one community/network in the Guide. */
export type GuideNetworkRow = {
  id: string;
  networkSlug: NetworkChannelSlug;
  kind: NetworkChannelMode;
  label: "Live" | "Videos" | "Shorts" | "24/7";
  description: string;
  /** Matches Guide program slugs (`house` for CORE, member slug otherwise). */
  timelineSlug: "house" | Exclude<NetworkChannelSlug, "core">;
  channel: GuideNetworkPlayerChannel;
  /** All real, currently available connected-source items for this row. */
  items: WatchItem[];
};

export type GuideNetworkGroup = {
  network: NetworkChannel;
  rows: GuideNetworkRow[];
};

const CHANNELS: readonly NetworkChannel[] = [
  {
    slug: "core",
    name: "CORE Network",
    community: "CORE House",
    host: "All CORE",
    memberSlug: null,
    description: "The whole house in one continuous channel: live rooms, uploads, replays, and the clips between them.",
    artwork: "/brand/logo-core-white.png",
    backdrop: "/brand/network-backgrounds/core.png",
    accent: "#db0368",
  },
  {
    slug: "adapt",
    name: "Flock",
    community: "Flock",
    host: "Adapt",
    memberSlug: "adapt",
    description: "Adapt's always-on Flock channel, programmed from live broadcasts, YouTube, and the archive.",
    artwork: "/comms/adapt.png",
    backdrop: "/brand/network-backgrounds/flock.png",
    accent: "#ef4444",
  },
  {
    slug: "ron",
    name: "Stable",
    community: "Stable",
    host: "StableRonaldo",
    memberSlug: "ron",
    description: "Stable live, on demand, and back in rotation around the clock.",
    artwork: "/comms/ron.png",
    backdrop: "/brand/network-backgrounds/stable.png",
    accent: "#3b82f6",
  },
  {
    slug: "lacy",
    name: "Thugs",
    community: "Thugs",
    host: "Lacy",
    memberSlug: "lacy",
    description: "The Thugs channel: Lacy live, full broadcasts, uploads, and short-form intermissions.",
    artwork: "/comms/lacy.png",
    backdrop: "/brand/network-backgrounds/thugs.png",
    accent: "#ef4444",
  },
  {
    slug: "marlon",
    name: "M3",
    community: "M3",
    host: "Marlon",
    memberSlug: "marlon",
    description: "M3 programming from Marlon's live room, YouTube catalog, and replay archive.",
    artwork: "/comms/marlon.png",
    backdrop: "/brand/network-backgrounds/m3.png",
    accent: "#f4f4f5",
  },
  {
    slug: "jason",
    name: "NMS",
    community: "NMS",
    host: "JasonTheWeen",
    memberSlug: "jason",
    description: "NMS, always moving: Jason live, recent uploads, broadcasts, and shorts.",
    artwork: "/comms/jason.png",
    backdrop: "/brand/network-backgrounds/nms.png",
    accent: "#fbbf24",
  },
  {
    slug: "silky",
    name: "SLG",
    community: "SLG",
    host: "Silky",
    memberSlug: "silky",
    description: "SLG television, built from Silky's live broadcasts, replays, videos, and reels.",
    artwork: "/comms/silky.png",
    backdrop: "/brand/network-backgrounds/slg.png",
    accent: "#f59e0b",
  },
] as const;

const ALIASES: Readonly<Record<string, NetworkChannelSlug>> = {
  core: "core",
  house: "core",
  "core-house": "core",
  "core-network": "core",
  flock: "adapt",
  adapt: "adapt",
  stable: "ron",
  stableronaldo: "ron",
  ron: "ron",
  thugs: "lacy",
  lacy: "lacy",
  m3: "marlon",
  marlon: "marlon",
  nms: "jason",
  jason: "jason",
  jasontheween: "jason",
  slg: "silky",
  silky: "silky",
};

export const NETWORK_CHANNELS = CHANNELS;

export function resolveNetworkChannel(value: string): NetworkChannel | null {
  const slug = ALIASES[value.trim().toLowerCase()];
  return slug ? CHANNELS.find((channel) => channel.slug === slug) ?? null : null;
}

function timestamp(item: WatchItem): number {
  for (const candidate of [item.live?.startedAt, item.publishedAt]) {
    const parsed = Date.parse(candidate ?? "");
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function unique(items: readonly WatchItem[]): WatchItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.platform}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function newest(items: readonly WatchItem[]): WatchItem[] {
  return [...items].sort((a, b) => timestamp(b) - timestamp(a));
}

function roundRobin(items: readonly WatchItem[], keyFor: (item: WatchItem) => string): WatchItem[] {
  const buckets = new Map<string, WatchItem[]>();
  for (const item of newest(items)) {
    const key = keyFor(item);
    const bucket = buckets.get(key) ?? [];
    bucket.push(item);
    buckets.set(key, bucket);
  }
  const output: WatchItem[] = [];
  for (let depth = 0; ; depth += 1) {
    let added = false;
    for (const bucket of buckets.values()) {
      const item = bucket[depth];
      if (!item) continue;
      output.push(item);
      added = true;
    }
    if (!added) return output;
  }
}

function playable(item: WatchItem): boolean {
  if (item.format === "photo" || item.kind === "post") return false;
  return item.embeddable !== false || Boolean(item.mediaUrl || item.embedUrl);
}

function contentKey(item: WatchItem): string {
  return `${item.platform}:${item.id}`;
}

/** Small deterministic hash: stable on server/client and between deployments. */
function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Content-key shuffle rather than Math.random(), so hydration, saved queues,
 * and shared player sessions all observe the same 24/7 order.
 */
function stableShuffle(items: readonly WatchItem[], seed: string): WatchItem[] {
  return unique(items).sort((a, b) => {
    const aKey = contentKey(a);
    const bKey = contentKey(b);
    return stableHash(`${seed}:${aKey}`) - stableHash(`${seed}:${bKey}`) || aKey.localeCompare(bKey);
  });
}

function shuffledSourceMix(items: readonly WatchItem[], seed: string): WatchItem[] {
  const buckets = new Map<string, WatchItem[]>();
  for (const item of items) {
    const source = `${item.memberSlug ?? "core"}:${item.platform}:${item.accountLabel ?? "main"}`;
    const bucket = buckets.get(source) ?? [];
    bucket.push(item);
    buckets.set(source, bucket);
  }
  const keys = [...buckets.keys()].sort(
    (a, b) => stableHash(`${seed}:source:${a}`) - stableHash(`${seed}:source:${b}`) || a.localeCompare(b),
  );
  const queues = keys.map((key) => stableShuffle(buckets.get(key) ?? [], `${seed}:${key}`));
  const output: WatchItem[] = [];
  for (let depth = 0; ; depth += 1) {
    let added = false;
    for (const queue of queues) {
      const item = queue[depth];
      if (!item) continue;
      output.push(item);
      added = true;
    }
    if (!added) return output;
  }
}

/**
 * Give every creator a turn before repeating one creator's catalog, while
 * still mixing that creator's connected YouTube, TikTok, and Instagram
 * accounts. The seed changes once per UTC day so the shared linear channel is
 * fresh without giving server render, hydration, and connected players
 * conflicting orders.
 */
function shuffledCreatorShortMix(
  items: readonly WatchItem[],
  seed: string,
): WatchItem[] {
  const creators = new Map<string, WatchItem[]>();
  for (const item of unique(items)) {
    const key = item.memberSlug ?? "core";
    const bucket = creators.get(key) ?? [];
    bucket.push(item);
    creators.set(key, bucket);
  }
  const keys = [...creators.keys()].sort(
    (a, b) => stableHash(`${seed}:creator:${a}`) - stableHash(`${seed}:creator:${b}`) || a.localeCompare(b),
  );
  const queues = keys.map((key) =>
    shuffledSourceMix(creators.get(key) ?? [], `${seed}:creator:${key}`),
  );
  const output: WatchItem[] = [];
  for (let depth = 0; ; depth += 1) {
    let added = false;
    for (const queue of queues) {
      const item = queue[depth];
      if (!item) continue;
      output.push(item);
      added = true;
    }
    if (!added) return output;
  }
}

function catalogDaySeed(catalog: WatchCatalog): string {
  const parsed = Date.parse(catalog.fetchedAt);
  return Number.isFinite(parsed)
    ? new Date(parsed).toISOString().slice(0, 10)
    : "evergreen";
}

function connectedYoutubeVideo(item: WatchItem): boolean {
  return (
    item.platform === "youtube" &&
    item.kind === "youtube" &&
    item.format !== "live" &&
    item.format !== "short"
  );
}

function connectedShort(item: WatchItem): boolean {
  if (item.format !== "short") return false;
  if (item.platform === "youtube") return item.kind === "youtube";
  if (item.platform !== "tiktok" && item.platform !== "instagram") return false;
  // Curated clip submissions also live in catalog.all. The connected social
  // adapters retain their provider ids; only curator records use clip-*.
  return item.kind === "clip" && !item.id.startsWith("clip-");
}

/** A provider-owned short that can actually play inside a linear channel. */
export function isConnectedShortChannelItem(item: WatchItem): boolean {
  return playable(item) && connectedShort(item);
}

function connectedNetworkActivity(item: WatchItem): boolean {
  if (item.platform === "twitch") {
    return item.kind === "live" || item.format === "live" || item.kind === "vod";
  }
  if (item.platform === "youtube") {
    return (item.kind === "youtube" || item.kind === "vod") && item.format !== "live";
  }
  if (item.platform === "tiktok") return connectedShort(item);
  if (item.platform === "instagram") {
    return item.format === "photo" || connectedShort(item);
  }
  return false;
}

function exactScope(
  catalog: WatchCatalog,
  channel: NetworkChannel,
  mode: NetworkChannelMode,
): WatchItem[] {
  const routedCommunity = (item: WatchItem) => {
    if (!item.programming?.community) return null;
    if (mode === "live") return false;
    return item.programming.routes.some(
      (route) => route.networkSlug === channel.slug && route.channelMode === mode,
    );
  };
  if (channel.memberSlug === null) {
    // CORE 24/7 and CORE Shorts are house-wide. Videos remains the official
    // CORE YouTube channel; every creator keeps their own dedicated rows too.
    return catalog.all.filter((item) => {
      const routed = routedCommunity(item);
      if (routed !== null) return routed && playable(item);
      return mode === "continuous" || mode === "shorts"
        ? playable(item)
        : item.memberSlug === null && playable(item);
    });
  }
  return catalog.all.filter((item) => {
    const routed = routedCommunity(item);
    return routed !== null
      ? routed && playable(item)
      : item.memberSlug === channel.memberSlug && playable(item);
  });
}

/** Exact semantics for the four Guide rows. */
export function buildNetworkChannelLineup(
  catalog: WatchCatalog,
  channel: NetworkChannel,
  mode: NetworkChannelMode,
): WatchItem[] {
  if (channel.memberSlug === null && mode === "live") return [];
  const scoped = exactScope(catalog, channel, mode);
  if (mode === "live") {
    const current = newest(scoped.filter(
      (item) => item.kind === "live" || item.format === "live",
    ));
    const broadcasts = newest(scoped.filter(
      (item) => item.kind === "vod",
    ));
    return unique([...current, ...broadcasts]);
  }
  if (mode === "videos") return newest(scoped.filter(connectedYoutubeVideo));
  if (mode === "shorts") {
    const shorts = scoped.filter(isConnectedShortChannelItem);
    if (channel.memberSlug === null) {
      return shuffledCreatorShortMix(
        shorts,
        `guide:core:shorts:v1:${catalogDaySeed(catalog)}`,
      );
    }
    return roundRobin(
      shorts,
      (item) => `${item.accountLabel ?? item.memberSlug ?? "core"}:${item.platform}`,
    );
  }
  const rotation = scoped.filter((item) => playable(item) && item.format !== "photo" && item.kind !== "post");
  return shuffledSourceMix(rotation, `guide:${channel.slug}:24-7:v2`);
}

/**
 * Backward-compatible channel-page helper. Historically `live` named the
 * default 24/7 channel; keep that behavior while new Guide code uses
 * buildNetworkChannelLineup for the literal Live row.
 */
export function buildNetworkLineup(
  catalog: WatchCatalog,
  channel: NetworkChannel,
  mode: NetworkChannelMode,
): WatchItem[] {
  return buildNetworkChannelLineup(catalog, channel, mode === "live" ? "continuous" : mode);
}

function rowLabel(mode: NetworkChannelMode): GuideNetworkRow["label"] {
  if (mode === "continuous") return "24/7";
  if (mode === "videos") return "Videos";
  if (mode === "shorts") return "Shorts";
  return "Live";
}

function rowDescription(channel: NetworkChannel, mode: NetworkChannelMode): string {
  if (mode === "live") return `${channel.host}'s current streams and past Twitch or YouTube broadcasts in their original order.`;
  if (mode === "videos") {
    return channel.memberSlug === null
      ? "Shows from the official CORE YouTube channel."
      : `Videos from ${channel.host}'s connected YouTube channels.`;
  }
  if (mode === "shorts") {
    return channel.memberSlug === null
      ? "A shuffled mix of YouTube Shorts, TikToks, and Instagram Reels from CORE and every member."
      : `YouTube Shorts, TikToks, and Instagram Reels from ${channel.host}'s connected accounts.`;
  }
  return channel.memberSlug === null
    ? "A balanced, continuous mix of playable broadcasts, videos, Shorts, TikToks, Reels, and clips from CORE and every creator."
    : `A balanced, continuous mix of ${channel.host}'s playable content from every connected platform.`;
}

function guideRow(
  catalog: WatchCatalog,
  channel: NetworkChannel,
  mode: NetworkChannelMode,
): GuideNetworkRow {
  const label = rowLabel(mode);
  const title = `${channel.name} ${label}`;
  const description = rowDescription(channel, mode);
  const href = mode === "continuous"
    ? `/channels/${encodeURIComponent(channel.slug)}`
    : `/channels/${encodeURIComponent(channel.slug)}?mode=${encodeURIComponent(mode)}`;
  return {
    id: `${channel.slug}:${mode}`,
    networkSlug: channel.slug,
    kind: mode,
    label,
    description,
    timelineSlug: channel.memberSlug ?? "house",
    channel: {
      id: `${channel.slug}:${mode}`,
      title,
      subtitle: description,
      href,
      artwork: channel.artwork,
    },
    items: buildNetworkChannelLineup(catalog, channel, mode),
  };
}

/**
 * Complete Guide hierarchy. Empty rows remain present (with no placeholder
 * programs) so missing credentials/content are represented honestly.
 */
export function buildGuideNetworkRows(catalog: WatchCatalog): GuideNetworkGroup[] {
  return NETWORK_CHANNELS.map((network) => {
    const modes: NetworkChannelMode[] = network.memberSlug === null
      ? ["videos", "shorts", "continuous"]
      : ["live", "videos", "shorts", "continuous"];
    return {
      network,
      rows: modes.map((mode) => guideRow(catalog, network, mode)),
    };
  });
}

export function activityKind(item: WatchItem): ChannelActivityKind {
  if (item.kind === "live" || item.format === "live") return "live";
  if (item.kind === "vod") return "replay";
  if (item.platform === "tiktok") return "tiktok";
  if (item.platform === "instagram" && item.format === "photo") return "photo";
  if (item.platform === "instagram") return "reel";
  if (item.platform === "youtube" && item.format === "short") return "short";
  if (item.platform === "youtube") return "youtube";
  return "clip";
}

const ACTIVITY_LABEL: Record<ChannelActivityKind, string> = {
  live: "Current live broadcast",
  replay: "Past broadcast",
  youtube: "YouTube post",
  tiktok: "TikTok",
  reel: "Instagram Reel",
  photo: "Instagram Photo",
  short: "YouTube Short",
  clip: "Clip",
};

/** Precise, compact source label shared by Guide and direct channel cards. */
export function mediaTypeLabel(item: WatchItem): string {
  if (item.platform === "twitch") {
    if (item.kind === "live" || item.format === "live") return "Twitch Live";
    if (item.kind === "vod") return "Twitch Broadcast";
    return "Twitch";
  }
  if (item.platform === "youtube") {
    if (item.kind === "vod") return "YouTube Broadcast";
    return item.format === "short" ? "YouTube Short" : "YouTube Video";
  }
  if (item.platform === "tiktok") return "TikTok";
  if (item.platform === "instagram") {
    return item.format === "photo" ? "Instagram Photo" : "Instagram Reel";
  }
  if (item.platform === "house") return item.format === "photo" ? "CORE Photo" : "CORE";
  return "X";
}

/**
 * Recent provider activity for a network, including non-linear Instagram
 * photos that intentionally do not become an extra Guide channel row.
 */
export function buildNetworkActivity(
  catalog: WatchCatalog,
  channel: NetworkChannel,
  mode: NetworkChannelMode = "continuous",
): ChannelActivity[] {
  const scoped = catalog.all.filter((item) => {
    if (channel.memberSlug === null && mode === "shorts") {
      return isConnectedShortChannelItem(item);
    }
    return item.memberSlug === channel.memberSlug && connectedNetworkActivity(item);
  });
  return buildChannelActivity(unique(scoped));
}

/**
 * Build the creator-hub shelves from the same normalized catalog used by
 * Watch and Guide. Each item is assigned once so the page can expose the
 * complete connected-source window without repeating a Reel as both a clip
 * and a Short, for example. CORE is intentionally house-wide; member
 * channels remain scoped to that creator only.
 */
export function buildNetworkChannelHub(
  catalog: WatchCatalog,
  channel: NetworkChannel,
): NetworkChannelHub {
  const routedCommunity = catalog.all.filter((item) =>
    item.programming?.routes.some((route) => route.networkSlug === channel.slug),
  );
  const nativeItems = channel.memberSlug === null
    ? catalog.all.filter((item) => !item.programming?.community)
    : catalog.byMember.find((entry) => entry.slug === channel.memberSlug)?.items
      ?? catalog.all.filter((item) => item.memberSlug === channel.memberSlug && !item.programming?.community);
  const memberItems = unique([...nativeItems, ...routedCommunity]);
  const all = newest(unique(memberItems));
  const hub: NetworkChannelHub = {
    all,
    live: [],
    broadcasts: [],
    videos: [],
    shorts: [],
    photos: [],
    xPosts: [],
    clips: [],
    more: [],
  };

  for (const item of all) {
    if (item.kind === "live" || item.format === "live") {
      hub.live.push(item);
    } else if (item.kind === "vod") {
      hub.broadcasts.push(item);
    } else if (
      item.format === "short" &&
      (item.platform === "youtube" || item.platform === "tiktok" || item.platform === "instagram")
    ) {
      hub.shorts.push(item);
    } else if (item.platform === "x") {
      hub.xPosts.push(item);
    } else if (item.format === "photo") {
      hub.photos.push(item);
    } else if (item.platform === "youtube") {
      hub.videos.push(item);
    } else if (item.kind === "clip") {
      hub.clips.push(item);
    } else {
      hub.more.push(item);
    }
  }

  return hub;
}

export function buildChannelActivity(items: readonly WatchItem[]): ChannelActivity[] {
  return newest(items).map((item) => {
    const kind = activityKind(item);
    return { item, kind, label: ACTIVITY_LABEL[kind] };
  });
}

export function itemDurationSeconds(item: WatchItem): number {
  if (Number.isFinite(item.durationSeconds) && (item.durationSeconds ?? 0) > 0) {
    // Provider duration is the source of truth for the linear schedule. Do
    // not silently turn an eight-hour broadcast into a six-hour slot: that
    // makes every later 24/7 program land at the wrong time.
    return Math.max(30, Math.floor(item.durationSeconds!));
  }
  if (item.kind === "live") return 2 * 60 * 60;
  if (item.kind === "vod") return 90 * 60;
  if (item.format === "short") return 60;
  if (item.kind === "clip") return 3 * 60;
  return 24 * 60;
}
