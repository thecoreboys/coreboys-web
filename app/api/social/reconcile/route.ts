import { NextResponse } from "next/server";
import type { FeedItem } from "@/components/feed/types";
import { GROUP } from "@/lib/group";
import { MEMBERS } from "@/lib/members";
import {
  configuredYouTubeWebhookChannels,
  refreshCoreFeed,
  refreshHouseFeed,
  type PublicMediaDiagnostic,
} from "@/lib/social-feed";
import {
  socialEventFromFeedItem,
  recordSocialEvent,
  upsertSocialSource,
} from "@/lib/social-events";
import { drainSocialNotificationDeliveries } from "@/lib/social-delivery";
import {
  isFreshSocialEvent,
  socialNotificationMaxAgeMs,
} from "@/lib/social-event-normalization";
import {
  acquireSocialFetchRefreshLease,
  completeSocialFetchRefreshLease,
  type SocialFetchRefreshLease,
} from "@/lib/social-fetch-refresh";
import { tiktokAppCredentials } from "@/lib/oauth/providers";
import { resolveMetaWebhookAppSecret } from "@/lib/social-webhook-config";
import { fetchLiveStreams } from "@/lib/twitch";
import {
  applyYouTubeMetadataToFeedItems,
  youtubeVideoIdForFeedItem,
} from "@/lib/youtube-classification";
import { fetchYouTubeMetadata } from "@/lib/youtube-duration";
import {
  socialCredentialDiagnosticFor,
  type IngestProvider,
} from "@/lib/watch/social-credentials";
import { processSocialFetchBackfill } from "@/lib/social-fetch-backfill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SocialSourceProvider = IngestProvider | "twitch" | "youtube" | "x";

type SocialAccount = {
  provider: SocialSourceProvider;
  handle: string;
  memberSlug: string | null;
  accountLabel: string;
};

function creatorSocialAccounts(): SocialAccount[] {
  const accounts: SocialAccount[] = [];
  const add = (
    provider: SocialSourceProvider,
    handle: string | undefined,
    memberSlug: string | null,
    accountLabel: string,
  ) => {
    if (!handle?.trim()) return;
    accounts.push({ provider, handle, memberSlug, accountLabel });
  };

  add("tiktok", GROUP.socials.tiktok?.handle, null, GROUP.name);
  add("instagram", GROUP.socials.instagram?.handle, null, GROUP.name);
  add("x", GROUP.socials.x?.handle, null, GROUP.name);
  for (const member of MEMBERS) {
    add("twitch", member.twitchLogin, member.slug, member.stageName);
    for (const social of member.socials) {
      if (social.platform !== "tiktok" && social.platform !== "instagram" && social.platform !== "x") continue;
      add(social.platform, social.handle, member.slug, member.stageName);
    }
  }
  for (const channel of configuredYouTubeWebhookChannels()) {
    add("youtube", channel.channelId, channel.memberSlug, channel.accountLabel);
  }
  return accounts;
}

function normalizedHandle(value: string): string {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

function publicMediaHealth(diagnostics: readonly PublicMediaDiagnostic[]) {
  const failures = diagnostics.filter((diagnostic) => diagnostic.status !== "ok");
  if (diagnostics.length > 0 && failures.length === 0) {
    return { credentialState: "healthy" as const, ready: true, error: null };
  }
  const statuses = new Set(failures.map((diagnostic) => diagnostic.status));
  const credentialState = statuses.has("not_configured")
    || statuses.has("unauthorized")
    || statuses.has("not_found")
    ? "missing" as const
    : "unknown" as const;
  const error = failures.length
    ? failures.map((diagnostic) => `social_fetch_${diagnostic.surface}_${diagnostic.status}`).join(",")
    : "social_fetch_status_pending";
  return { credentialState, ready: false, error };
}

async function enrichFreshYouTubeItems(items: readonly FeedItem[]): Promise<FeedItem[]> {
  const now = Date.now();
  const maxAge = socialNotificationMaxAgeMs();
  const titles: Record<string, string> = {};
  for (const item of items) {
    if (!isFreshSocialEvent(item.publishedAt, now, maxAge)) continue;
    const videoId = youtubeVideoIdForFeedItem(item);
    if (videoId) titles[videoId] = item.title;
  }
  const videoIds = Object.keys(titles);
  if (videoIds.length === 0) return [...items];
  const metadata = await fetchYouTubeMetadata(videoIds, titles, { fresh: true });
  return applyYouTubeMetadataToFeedItems(items, metadata);
}

async function reconcileCreatorSourceHealth(publicDiagnostics: readonly PublicMediaDiagnostic[]) {
  const socialFetchConfigured = Boolean(process.env.SOCIAL_FETCH_API_KEY?.trim());
  return Promise.all(creatorSocialAccounts().map(async (account) => {
    const publicProvider = account.provider === "tiktok" || account.provider === "instagram";
    const diagnostic = account.provider === "tiktok" || account.provider === "instagram"
      ? await socialCredentialDiagnosticFor(account.provider, account.handle)
      : null;
    const officialReady = diagnostic?.state === "ready";
    const accountPublicDiagnostics = publicProvider
      ? publicDiagnostics.filter((entry) => (
          entry.provider === account.provider
          && entry.handle === normalizedHandle(account.handle)
        ))
      : [];
    const hasPublicFailure = accountPublicDiagnostics.some((entry) => entry.status !== "ok");
    const expectedSurfaces = account.provider === "instagram"
      ? ["posts", "reels"] as const
      : account.provider === "tiktok"
        ? ["videos"] as const
        : [];
    const hasCompletePublicWindow = expectedSurfaces.every((surface) => (
      accountPublicDiagnostics.some((entry) => entry.surface === surface)
    ));
    const publicHealth = accountPublicDiagnostics.length && (hasCompletePublicWindow || hasPublicFailure)
      ? publicMediaHealth(accountPublicDiagnostics)
      : null;

    // When a paid lane is not due, keep the last adapter result instead of
    // resetting a working public source back to "missing" merely because no
    // creator OAuth grant exists. The replica that owns the lease updates it.
    if (publicProvider && !officialReady && socialFetchConfigured && !publicHealth) {
      return { provider: account.provider, ready: false, preserved: true };
    }

    const ready = officialReady || Boolean(publicHealth?.ready) || (diagnostic
      ? diagnostic.state === "ready"
      : account.provider === "twitch"
        ? Boolean(process.env.TWITCH_CLIENT_ID?.trim() && process.env.TWITCH_CLIENT_SECRET?.trim())
        : account.provider === "x"
          ? Boolean(process.env.X_BEARER_TOKEN?.trim())
          : true);
    const credentialState = officialReady
      ? "healthy" as const
      : publicHealth?.credentialState ?? (ready ? "healthy" as const : "missing" as const);
    const sourceError = officialReady
      ? null
      : publicHealth?.error ?? (ready ? null : `${account.provider}_${diagnostic?.state ?? "not_configured"}`);
    const appReady = account.provider === "tiktok"
      ? Boolean(tiktokAppCredentials())
      : account.provider === "instagram"
        ? Boolean(
          process.env.META_WEBHOOK_VERIFY_TOKEN?.trim()
            && resolveMetaWebhookAppSecret({
              metaAppSecret: process.env.META_APP_SECRET,
              facebookAppSecret: process.env.FACEBOOK_APP_SECRET,
              instagramClientSecret: process.env.INSTAGRAM_CLIENT_SECRET,
            }),
        )
        : account.provider === "twitch"
          ? Boolean(process.env.TWITCH_EVENTSUB_SECRET?.trim())
          : Boolean(process.env.YOUTUBE_WEBHOOK_SECRET?.trim());
    await upsertSocialSource({
      provider: account.provider,
      accountRef: diagnostic?.handle || account.handle,
      memberSlug: account.memberSlug,
      accountLabel: account.accountLabel,
      credentialState,
      // Provisioning routes own pending/verified state. Reconciliation must
      // never demote a provider-verified callback back to pending.
      webhookState: appReady ? undefined : "not_configured",
      error: sourceError,
      // A public adapter may legitimately restore an account whose old
      // creator token expired, so only official-token reconciliation preserves
      // that revocation marker.
      preserveExpired: !publicHealth,
    });
    return { provider: account.provider, ready };
  }));
}

export async function POST(request: Request) {
  const secret = process.env.METRICS_CRON_SECRET;
  if (!secret || request.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let recorded = 0;
  // Paid public-profile adapters run only in this authenticated scheduled
  // ingestion path. Durable database leases enforce the two-hour windows
  // across every Azure replica; viewer traffic reads social_content_events and
  // can never consume Social Fetch credits.
  const socialFetchConfigured = Boolean(process.env.SOCIAL_FETCH_API_KEY?.trim());
  const acquiredLeases = (await Promise.all([
    socialFetchConfigured
      ? acquireSocialFetchRefreshLease("profile_media").catch(() => null)
      : Promise.resolve(null),
    socialFetchConfigured
      ? acquireSocialFetchRefreshLease("instagram_reels").catch(() => null)
      : Promise.resolve(null),
  ])).filter((lease): lease is SocialFetchRefreshLease => Boolean(lease));
  const activeLanes = new Set(acquiredLeases.map((lease) => lease.lane));
  const publicDiagnostics: PublicMediaDiagnostic[] = [];
  try {
    const [houseEvents, coreEvents] = await Promise.all([
      // Persist the complete already-fetched source windows. Capping this
      // combined roster at 100 left only two or three rows per account once
      // YouTube, TikTok, Instagram, and X groups were balanced, so a busy
      // creator's fourth new post could never reach durable fanout. These
      // limits do not request additional provider pages or spend more credits;
      // they only retain the windows each adapter already returned.
      refreshHouseFeed(512, {
        profileMedia: activeLanes.has("profile_media"),
        instagramReels: activeLanes.has("instagram_reels"),
        onDiagnostic: (diagnostic) => publicDiagnostics.push(diagnostic),
      }),
      refreshCoreFeed(128, {
        profileMedia: activeLanes.has("profile_media"),
        instagramReels: activeLanes.has("instagram_reels"),
        onDiagnostic: (diagnostic) => publicDiagnostics.push(diagnostic),
      }),
    ]);
    // RSS arrives without duration, so enrich every fresh YouTube candidate in
    // one videos.list batch before the canonical row can lock in video/Short
    // notification routing. Missing quota/config still retains the RSS hint.
    const normalizedEvents = await enrichFreshYouTubeItems([...houseEvents, ...coreEvents]);
    for (const item of normalizedEvents) {
      const event = socialEventFromFeedItem(item);
      if (!event) continue;
      const result = await recordSocialEvent(event);
      if (result.created) recorded += 1;
    }
    await Promise.all(acquiredLeases.map((lease) => (
      completeSocialFetchRefreshLease(lease, { ok: true })
    )));
  } catch (error) {
    const message = error instanceof Error ? error.message : "social_media_refresh_failed";
    await Promise.all(acquiredLeases.map((lease) => (
      completeSocialFetchRefreshLease(lease, { ok: false, error: message }).catch(() => false)
    )));
    throw error;
  }

  // Register every intended creator source after the adapter run so public
  // polling health (including credits_exhausted/unauthorized) is represented
  // accurately instead of being mistaken for a missing creator OAuth grant.
  const sourceHealth = await reconcileCreatorSourceHealth(publicDiagnostics).catch(() => []);

  // Normal reconciliation persists current posts first. The private history
  // worker then advances only a few cursor pages and explicitly suppresses
  // notifications for its fixed historical window.
  const backfill = await processSocialFetchBackfill({
    maxPages: 3,
    autoResumeProviderUpstreamError: true,
  }).catch((error) => ({
    status: "blocked" as const,
    jobId: null,
    pagesProcessed: 0,
    itemsRecorded: 0,
    reason: error instanceof Error ? error.message : "social_fetch_backfill_unavailable",
  }));

  let live = 0;
  try {
    const streams = await fetchLiveStreams(MEMBERS.map((member) => member.twitchLogin));
    for (const stream of streams) {
      const member = MEMBERS.find((entry) => entry.twitchLogin.toLowerCase() === stream.user_login.toLowerCase());
      if (!member) continue;
      const result = await recordSocialEvent({
        provider: "twitch",
        memberSlug: member.slug,
        contentType: "live",
        canonicalId: `twitch:${stream.id}`,
        title: stream.title || `${member.name} is live`,
        body: `${stream.viewer_count.toLocaleString()} watching`,
        href: `https://www.twitch.tv/${stream.user_login}`,
        artworkUrl: stream.thumbnail_url.replace("{width}", "640").replace("{height}", "360"),
        orientation: "landscape",
        publishedAt: stream.started_at,
        platformPayload: { streamId: stream.id, viewers: stream.viewer_count, game: stream.game_name },
      });
      if (result.created) live += 1;
      await upsertSocialSource({
        provider: "twitch",
        accountRef: stream.user_login,
        memberSlug: member.slug,
        accountLabel: member.name,
        credentialState: "healthy",
        cursor: stream.id,
      });
    }
  } catch (error) {
    await Promise.all(MEMBERS.map((member) => upsertSocialSource({
      provider: "twitch",
      accountRef: member.twitchLogin,
      memberSlug: member.slug,
      accountLabel: member.name,
      credentialState: "missing",
      error: error instanceof Error ? error.message : "poll_failed",
    })));
  }

  const deliveries = await drainSocialNotificationDeliveries(100);
  return NextResponse.json({
    ok: true,
    recorded,
    live,
    sourceHealth: {
      total: sourceHealth.length,
      ready: sourceHealth.filter((source) => source.ready).length,
    },
    publicMedia: {
      refreshedLanes: [...activeLanes],
      diagnostics: publicDiagnostics.map((diagnostic) => ({
        provider: diagnostic.provider,
        handle: diagnostic.handle,
        surface: diagnostic.surface,
        status: diagnostic.status,
        lookupStatus: diagnostic.lookupStatus,
      })),
    },
    backfill,
    deliveries,
    reconciledAt: new Date().toISOString(),
  });
}
