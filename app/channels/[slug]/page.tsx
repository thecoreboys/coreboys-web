import { creatorShareImage, withPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import { after } from "next/server";
import { notFound } from "next/navigation";
import "../../watch/watch.css";
import "../../guide/guide.css";
import { WatchChrome } from "@/components/watch/WatchChromeServer";
import { buildBroadcastHistoryFallback } from "@/lib/watch/airtime-history";
import { NetworkChannelPage, type ChannelCrewMember } from "@/components/watch/NetworkChannelPageServer";
import { getWatchCatalog } from "@/lib/watch/catalog";
import { CREW, MEMBERS_BY_SLUG } from "@/lib/members";
import { getCrewPortrait } from "@/lib/asset-index";
import { getCrewRoleLabel } from "@/lib/crew";
import {
  getCachedCreatorSocialAvatarMap,
  getCreatorSocialAvatarMap,
} from "@/lib/watch/creator-profile-avatars";
import { getXCommunityForMemberSlug } from "@/lib/x/config";
import { selectWatchHomeXPosts } from "@/lib/watch/x-posts";
import {
  buildNetworkChannelHub,
  buildNetworkChannelLineup,
  resolveNetworkChannel,
  type NetworkChannel,
  type NetworkChannelMode,
} from "@/lib/watch/channels";

export const dynamic = "force-dynamic";

type RouteProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ mode?: string | string[] }>;
};

const NETWORK_MODES = new Set<NetworkChannelMode>(["live", "videos", "shorts", "continuous"]);

function selectedMode(value: string | string[] | undefined, channel: NetworkChannel): NetworkChannelMode {
  const requested = Array.isArray(value) ? value[0] : value;
  if (requested && NETWORK_MODES.has(requested as NetworkChannelMode)) {
    const mode = requested as NetworkChannelMode;
    if (mode !== "live" || channel.memberSlug !== null) return mode;
  }
  return "continuous";
}

function channelHref(channel: NetworkChannel, mode: NetworkChannelMode): string {
  if (mode === "continuous") return `/channels/${channel.slug}`;
  return `/channels/${channel.slug}?mode=${mode}`;
}

function modeTitle(channel: NetworkChannel, mode: NetworkChannelMode): string {
  if (mode === "live") return `${channel.name} Live`;
  if (mode === "videos") return `${channel.name} Videos`;
  if (mode === "shorts") return `${channel.name} Shorts`;
  return `${channel.name} 24/7`;
}

function modeDescription(channel: NetworkChannel, mode: NetworkChannelMode): string {
  if (mode === "live") return `${channel.host}'s live rooms and past Twitch broadcasts in their original order.`;
  if (mode === "videos") {
    return channel.memberSlug === null
      ? "Shows from the official CORE YouTube channel."
      : `Videos from ${channel.host}'s connected YouTube channels.`;
  }
  if (mode === "shorts") {
    return channel.memberSlug === null
      ? "A shuffled mix of YouTube Shorts, Instagram Reels, and TikToks from CORE and every member."
      : `Shorts, TikToks, and Instagram Reels from ${channel.host}.`;
  }
  return channel.memberSlug === null
    ? "A shuffled, always-on mix of CORE shows and videos from every creator."
    : `A shuffled, always-on mix of ${channel.host}'s videos, Twitch broadcasts, and short-form posts.`;
}

export async function generateMetadata({ params, searchParams }: RouteProps): Promise<Metadata> {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const channel = resolveNetworkChannel(slug);
  if (!channel) return {};
  const mode = selectedMode(query.mode, channel);
  const member = channel.memberSlug ? MEMBERS_BY_SLUG[channel.memberSlug] : undefined;
  return withPageMetadata(channelHref(channel, mode), {
    title: modeTitle(channel, mode),
    description: modeDescription(channel, mode),
    alternates: { canonical: channelHref(channel, mode) },
    keywords: [channel.host, "CORE community", "creator videos", "live streams"],
  }, member ? creatorShareImage(member.slug, member.stageName) : undefined);
}

export default async function ChannelPage({ params, searchParams }: RouteProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const channel = resolveNetworkChannel(slug);
  if (!channel) notFound();

  const mode = selectedMode(query.mode, channel);
  const xCommunity = getXCommunityForMemberSlug(channel.memberSlug);
  const avatarMember = channel.memberSlug ? MEMBERS_BY_SLUG[channel.memberSlug] ?? null : null;
  // Resolve the catalog-dependent avatar read while independent history and
  // gallery queries are still running, rather than adding another DB round trip
  // after the slowest of those queries finishes.
  const channelCatalog = getWatchCatalog().then(async (catalog) => {
    const hub = buildNetworkChannelHub(catalog, channel);
    // Profile artwork is secondary to the channel and must not hold up the
    // first response if the profile cache/database is slow.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const socialAvatarByUrl = await Promise.race([
      getCachedCreatorSocialAvatarMap(avatarMember, hub.all).catch(() => ({})),
      new Promise<Record<string, string>>((resolve) => { timer = setTimeout(() => resolve({}), 250); }),
    ]).finally(() => { if (timer) clearTimeout(timer); });
    return { catalog, hub, socialAvatarByUrl };
  });
  // History and photos load when their tab opens, independently of watch content.
  const { catalog, hub, socialAvatarByUrl } = await channelCatalog;
  const serverNow = new Date().toISOString();
  const airtimeFallback = buildBroadcastHistoryFallback(catalog.broadcasts, Date.parse(serverNow));
  const items = buildNetworkChannelLineup(catalog, channel, mode);
  const continuousItems = mode === "continuous"
    ? items
    : buildNetworkChannelLineup(catalog, channel, "continuous");
  const ownerXItems = catalog.byPlatform.x.filter((item) =>
    channel.memberSlug === null
      ? item.memberSlug === null
      : item.memberSlug === channel.memberSlug,
  );
  const ownerXPosts = selectWatchHomeXPosts({
    byMember: catalog.byMember,
    byPlatform: { ...catalog.byPlatform, x: ownerXItems },
  }, { limit: 24, perMember: 24 });
  // Network pages should not wait for Instagram/TikTok/Twitch profile pages to
  // resolve before returning their useful content. Warm provider avatars for
  // the next visit without putting those remote requests on this render path.
  after(async () => {
    await getCreatorSocialAvatarMap(avatarMember, hub.all).catch(() => {});
  });
  // This is the same canonical assignment that powers the member About page.
  // CORE Network shows the complete house crew; individual channels only show
  // the people assigned to that creator.
  const team: ChannelCrewMember[] = CREW
    .filter((crew) => channel.memberSlug === null || crew.worksWith.includes(channel.memberSlug))
    .map((crew) => ({
      slug: crew.slug,
      name: crew.name,
      roleLabel: getCrewRoleLabel(crew),
      portrait: getCrewPortrait(crew.slug),
    }));

  return (
    <WatchChrome catalog={catalog}>
      <NetworkChannelPage
        channel={channel}
        mode={mode}
        items={items}
        continuousItems={continuousItems}
        hub={hub}
        serverNow={serverNow}
        airtimeFallback={airtimeFallback}
        xCommunityUrl={xCommunity?.communityUrl ?? null}
        ownerXPosts={ownerXPosts}
        team={team}
        socialAvatarByUrl={socialAvatarByUrl}
      />
    </WatchChrome>
  );
}
