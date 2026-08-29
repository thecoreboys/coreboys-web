import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "../../watch/watch.css";
import "../../guide/guide.css";
import { WatchChrome } from "@/components/watch/WatchChrome";
import { buildBroadcastHistoryFallback } from "@/lib/watch/airtime-history";
import { loadAirtimeDailyArchive } from "@/lib/watch/airtime-archive";
import { NetworkChannelPage, type ChannelCrewMember } from "@/components/watch/NetworkChannelPage";
import { getWatchCatalog } from "@/lib/watch/catalog";
import { GROUP } from "@/lib/group";
import { CREW, MEMBERS_BY_SLUG } from "@/lib/members";
import { getCrewPortrait, getGroupPhotos, getMemberPhotos } from "@/lib/asset-index";
import { getCrewRoleLabel } from "@/lib/crew";
import { getMemberGalleryPhotos } from "@/lib/member-gallery";
import { loadTwitchTrackerAnalytics } from "@/lib/twitchtracker-snapshots";
import { getCreatorSocialAvatarMap } from "@/lib/watch/creator-profile-avatars";
import { socialCredentialDiagnosticFor } from "@/lib/watch/social-credentials";
import { getXCommunityForMemberSlug } from "@/lib/x/config";
import { selectWatchHomeXPosts } from "@/lib/watch/x-posts";
import type { CuratedChannelSourceDiagnostic } from "@/lib/watch/creator-platform-rails";
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

async function channelSourceDiagnostics(
  channel: NetworkChannel,
): Promise<CuratedChannelSourceDiagnostic[]> {
  const sources = channel.memberSlug
    ? (MEMBERS_BY_SLUG[channel.memberSlug]?.socials ?? [])
    : Object.entries(GROUP.socials).map(([platform, social]) => ({
        platform,
        handle: social.handle,
        url: social.url,
      }));
  const ingestible: Array<{
    platform: "tiktok" | "instagram";
    accountRef: string;
  }> = [];
  for (const source of sources) {
    if (source.platform !== "tiktok" && source.platform !== "instagram") continue;
    ingestible.push({
      platform: source.platform,
      accountRef: source.handle || source.url,
    });
  }
  return Promise.all(
    ingestible.map(async ({ platform, accountRef }) => {
      const status = await socialCredentialDiagnosticFor(platform, accountRef);
      return {
        platform,
        handle: status.handle,
        state: status.state,
      } satisfies CuratedChannelSourceDiagnostic;
    }),
  );
}

export async function generateMetadata({ params, searchParams }: RouteProps): Promise<Metadata> {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const channel = resolveNetworkChannel(slug);
  if (!channel) return {};
  const mode = selectedMode(query.mode, channel);
  return {
    title: modeTitle(channel, mode),
    description: modeDescription(channel, mode),
    alternates: { canonical: channelHref(channel, mode) },
  };
}

export default async function ChannelPage({ params, searchParams }: RouteProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const channel = resolveNetworkChannel(slug);
  if (!channel) notFound();

  const mode = selectedMode(query.mode, channel);
  const xCommunity = getXCommunityForMemberSlug(channel.memberSlug);
  const legacyGalleryPhotos = channel.memberSlug
    ? [...getMemberPhotos(channel.memberSlug), ...getGroupPhotos()]
    : [];
  const [catalog, sourceDiagnostics, twitchTracker, galleryPhotos, archivedDaily] = await Promise.all([
    getWatchCatalog(),
    channelSourceDiagnostics(channel),
    loadTwitchTrackerAnalytics().catch(() => ({ latest: [], history: [], games: [] })),
    getMemberGalleryPhotos(channel.memberSlug ?? "", legacyGalleryPhotos),
    loadAirtimeDailyArchive({ memberSlug: channel.memberSlug }),
  ]);
  const serverNow = new Date().toISOString();
  const airtimeFallback = buildBroadcastHistoryFallback(catalog.broadcasts, Date.parse(serverNow));
  const items = buildNetworkChannelLineup(catalog, channel, mode);
  const continuousItems = mode === "continuous"
    ? items
    : buildNetworkChannelLineup(catalog, channel, "continuous");
  const hub = buildNetworkChannelHub(catalog, channel);
  const ownerXItems = catalog.byPlatform.x.filter((item) =>
    channel.memberSlug === null
      ? item.memberSlug === null
      : item.memberSlug === channel.memberSlug,
  );
  const ownerXPosts = selectWatchHomeXPosts({
    byMember: catalog.byMember,
    byPlatform: { ...catalog.byPlatform, x: ownerXItems },
  }, { limit: 8, perMember: 8 });
  const socialAvatarByUrl = await getCreatorSocialAvatarMap(
    channel.memberSlug ? MEMBERS_BY_SLUG[channel.memberSlug] ?? null : null,
    hub.all,
  );
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
        twitchTracker={twitchTracker.latest}
        airtimeFallback={airtimeFallback}
        archivedDaily={archivedDaily}
        sourceDiagnostics={sourceDiagnostics}
        xCommunityKey={xCommunity?.key ?? "core"}
        ownerXPosts={ownerXPosts}
        galleryPhotos={galleryPhotos}
        team={team}
        socialAvatarByUrl={socialAvatarByUrl}
      />
    </WatchChrome>
  );
}
