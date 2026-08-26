import type { WatchItem, WatchKind, WatchPlatform } from "./types";

/**
 * The only browser event emitted when an always-on network changes from a
 * regular program to a newly live broadcast.  This is deliberately a signal,
 * not a playback command: the radio/audio director may render a caption or
 * play one already-approved cached cue, but it must not retune, pause, or
 * otherwise interrupt the viewer's media by itself.
 */
export const NETWORK_LIVE_TAKEOVER_EVENT = "core:watch-network-live-takeover";

/** Per-tab memory keeps router refreshes and provider retries from repeating a cue. */
export const NETWORK_LIVE_TAKEOVER_SESSION_KEY = "core:watch-network-live-takeovers:v1";

const MAX_REMEMBERED_TAKEOVERS = 160;
const inMemoryDeliveredTakeovers = new Set<string>();

/** Structural on purpose: both WatchItem and the focused Player `Playable` fit it. */
type MediaIdentity = {
  key?: string | null;
  kind?: WatchItem["kind"] | null;
  format?: WatchItem["format"] | null;
  platform?: WatchPlatform | null;
  title?: string | null;
};

export type NetworkLiveTakeoverDetail = {
  schemaVersion: 1;
  /** Stable per-network/per-provider-live-session de-duplication key. */
  id: string;
  type: "network-live-takeover";
  network: {
    slug: string;
    name: string;
    href: string;
    channel: "24/7";
  };
  live: {
    /** Canonical provider session identity, not a generated message ID. */
    sourceId: string;
    itemId: string;
    platform: WatchPlatform;
    streamId: string | null;
    login: string | null;
    creatorSlug: string | null;
    creatorName: string;
    title: string;
    artwork: string;
    href: string;
    startedAt: string | null;
  };
  previous: {
    itemId: string;
    title: string;
    kind: WatchKind;
    platform: WatchPlatform;
  } | null;
  /** Snapshot of the focused player at the instant the cue was considered. */
  viewer: {
    activePlayback: {
      key: string | null;
      kind: WatchKind | null;
      format: WatchItem["format"] | null;
      platform: WatchPlatform | null;
      title: string | null;
      isLive: boolean;
    } | null;
    wasWatchingLive: false;
  };
  triggeredAt: string;
  /** Contract for all listeners, including the DJ Cora audio director. */
  policy: {
    onlyFor24x7: true;
    suppressWhileViewerOnLive: true;
    /** Kept explicit so older listeners can make the same safe decision. */
    viewerIsWatchingLive: false;
    delivery: "non-interrupting";
  };
};

export type NetworkLiveTakeoverCandidate = {
  mode: string;
  previous: WatchItem | null | undefined;
  next: WatchItem | null | undefined;
  /** The focused shared-player media, if one is active. */
  activePlayback: MediaIdentity | null | undefined;
};

/** A live session must never be inferred from a title or a browser timestamp. */
export function isLiveMedia(item: MediaIdentity | null | undefined): boolean {
  return item?.kind === "live" || item?.format === "live";
}

/**
 * Prefer immutable provider session IDs. Older/partial provider records still
 * get a stable fallback that is scoped to the item, login, and reported start.
 */
export function networkLiveSourceId(item: WatchItem): string | null {
  if (!isLiveMedia(item)) return null;
  const streamId = item.live?.streamId ?? item.twitch?.streamId;
  if (streamId) return `${item.platform}:stream:${streamId}`;

  const login = item.live?.login?.trim().toLowerCase() || "unknown";
  const startedAt = item.live?.startedAt ?? item.publishedAt ?? "unknown";
  return `${item.platform}:item:${item.id}:login:${login}:started:${startedAt}`;
}

/**
 * A live cue is allowed only for a real, observed non-live -> live handoff in
 * a 24/7 view. Any already-focused live player wins; it receives no cue and
 * is never retuned by this signal.
 */
export function shouldAnnounceNetworkLiveTakeover(candidate: NetworkLiveTakeoverCandidate): boolean {
  if (candidate.mode !== "continuous") return false;
  if (!candidate.previous || !candidate.next) return false;
  if (isLiveMedia(candidate.previous)) return false;
  if (!isLiveMedia(candidate.next)) return false;
  if (isLiveMedia(candidate.activePlayback)) return false;
  return Boolean(networkLiveSourceId(candidate.next));
}

export function networkLiveTakeoverId(networkSlug: string, item: WatchItem): string | null {
  const sourceId = networkLiveSourceId(item);
  const slug = networkSlug.trim().toLowerCase();
  return sourceId && slug ? `network-live-takeover:${slug}:${sourceId}` : null;
}

export function createNetworkLiveTakeoverDetail(input: {
  network: { slug: string; name: string; href: string };
  next: WatchItem;
  previous?: WatchItem | null;
  activePlayback?: MediaIdentity | null;
  triggeredAt?: string;
}): NetworkLiveTakeoverDetail | null {
  const sourceId = networkLiveSourceId(input.next);
  const id = networkLiveTakeoverId(input.network.slug, input.next);
  if (!sourceId || !id || isLiveMedia(input.activePlayback)) return null;

  return {
    schemaVersion: 1,
    id,
    type: "network-live-takeover",
    network: {
      slug: input.network.slug,
      name: input.network.name,
      href: input.network.href,
      channel: "24/7",
    },
    live: {
      sourceId,
      itemId: input.next.id,
      platform: input.next.platform,
      streamId: input.next.live?.streamId ?? input.next.twitch?.streamId ?? null,
      login: input.next.live?.login ?? null,
      creatorSlug: input.next.memberSlug,
      creatorName: input.next.memberLabel,
      title: input.next.title,
      artwork: input.next.backdrop || input.next.poster,
      href: input.next.href,
      startedAt: input.next.live?.startedAt ?? input.next.publishedAt ?? null,
    },
    previous: input.previous ? {
      itemId: input.previous.id,
      title: input.previous.title,
      kind: input.previous.kind,
      platform: input.previous.platform,
    } : null,
    viewer: {
      activePlayback: input.activePlayback ? {
        key: input.activePlayback.key ?? null,
        kind: input.activePlayback.kind ?? null,
        format: input.activePlayback.format ?? null,
        platform: input.activePlayback.platform ?? null,
        title: input.activePlayback.title ?? null,
        isLive: isLiveMedia(input.activePlayback),
      } : null,
      // `shouldAnnounceNetworkLiveTakeover` must have already rejected any
      // live focus before this detail is created/dispatched.
      wasWatchingLive: false,
    },
    triggeredAt: input.triggeredAt ?? new Date().toISOString(),
    policy: {
      onlyFor24x7: true,
      suppressWhileViewerOnLive: true,
      viewerIsWatchingLive: false,
      delivery: "non-interrupting",
    },
  };
}

function deliveredTakeoverIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(NETWORK_LIVE_TAKEOVER_SESSION_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string").slice(-MAX_REMEMBERED_TAKEOVERS)
      : [];
  } catch {
    return [];
  }
}

/**
 * Emit a one-time browser signal. This function contains no audio, TTS, API,
 * or player operations, so a catalog refresh can never generate credit usage.
 */
export function dispatchNetworkLiveTakeover(detail: NetworkLiveTakeoverDetail): boolean {
  if (typeof window === "undefined") return false;
  const delivered = deliveredTakeoverIds();
  if (delivered.includes(detail.id) || inMemoryDeliveredTakeovers.has(detail.id)) return false;
  inMemoryDeliveredTakeovers.add(detail.id);
  while (inMemoryDeliveredTakeovers.size > MAX_REMEMBERED_TAKEOVERS) {
    const oldest = inMemoryDeliveredTakeovers.values().next().value;
    if (!oldest) break;
    inMemoryDeliveredTakeovers.delete(oldest);
  }

  try {
    window.sessionStorage.setItem(
      NETWORK_LIVE_TAKEOVER_SESSION_KEY,
      JSON.stringify([...delivered, detail.id].slice(-MAX_REMEMBERED_TAKEOVERS)),
    );
  } catch {
    // The event itself remains useful in storage-restricted contexts. The
    // receiver should still perform its own in-memory de-duplication.
  }

  window.dispatchEvent(new CustomEvent<NetworkLiveTakeoverDetail>(NETWORK_LIVE_TAKEOVER_EVENT, { detail }));
  return true;
}
