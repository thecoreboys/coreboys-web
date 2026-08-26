import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentFanUserId } from "@/lib/fan-auth";
import {
  deleteCommunityAccountData,
  CommunityRateLimitError,
  consumeCommunityRateLimit,
  getCommunityMembershipCounts,
  getCommunityViewerState,
  listCommunityIdeas,
  listCommunityQuestions,
  listPublishedCommunityContent,
  setCommunityMembership,
  setCommunityPreferences,
  setCommunityXAttestation,
} from "@/lib/fanzone-communities";
import {
  FANZONE_COMMUNITIES,
  FANZONE_COMMUNITY_KEYS,
  isFanzoneCommunityKey,
  type FanzoneCommunityKey,
} from "@/lib/fanzone-community-config";
import type { CommunityFeedItem, FanzoneCommunitiesResponse } from "@/lib/fanzone-community-types";
import { listApprovedFanPhotos } from "@/lib/fanzone";
import { listPolls } from "@/lib/community";
import { getPublicClips } from "@/lib/clips-server";
import { getCoreFeed, getHouseFeed } from "@/lib/social-feed";
import { MEMBERS } from "@/lib/members";
import { buildLiveResponse } from "@/lib/twitch";
import { requestHasSameOrigin } from "@/lib/x/security";
import { deleteXNominationAccountData } from "@/lib/x/nominations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UpdateBody = z
  .object({
    selectedKey: z.enum(FANZONE_COMMUNITY_KEYS).optional(),
    favoriteKeys: z.array(z.enum(FANZONE_COMMUNITY_KEYS)).max(FANZONE_COMMUNITY_KEYS.length).optional(),
    membership: z
      .object({ key: z.enum(FANZONE_COMMUNITY_KEYS), joined: z.boolean() })
      .optional(),
    xAttestation: z
      .object({ key: z.enum(FANZONE_COMMUNITY_KEYS), attested: z.boolean() })
      .optional(),
    alerts: z
      .object({
        communityKey: z.enum(FANZONE_COMMUNITY_KEYS),
        live: z.boolean().optional(),
        updates: z.boolean().optional(),
        weeklyDigest: z.boolean().optional(),
      })
      .optional(),
  })
  .strict();

function privateJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedRaw = url.searchParams.get("community");
  const requested = requestedRaw && isFanzoneCommunityKey(requestedRaw) ? requestedRaw : null;
  const userId = await getCurrentFanUserId();
  const viewer = await getCommunityViewerState(userId, requested);
  const selected = viewer.selectedKey;
  const selectedDirectory = FANZONE_COMMUNITIES.find((community) => community.key === selected)!;

  const [
    counts,
    questions,
    ideas,
    published,
    coreFeed,
    houseFeed,
    photos,
    clips,
    polls,
    liveResponse,
  ] = await Promise.all([
    getCommunityMembershipCounts().catch(() => emptyCounts()),
    listCommunityQuestions(selected, userId).catch(() => []),
    listCommunityIdeas(selected, userId).catch(() => []),
    listPublishedCommunityContent(selected).catch(() => ({ calendar: [], staffContent: [] })),
    getCoreFeed(24).catch(() => []),
    getHouseFeed(96).catch(() => []),
    listApprovedFanPhotos(userId, {
      member: selectedDirectory.memberSlug,
      sort: "featured",
      limit: selected === "core" ? 18 : 12,
    }).catch(() => []),
    getPublicClips().catch(() => []),
    listPolls(userId, { communityKey: selected }).catch(() => []),
    buildLiveResponse(MEMBERS.map((member) => member.twitchLogin)).catch(() => ({
      live: [],
      fetchedAt: new Date().toISOString(),
    })),
  ]);

  const selectedOfficial = selected === "core"
    ? coreFeed
    : houseFeed.filter((item) => item.authorSlug === selectedDirectory.memberSlug);
  const selectedClips = selected === "core"
    ? clips
    : clips.filter((clip) => clip.memberSlugs.includes(selectedDirectory.memberSlug ?? ""));
  const allLive = liveResponse.live.filter((entry) => entry.isLive);
  const selectedLive = allLive.filter(
    (entry) =>
      entry.isLive &&
      (selected === "core" ||
        MEMBERS.find((member) => member.twitchLogin.toLowerCase() === entry.login.toLowerCase())?.slug ===
          selectedDirectory.memberSlug),
  );

  const feed: CommunityFeedItem[] = [
    ...selectedLive.map((entry): CommunityFeedItem => {
      const member = MEMBERS.find(
        (candidate) => candidate.twitchLogin.toLowerCase() === entry.login.toLowerCase(),
      );
      return {
        id: `live-${entry.streamId ?? entry.login}`,
        communityKey: selected,
        kind: "live",
        title: entry.title || `${member?.stageName ?? entry.login} is live`,
        eyebrow: `${member?.stageName ?? entry.login} · Twitch live`,
        href: `/watch/live/${encodeURIComponent(entry.login)}`,
        imageUrl: entry.thumbnailUrl || member?.portrait || null,
        publishedAt: entry.startedAt || liveResponse.fetchedAt,
        external: false,
      };
    }),
    ...published.staffContent.map((item): CommunityFeedItem => ({
      id: `staff-${item.id}`,
      communityKey: item.communityKey,
      kind: item.kind === "showcase" ? "showcase" : "official",
      title: item.title,
      eyebrow: item.kind === "showcase" ? "Staff showcase" : "Official update",
      href: item.href || `/fanzone#communities`,
      imageUrl: item.imageUrl,
      publishedAt: item.publishedAt,
      external: Boolean(item.href?.startsWith("http")),
    })),
    ...selectedOfficial.slice(0, 18).map((item): CommunityFeedItem => ({
      id: `social-${item.id}`,
      communityKey: selected,
      kind: item.format === "short" ? "clip" : "official",
      title: item.title,
      eyebrow: `${item.authorLabel} · ${platformLabel(item.platform)}`,
      href: item.url,
      imageUrl: item.thumbnailUrl ?? null,
      publishedAt: item.publishedAt,
      external: true,
    })),
    ...selectedClips.slice(0, 10).map((clip): CommunityFeedItem => ({
      id: `clip-${clip.id}`,
      communityKey: selected,
      kind: "clip",
      title: clip.title,
      eyebrow: `${clip.source} clip`,
      href: clip.url,
      imageUrl: clip.thumbnailUrl ?? null,
      publishedAt: clip.publishedAt,
      external: true,
    })),
    ...photos.slice(0, 10).map((photo): CommunityFeedItem => ({
      id: `fan-${photo.id}`,
      communityKey: selected,
      kind: photo.featured ? "showcase" : "art",
      title: photo.caption || (photo.kind === "art" ? "Community fan art" : "Community photo"),
      eyebrow: photo.featured ? `Staff pick · ${photo.submittedBy}` : `Fan ${photo.kind} · ${photo.submittedBy}`,
      href: `/fanzone?photo=${photo.id}#wall`,
      imageUrl: photo.thumbUrl,
      publishedAt: photo.createdAt,
      external: false,
    })),
    ...polls
      .filter((poll) => poll.status === "open")
      .slice(0, 4)
      .map((poll): CommunityFeedItem => ({
        id: `poll-${poll.id}`,
        communityKey: selected,
        kind: "poll",
        title: poll.question,
        eyebrow: poll.kind === "prediction" ? "Open prediction" : "Open poll",
        href: `/fanzone?poll=${poll.id}#polls`,
        imageUrl: poll.mediaUrl,
        publishedAt: poll.createdAt,
        external: false,
      })),
  ]
    .filter((item, index, values) => values.findIndex((candidate) => candidate.id === item.id) === index)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, 30);

  const latestByKey = new Map<FanzoneCommunityKey, { title: string; at: string }>();
  for (const item of [...coreFeed, ...houseFeed].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))) {
    const key = item.authorSlug
      ? FANZONE_COMMUNITIES.find((community) => community.memberSlug === item.authorSlug)?.key
      : "core";
    if (key && !latestByKey.has(key)) latestByKey.set(key, { title: item.title, at: item.publishedAt });
  }
  for (const entry of liveResponse.live.filter((item) => item.isLive)) {
    const member = MEMBERS.find(
      (candidate) => candidate.twitchLogin.toLowerCase() === entry.login.toLowerCase(),
    );
    const key = FANZONE_COMMUNITIES.find((community) => community.memberSlug === member?.slug)?.key;
    if (key) latestByKey.set(key, { title: `${member?.stageName ?? entry.login} is live`, at: entry.startedAt ?? liveResponse.fetchedAt });
  }
  if (allLive.length > 0) {
    latestByKey.set("core", { title: `${allLive.length} CORE creator${allLive.length === 1 ? " is" : "s are"} live`, at: liveResponse.fetchedAt });
  }

  const now = Date.now();
  const today = now - 86_400_000;
  const pulse = {
    liveNow: selectedLive.length,
    newToday: feed.filter((item) => Date.parse(item.publishedAt) >= today).length,
    openPolls: polls.filter((poll) => poll.status === "open").length,
    upcoming: published.calendar.filter((event) => Date.parse(event.startsAt) >= now).length,
  };
  const response: FanzoneCommunitiesResponse = {
    communities: FANZONE_COMMUNITIES.map((community) => ({
      ...community,
      memberCount: counts[community.key] ?? 0,
      currentActivity: latestByKey.get(community.key)?.title ?? null,
      currentActivityAt: latestByKey.get(community.key)?.at ?? null,
    })),
    selected,
    viewer: { ...viewer, selectedKey: selected },
    pulse,
    feed,
    questions,
    ideas,
    calendar: published.calendar,
    staffContent: published.staffContent,
  };
  return privateJson(response);
}

export async function PATCH(request: Request) {
  if (!requestHasSameOrigin(request)) return privateJson({ error: "invalid origin" }, { status: 403 });
  const userId = await getCurrentFanUserId();
  if (!userId) return privateJson({ error: "unauthorized" }, { status: 401 });
  const parsed = UpdateBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return privateJson({ error: "invalid update" }, { status: 400 });
  const body = parsed.data;
  try {
    await consumeCommunityRateLimit(userId, "settings.update", 120, 60 * 60);
    if (body.membership) {
      await setCommunityMembership(userId, body.membership.key, body.membership.joined);
    }
    if (body.xAttestation) {
      await setCommunityXAttestation(userId, body.xAttestation.key, body.xAttestation.attested);
    }
    await setCommunityPreferences(userId, {
      selectedKey: body.selectedKey,
      favoriteKeys: body.favoriteKeys
        ? [...new Set(body.favoriteKeys)]
        : undefined,
      alertCommunityKey: body.alerts?.communityKey,
      liveAlerts: body.alerts?.live,
      updateAlerts: body.alerts?.updates,
      weeklyDigest: body.alerts?.weeklyDigest,
    });
    return privateJson({ ok: true });
  } catch (error) {
    if (error instanceof CommunityRateLimitError) {
      return privateJson(
        { error: error.message, retryAfter: error.retryAfterSeconds },
        { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } },
      );
    }
    throw error;
  }
}

export async function DELETE(request: Request) {
  if (!requestHasSameOrigin(request)) return privateJson({ error: "invalid origin" }, { status: 403 });
  const userId = await getCurrentFanUserId();
  if (!userId) return privateJson({ error: "unauthorized" }, { status: 401 });
  await Promise.all([
    deleteCommunityAccountData(userId),
    deleteXNominationAccountData(userId),
  ]);
  return privateJson({ ok: true, deleted: "fanzone_community_activity" });
}

function emptyCounts(): Record<FanzoneCommunityKey, number> {
  return Object.fromEntries(FANZONE_COMMUNITY_KEYS.map((key) => [key, 0])) as Record<
    FanzoneCommunityKey,
    number
  >;
}

function platformLabel(platform: string): string {
  if (platform === "x") return "X";
  if (platform === "youtube") return "YouTube";
  if (platform === "instagram") return "Instagram";
  if (platform === "tiktok") return "TikTok";
  return platform;
}
