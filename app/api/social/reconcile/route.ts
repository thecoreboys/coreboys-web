import { NextResponse } from "next/server";
import { GROUP } from "@/lib/group";
import { MEMBERS } from "@/lib/members";
import {
  configuredYouTubeWebhookChannels,
  getCoreFeed,
  getHouseFeed,
} from "@/lib/social-feed";
import {
  socialEventFromFeedItem,
  recordSocialEvent,
  upsertSocialSource,
} from "@/lib/social-events";
import { drainSocialNotificationDeliveries } from "@/lib/social-delivery";
import { fetchLiveStreams } from "@/lib/twitch";
import {
  socialCredentialDiagnosticFor,
  type IngestProvider,
} from "@/lib/watch/social-credentials";

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

async function reconcileCreatorSourceHealth() {
  return Promise.all(creatorSocialAccounts().map(async (account) => {
    const diagnostic = account.provider === "tiktok" || account.provider === "instagram"
      ? await socialCredentialDiagnosticFor(account.provider, account.handle)
      : null;
    const ready = diagnostic
      ? diagnostic.state === "ready"
      : account.provider === "twitch"
        ? Boolean(process.env.TWITCH_CLIENT_ID?.trim() && process.env.TWITCH_CLIENT_SECRET?.trim())
        : account.provider === "x"
          ? Boolean(process.env.X_BEARER_TOKEN?.trim())
          : true;
    const appReady = account.provider === "tiktok"
      ? Boolean(process.env.TIKTOK_CLIENT_KEY?.trim() && process.env.TIKTOK_CLIENT_SECRET?.trim())
      : account.provider === "instagram"
        ? Boolean(
          (process.env.INSTAGRAM_CLIENT_ID?.trim() && process.env.INSTAGRAM_CLIENT_SECRET?.trim()) ||
          (process.env.FACEBOOK_APP_ID?.trim() && process.env.FACEBOOK_APP_SECRET?.trim()),
        )
        : account.provider === "twitch"
          ? Boolean(process.env.TWITCH_EVENTSUB_SECRET?.trim())
          : Boolean(process.env.YOUTUBE_WEBHOOK_SECRET?.trim());
    await upsertSocialSource({
      provider: account.provider,
      accountRef: diagnostic?.handle || account.handle,
      memberSlug: account.memberSlug,
      accountLabel: account.accountLabel,
      credentialState: ready ? "healthy" : "missing",
      // Provisioning routes own pending/verified state. Reconciliation must
      // never demote a provider-verified callback back to pending.
      webhookState: appReady ? undefined : "not_configured",
      error: ready ? null : `${account.provider}_${diagnostic?.state ?? "not_configured"}`,
    });
    return { provider: account.provider, ready };
  }));
}

export async function POST(request: Request) {
  const secret = process.env.METRICS_CRON_SECRET;
  if (!secret || request.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Always register every intended creator account. An empty official feed is
  // therefore observable as a missing/expired grant in Admin health rather
  // than silently disappearing from public shelves.
  const sourceHealth = await reconcileCreatorSourceHealth().catch(() => []);
  const events = [...await getHouseFeed(100), ...await getCoreFeed(100)];
  let recorded = 0;
  for (const item of events) {
    const event = socialEventFromFeedItem(item);
    if (!event) continue;
    const result = await recordSocialEvent(event);
    if (result.created) recorded += 1;
  }

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
    deliveries,
    reconciledAt: new Date().toISOString(),
  });
}
