import "server-only";
import { MEMBERS } from "@/lib/members";
import { GROUP } from "@/lib/group";
import { getCoreFeed, getHouseFeed, type FeedItem } from "@/lib/social-feed";
import { PUBLIC_SOCIAL_ARCHIVE_ITEM_LIMIT } from "@/lib/social-feed-events";
import {
  buildLiveResponse,
  fetchChannelVideos,
  fetchUsersByLogin,
  type TwitchVod,
} from "@/lib/twitch";
import { getPublicClips } from "@/lib/clips-server";
import { formatDurationSeconds } from "@/lib/youtube-duration";
import type { WatchCatalog, WatchItem } from "./types";
import {
  groupWatchItemsByPlatform,
  normalizeWatchItems,
  twitchDurationSeconds,
} from "./normalize";
import { instagramPhotoShelfItems } from "./photos";
import { reconcileActiveTwitchArchives } from "./active-twitch-archives";
import { fetchWatchYoutubeMetadata } from "./youtube-metadata";
import { markCrossPlatformBroadcastAliases } from "./broadcast-aliases";
import { registerPassportWatchCatalog } from "@/lib/passport/watch-registry";
import { loadArchivedYouTubeWatchItems } from "@/lib/media-intelligence/archive";
import {
  EMPTY_WATCH_PROGRAMMING,
  getProgrammingFeedEntries,
  getWatchProgrammingSnapshot,
} from "./programming";

const CENTER = { x: 0.5, y: 0.5 } as const;

function ytId(item: FeedItem): string | null {
  if (item.id.startsWith("yt-")) return item.id.slice(3);
  const m = /(?:[?&]v=|youtu\.be\/|\/shorts\/|\/embed\/)([0-9A-Za-z_-]{6,})/.exec(item.url);
  return m?.[1] ?? null;
}

function memberOf(slug: string | null) {
  if (!slug) return null;
  return MEMBERS.find((m) => m.slug === slug) ?? null;
}

function fromYoutube(item: FeedItem): WatchItem | null {
  const id = ytId(item);
  if (!id) return null;
  const m = memberOf(item.authorSlug);
  const sourceUrl = item.sourceUrl ?? item.url;
  const short = item.format === "short" || /\/shorts\//i.test(sourceUrl);
  const isLive = item.isLive || item.format === "live";
  const isReplay = !isLive && Boolean(item.liveStartedAt);
  const rawThumb = item.thumbnailUrl ?? "";
  const poster =
    rawThumb && !/hqdefault|default\.jpg|mqdefault/i.test(rawThumb)
      ? rawThumb
      : `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
  return {
    id: item.id,
    kind: isLive ? "live" : isReplay ? "vod" : "youtube",
    platform: "youtube",
    title: item.title,
    subtitle: isReplay ? `${item.authorLabel} · Past broadcast` : item.authorLabel,
    poster,
    backdrop: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
    memberSlug: item.authorSlug,
    memberLabel: m?.stageName ?? item.authorLabel,
    accountLabel: item.authorLabel,
    accent: m?.accent ?? "#db0368",
    // Keep the theater/player transport as YouTube even when the catalog
    // prioritizes this item as currently live.
    href: `/theater?kind=youtube&id=${encodeURIComponent(id)}&slug=${encodeURIComponent(item.authorSlug ?? "house")}`,
    sourceUrl,
    mediaUrl: item.mediaUrl,
    embedUrl: item.embedUrl,
    publishedAt: item.liveStartedAt ?? item.publishedAt,
    duration: item.duration,
    durationSeconds: item.durationSeconds,
    chapters: item.chapters,
    relatedFullVideoId: item.relatedFullVideoId,
    format: isLive ? "live" : short ? "short" : "long",
    orientation: item.orientation ?? (short ? "portrait" : "landscape"),
    width: item.width,
    height: item.height,
    previewStrategy: item.previewStrategy ?? "animated",
    embeddable: item.embeddable ?? true,
    focalPoint: item.focalPoint ?? CENTER,
    liveCapability: "supported",
    live: isLive || isReplay
      ? { startedAt: item.liveStartedAt ?? item.publishedAt, type: "video" }
      : undefined,
  };
}

function fromSocial(item: FeedItem): WatchItem | null {
  if (item.platform === "youtube") return null;
  const member = memberOf(item.authorSlug);
  const sourceUrl = item.sourceUrl ?? item.url;
  const poster = item.thumbnailUrl || member?.portrait || "/embed-preview.png";
  const isPhoto = item.mediaType === "image" || item.format === "photo";
  const isPost = item.mediaType === "text";
  const isLive = Boolean(item.isLive || item.format === "live");
  const isShortForm = !isLive && !isPhoto && !isPost && (
    item.format === "short" ||
    item.platform === "tiktok" ||
    (item.platform === "instagram" && /\/reels?\//i.test(sourceUrl))
  );
  const kind: WatchItem["kind"] = isLive
    ? "live"
    : isPhoto
      ? "tour"
      : isPost
        ? "post"
        : "clip";
  const playableUrl = item.mediaUrl ?? item.embedUrl ?? sourceUrl;
  const href = isPhoto || isPost
    ? sourceUrl
    : `/theater?kind=${kind}&src=${encodeURIComponent(item.platform)}&id=${encodeURIComponent(item.id)}&ref=${encodeURIComponent(item.id)}&url=${encodeURIComponent(playableUrl)}&slug=${encodeURIComponent(item.authorSlug ?? "house")}`;
  return {
    id: item.id,
    kind,
    platform: item.platform,
    title: item.title,
    subtitle: item.authorLabel,
    poster,
    backdrop: poster,
    memberSlug: item.authorSlug,
    memberLabel: member?.stageName ?? item.authorLabel,
    accountLabel: item.authorLabel,
    accent: member?.accent ?? "#db0368",
    href,
    sourceUrl,
    mediaUrl: item.mediaUrl,
    embedUrl: item.embedUrl,
    publishedAt: item.publishedAt,
    live: isLive
      ? { startedAt: item.publishedAt, type: item.mediaType === "audio" ? "audio" : "video" }
      : undefined,
    duration: item.duration,
    durationSeconds: item.durationSeconds,
    format: isLive ? "live" : isPhoto ? "photo" : isShortForm ? "short" : item.format ?? "long",
    orientation: isShortForm ? "portrait" : item.orientation ?? (isPhoto ? "square" : "landscape"),
    width: item.width,
    height: item.height,
    previewStrategy: item.previewStrategy,
    embeddable: item.embeddable,
    focalPoint: item.focalPoint ?? CENTER,
    liveCapability: item.liveCapability,
    x: item.x,
  };
}

function fromFeed(item: FeedItem): WatchItem | null {
  return item.platform === "youtube" ? fromYoutube(item) : fromSocial(item);
}

async function enrichYouTubeItems(items: FeedItem[]): Promise<FeedItem[]> {
  const videos = items.filter((item) => item.platform === "youtube");
  const ids = videos.map(ytId).filter((id): id is string => Boolean(id));
  if (ids.length === 0) return items;
  const titleById = Object.fromEntries(
    videos.flatMap((item) => {
      const id = ytId(item);
      return id ? [[id, item.title] as const] : [];
    }),
  );
  const metadata = await fetchWatchYoutubeMetadata(ids, titleById);
  return items.map((item) => {
    if (item.platform !== "youtube") return item;
    const id = ytId(item);
    const meta = id ? metadata[id] : undefined;
    if (!meta) return item;
    const isLive = meta.liveBroadcastContent === "live";
    const short = meta.isShort || item.format === "short";
    return {
      ...item,
      duration: meta.duration,
      durationSeconds: meta.durationSeconds,
      chapters: meta.chapters,
      relatedFullVideoId: meta.relatedFullVideoId,
      isLive,
      // Only an actual start marks a completed upload as a broadcast. Using a
      // scheduled start here would incorrectly turn upcoming premieres into
      // past broadcasts while they wait for the Guide's schedule endpoint.
      liveStartedAt: meta.actualStartTime ?? (isLive ? meta.scheduledStartTime : item.liveStartedAt),
      format: isLive ? "live" : short ? "short" : "long",
      orientation: short ? "portrait" : item.orientation ?? "landscape",
    };
  });
}

function twitchVodItem(member: (typeof MEMBERS)[number], vod: TwitchVod): WatchItem {
  const durationSeconds = twitchDurationSeconds(vod.duration);
  return {
    id: `vod-${vod.id}`,
    kind: "vod",
    platform: "twitch",
    title: vod.title || `${member.stageName} past broadcast`,
    subtitle: `${member.stageName} · Past broadcast`,
    poster: vod.thumbnailUrl || member.portrait,
    backdrop: vod.thumbnailUrl || member.portrait,
    memberSlug: member.slug,
    memberLabel: member.stageName,
    accountLabel: `@${member.stageName.replace(/\s+/g, "")}`,
    accent: member.accent,
    href: `/theater?kind=vod&id=${encodeURIComponent(vod.id)}&slug=${encodeURIComponent(member.slug)}`,
    sourceUrl: vod.url,
    publishedAt: vod.createdAt,
    durationSeconds,
    duration: durationSeconds ? formatDurationSeconds(durationSeconds) : undefined,
    format: "long",
    orientation: "landscape",
    previewStrategy: "embed",
    embeddable: true,
    focalPoint: CENTER,
    liveCapability: "supported",
    twitch: { streamId: vod.streamId, vodId: vod.id },
  };
}

async function getTwitchBroadcasts(
  users: Record<string, { id: string }>,
  activeLogins: ReadonlySet<string>,
): Promise<WatchItem[]> {
  const lists = await Promise.all(
    MEMBERS.map(async (member) => {
      const user = users[member.twitchLogin.toLowerCase()];
      if (!user?.id) return [];
      // A live archive appears seconds after a stream starts. Poll active
      // channels quickly enough to expose rewind without making the historical
      // archive refresh every minute for offline channels.
      const revalidateSeconds = activeLogins.has(member.twitchLogin.toLowerCase()) ? 60 : 1800;
      const vods = await fetchChannelVideos(user.id, 16, revalidateSeconds);
      return vods.map((vod) => twitchVodItem(member, vod));
    }),
  );
  return normalizeWatchItems(lists.flat());
}

export async function getWatchCatalog(): Promise<WatchCatalog> {
  const logins = MEMBERS.map((m) => m.twitchLogin);
  const programming = await getWatchProgrammingSnapshot().catch(() => EMPTY_WATCH_PROGRAMMING);
  const [
    liveRes,
    houseFeed,
    memberFeed,
    clips,
    twitchUsers,
    programmingEntries,
    archivedYoutube,
  ] = await Promise.all([
    buildLiveResponse(logins).catch(() => ({ live: [], fetchedAt: new Date().toISOString() })),
    // Persisted Social Fetch rows are DB-only on public renders. Keep the
    // six-month TikTok/Instagram archive available to creator rails up to one
    // shared, explicit ceiling instead of silently truncating it downstream.
    getCoreFeed(PUBLIC_SOCIAL_ARCHIVE_ITEM_LIMIT).catch(() => []),
    getHouseFeed(PUBLIC_SOCIAL_ARCHIVE_ITEM_LIMIT).catch(() => []),
    getPublicClips().catch(() => []),
    fetchUsersByLogin(logins).catch(() => ({})),
    getProgrammingFeedEntries(programming).catch(() => []),
    // The background archive walks every page of each linked YouTube uploads
    // playlist. A missing archive database is an allowed staged state.
    loadArchivedYouTubeWatchItems().catch(() => []),
  ]);
  const activeTwitchLogins = new Set(
    liveRes.live
      .filter((entry) => entry.isLive)
      .map((entry) => entry.login.toLowerCase()),
  );
  const fetchedTwitchBroadcasts = await getTwitchBroadcasts(twitchUsers, activeTwitchLogins);

  // One batched YouTube videos.list pass avoids treating every short watch URL
  // as long-form while keeping RSS as the zero-key fallback.
  const orderedProgrammingEntries = [...programmingEntries].sort((a, b) =>
    Number(Boolean(b.curatedItemId)) - Number(Boolean(a.curatedItemId)),
  );
  const enriched = await enrichYouTubeItems([
    ...houseFeed,
    ...memberFeed,
    ...orderedProgrammingEntries.map((entry) => entry.feed),
  ]);
  const enrichedHouseFeed = enriched.slice(0, houseFeed.length);
  const enrichedMemberFeed = enriched.slice(houseFeed.length, houseFeed.length + memberFeed.length);
  const enrichedProgrammingFeed = enriched.slice(houseFeed.length + memberFeed.length);

  const twitchLive: WatchItem[] = [];
  for (const m of MEMBERS) {
    const entry = liveRes.live.find((e) => e.login.toLowerCase() === m.twitchLogin.toLowerCase());
    if (!entry?.isLive) continue;
    twitchLive.push({
      id: `live-${m.slug}`,
      kind: "live",
      platform: "twitch",
      title: entry.title || `${m.stageName} is live`,
      subtitle: entry.game || "Live on Twitch",
      poster: entry.thumbnailUrl || m.portrait,
      backdrop: entry.thumbnailUrl || m.portrait,
      memberSlug: m.slug,
      memberLabel: m.stageName,
      accountLabel: `@${m.stageName.replace(/\s+/g, "")}`,
      accent: m.accent,
      href: `/watch/live/${encodeURIComponent(m.twitchLogin)}`,
      sourceUrl: `https://www.twitch.tv/${encodeURIComponent(m.twitchLogin)}`,
      publishedAt: entry.startedAt,
      live: {
        viewers: entry.viewerCount,
        game: entry.game,
        startedAt: entry.startedAt,
        login: m.twitchLogin,
        streamId: entry.streamId,
        type: "video",
      },
      twitch: { streamId: entry.streamId },
      format: "live",
      orientation: "landscape",
      previewStrategy: "embed",
      embeddable: true,
      focalPoint: CENTER,
      liveCapability: "supported",
    });
  }

  const allHouse = normalizeWatchItems(
    enrichedHouseFeed.map(fromFeed).filter((x): x is WatchItem => Boolean(x)),
  );
  const allMembers = normalizeWatchItems(
    enrichedMemberFeed.map(fromFeed).filter((x): x is WatchItem => Boolean(x)),
  );
  const archivedHouseItems = normalizeWatchItems(
    archivedYoutube.filter((item) => item.memberSlug === null),
  );
  const archivedMemberItems = normalizeWatchItems(
    archivedYoutube.filter((item) => item.memberSlug !== null),
  );
  const programmingSourceById = new Map(programming.sources.map((source) => [source.id, source]));
  const programmingRawItems = enrichedProgrammingFeed.flatMap((feed, index): WatchItem[] => {
    const entry = orderedProgrammingEntries[index];
    const item = fromFeed(feed);
    if (!entry || !item) return [];
    const source = entry.sourceId ? programmingSourceById.get(entry.sourceId) : null;
    return [{
      ...item,
      programming: {
        community: true,
        sourceId: entry.sourceId ?? `curated:${entry.curatedItemId}`,
        curatedItemId: entry.curatedItemId ?? undefined,
        routes: source?.routes ?? [],
      },
    }];
  });
  const programmingItems = normalizeWatchItems(programmingRawItems);
  const socialLive = [...allHouse, ...allMembers].filter((item) => item.kind === "live");
  const twitchArchives = reconcileActiveTwitchArchives(fetchedTwitchBroadcasts, twitchLive);
  const twitchBroadcasts = twitchArchives.broadcasts;
  const live = normalizeWatchItems([...twitchArchives.liveItems, ...socialLive]);
  const houseFeedItems = allHouse.filter((item) => item.kind !== "live");
  const memberFeedItems = allMembers.filter((item) => item.kind !== "live");

  const curatedClipItems: WatchItem[] = clips.slice(0, 48).map((c) => {
    const m = memberOf(c.memberSlugs[0] ?? null);
    const durationSeconds = c.durationMs && c.durationMs > 0 ? Math.round(c.durationMs / 1000) : undefined;
    const platform = (c.source === "twitch" ? "twitch" : c.source) as WatchItem["platform"];
    return {
      id: `clip-${c.id}`,
      kind: "clip" as const,
      platform,
      title: c.title,
      subtitle: m?.stageName ?? "CORE",
      poster: c.thumbnailUrl || m?.portrait || "/embed-preview.png",
      backdrop: c.thumbnailUrl || m?.portrait || "/embed-preview.png",
      memberSlug: m?.slug ?? null,
      memberLabel: m?.stageName ?? "CORE",
      accent: m?.accent ?? "#db0368",
      href: `/theater?kind=clip&src=${encodeURIComponent(c.source)}&id=${encodeURIComponent(c.externalId)}&ref=${encodeURIComponent(`clip-${c.id}`)}&url=${encodeURIComponent(c.url)}&slug=${m?.slug ?? "house"}`,
      sourceUrl: c.url,
      publishedAt: c.publishedAt,
      format: c.aspect === "vertical" ? "short" : "long",
      orientation: c.aspect === "vertical" ? "portrait" : "landscape",
      durationSeconds,
      duration: durationSeconds ? formatDurationSeconds(durationSeconds) : undefined,
      previewStrategy: platform === "x" ? "external" : "embed",
      embeddable: platform !== "x",
      focalPoint: CENTER,
      liveCapability:
        platform === "tiktok" || platform === "instagram" ? "unsupported" : "supported",
    };
  });

  const tour: WatchItem | null = GROUP.houseTourVideoId
    ? {
        id: "house-tour",
        kind: "tour",
        platform: "house",
        title: "The house",
        subtitle: GROUP.motto,
        poster: "/group/thecoreboys.jpg",
        backdrop: "/group/thecoreboys.jpg",
        memberSlug: null,
        memberLabel: "CORE",
        accent: "#db0368",
        href: `/theater?kind=youtube&id=${encodeURIComponent(GROUP.houseTourVideoId)}&slug=house`,
        sourceUrl: `https://www.youtube.com/watch?v=${GROUP.houseTourVideoId}`,
        embedUrl: `https://www.youtube-nocookie.com/embed/${GROUP.houseTourVideoId}`,
        format: "long",
        orientation: "landscape",
        previewStrategy: "animated",
        embeddable: true,
        focalPoint: CENTER,
        liveCapability: "supported",
      }
    : null;

  // Photos is a provider shelf, not an asset gallery. Keep only genuine
  // Instagram image posts and round-robin connected accounts so CORE or a
  // high-volume member cannot crowd every other member out of the first row.
  const normalizedPhotos = instagramPhotoShelfItems([...allHouse, ...allMembers]);
  const normalizedCuratedClips = normalizeWatchItems(curatedClipItems);
  const house = normalizeWatchItems([
    ...live.filter((item) => item.memberSlug === null),
    ...houseFeedItems,
    ...archivedHouseItems,
    ...(tour ? [tour] : []),
  ]);
  const memberItems = markCrossPlatformBroadcastAliases(normalizeWatchItems([
      ...live.filter((item) => item.memberSlug !== null),
      ...memberFeedItems,
      ...archivedMemberItems,
      ...twitchBroadcasts,
      ...normalizedCuratedClips.filter((item) => item.memberSlug),
    ]));
  const byMember = MEMBERS.map((m) => ({
    slug: m.slug,
    label: m.stageName,
    accent: m.accent,
    portrait: m.portrait,
    comm: m.comm.name,
    // Intentionally uncropped: all linked accounts/platforms stay available.
    items: memberItems.filter((item) => item.memberSlug === m.slug),
  }));
  const clipItems = normalizeWatchItems([
    ...normalizedCuratedClips,
    ...houseFeedItems.filter((item) => item.kind === "clip"),
    ...memberFeedItems.filter((item) => item.kind === "clip"),
  ]);

  const all = normalizeWatchItems([
    ...live,
    ...house,
    ...memberItems,
    ...clipItems,
    ...normalizedPhotos,
    ...programmingItems,
  ]);
  const firstPartyAll = all.filter((item) => !item.programming?.community);
  const broadcasts = firstPartyAll.filter((item) => item.kind === "vod");
  const shorts = firstPartyAll.filter((item) => item.format === "short");
  const videos = all.filter(
    (item) =>
      !item.programming?.community &&
      item.kind !== "live" &&
      item.kind !== "vod" &&
      item.format !== "photo" &&
      item.format !== "short" &&
      item.embeddable !== false,
  );
  const recent = all
    .filter((it) => {
      if (it.programming?.community) return false;
      if (!it.publishedAt) return false;
      const age = Date.now() - new Date(it.publishedAt).getTime();
      return it.kind !== "live" && age >= 0 && age < 30 * 86_400_000;
    })
    .slice(0, 64);

  const billboard = live[0] ?? house[0] ?? memberItems[0] ?? normalizedPhotos[0] ?? null;

  const heroFeatured = programming.items
    .filter((item) => item.enabled && item.heroFeatured)
    .sort((a, b) => a.heroPriority - b.heroPriority)
    .flatMap((record) => {
      const match = programmingRawItems.find(
        (item) => item.programming?.curatedItemId === record.id,
      );
      return match ? [match] : [];
    });
  const programmingSections = programming.sections
    .filter((section) => section.enabled)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((section) => {
      const explicit = section.itemIds.flatMap((itemId) => {
        const match = programmingRawItems.find(
          (item) => item.programming?.curatedItemId === itemId,
        );
        return match ? [match] : [];
      });
      const fromSources = programmingItems.filter((item) =>
        section.sourceIds.includes(item.programming?.sourceId ?? ""),
      );
      return {
        id: `programming-${section.slug}`,
        title: section.title,
        kicker: section.kicker ?? undefined,
        layout: section.layout,
        items: normalizeWatchItems([...explicit, ...fromSources]),
      };
    })
    .filter((section) => section.items.length > 0);

  const catalog:WatchCatalog = {
    billboard,
    all,
    live,
    house,
    byMember,
    videos,
    shorts,
    broadcasts,
    clips: clipItems,
    photos: normalizedPhotos,
    recent,
    byPlatform: groupWatchItemsByPlatform(all),
    liveCapabilities: {
      twitch:
        process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET
          ? "supported"
          : "not_configured",
      x: process.env.X_BEARER_TOKEN ? "supported" : "not_configured",
      tiktok: "unsupported",
      instagram: "unsupported",
    },
    heroFeatured,
    programmingSections,
    fetchedAt: new Date().toISOString(),
  };
  // Feed content is dynamic and may not exist in content_items. Persist the
  // server-normalized allowlist for Passport watch credit; catalog rendering
  // remains available during a staged Passport rollout.
  try{await registerPassportWatchCatalog(catalog);}catch{/* migration/DB outage: fail closed for rewards */}
  return catalog;
}

/** Latest long-form upload from the CORE main YouTube channel. */
export function latestMainChannelVideo(catalog: WatchCatalog): WatchItem | null {
  const house = catalog.house.filter((it) => it.kind === "youtube" && it.id !== "house-tour");
  return house.find((it) => it.format !== "short") ?? house[0] ?? null;
}

export function moreMainChannelVideos(catalog: WatchCatalog, featuredId: string, n = 3): WatchItem[] {
  return catalog.house
    .filter((it) => it.kind === "youtube" && it.id !== "house-tour" && it.id !== featuredId)
    .slice(0, n);
}
