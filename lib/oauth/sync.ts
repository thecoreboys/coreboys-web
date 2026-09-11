/**
 * Pull loyalty facts from connected providers. Never invents watch time
 * or YouTube history — those APIs are closed.
 */
import { awardPoints, POINTS } from "@/lib/points";
import { upsertNotificationPref } from "@/lib/community";
import { fetchUsersByLogin } from "@/lib/twitch";
import { memberTargets, houseTarget } from "@/lib/oauth/roster";
import { accessTokenFor } from "@/lib/oauth/refresh";
import { getConnection, markSynced, markSyncError } from "@/lib/oauth/connections";
import { setLoyalty } from "@/lib/oauth/loyalty";
import { providerHasScope, type OauthProvider } from "@/lib/oauth/providers";
import { parseTwitchSubscriptionResponse } from "@/lib/twitch-subscription";
import { parseYouTubeSubscriptionResponse } from "@/lib/youtube-subscription";

export type SyncResult = {
  provider: OauthProvider;
  ok: boolean;
  error?: string;
  facts: number;
};

export async function syncProvider(userId: string, provider: OauthProvider): Promise<SyncResult> {
  const connection = await getConnection(userId, provider);
  if (!connection) return { provider, ok: false, error: "Account is not connected", facts: 0 };
  try {
    if (provider === "twitch") {
      const n = await syncTwitch(userId, connection.id);
      await markSynced(userId, provider, connection.id);
      return { provider, ok: true, facts: n };
    }
    if (provider === "youtube") {
      const n = await syncYoutube(userId, connection.id);
      await markSynced(userId, provider, connection.id);
      return { provider, ok: true, facts: n };
    }
    if (provider === "tiktok") {
      const n = await syncTikTok(userId, connection.id);
      await markSynced(userId, provider, connection.id);
      return { provider, ok: true, facts: n };
    }
    if (provider === "instagram") {
      const n = await syncInstagram(userId, connection.id);
      await markSynced(userId, provider, connection.id);
      return { provider, ok: true, facts: n };
    }
    const n = await syncX(userId, connection.id);
    await markSynced(userId, provider, connection.id);
    return { provider, ok: true, facts: n };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "sync failed";
    await markSyncError(userId, provider, msg, connection.id);
    return { provider, ok: false, error: msg, facts: 0 };
  }
}

export async function syncAll(userId: string, providers: OauthProvider[]): Promise<SyncResult[]> {
  return Promise.all([...new Set(providers)].map((provider) => syncProvider(userId, provider)));
}

async function syncTwitch(userId: string, connectionId: string): Promise<number> {
  const pair = await accessTokenFor(userId, "twitch");
  if (!pair || pair.row.id !== connectionId) throw new Error("Twitch connection changed. Sync again.");
  const { token, row } = pair;
  const viewerId = row.provider_user_id;
  if (!viewerId) throw new Error("missing Twitch user id");
  if (!providerHasScope(row.scopes, "user:read:follows")) {
    throw new Error("Reconnect Twitch to approve user:read:follows");
  }

  const members = memberTargets();
  const users = await fetchUsersByLogin(members.map((m) => m.twitchLogin!).filter(Boolean));
  const clientId = process.env.TWITCH_CLIENT_ID ?? "";

  let facts = 0;
  for (const m of members) {
    const login = m.twitchLogin!;
    const helixUser = users[login];
    // Failed identity resolution is not evidence of an unfollow/unsubscribe.
    if (!helixUser) throw new Error(`Unable to check Twitch channel ${login}`);
    // Target the broadcaster directly: truncating a large following list
    // would otherwise incorrectly mark channels after the page cap unfollowed.
    const url = new URL("https://api.twitch.tv/helix/channels/followed");
    url.searchParams.set("user_id", viewerId);
    url.searchParams.set("broadcaster_id", helixUser.id);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, "Client-Id": clientId },
      cache: "no-store", signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`twitch follows ${res.status}`);
    const json = (await res.json()) as { data?: Array<{ broadcaster_id: string }> };
    if (!Array.isArray(json.data)) throw new Error("Invalid Twitch following response");
    const isFollow = json.data.some((entry) => entry.broadcaster_id === helixUser.id);
    await setLoyalty({ userId, connectionId, platform: "twitch", subject: m.slug, kind: "follow", value: isFollow });
    facts++;
    if (isFollow) {
      await awardPoints(userId, POINTS.twitch_follow, "twitch_follow", "member", m.slug);
      await upsertNotificationPref(userId, m.slug, true, 0);
    }

    if (!providerHasScope(row.scopes, "user:read:subscriptions")) continue;
    const subUrl = new URL("https://api.twitch.tv/helix/subscriptions/user");
    subUrl.searchParams.set("broadcaster_id", helixUser.id);
    subUrl.searchParams.set("user_id", viewerId);
    const subRes = await fetch(subUrl, {
      headers: { Authorization: `Bearer ${token}`, "Client-Id": clientId },
      cache: "no-store", signal: AbortSignal.timeout(15_000),
    });
    const subPayload = subRes.status === 200 ? await subRes.json().catch(() => null) : null;
    const verification = parseTwitchSubscriptionResponse(subRes.status, subPayload);
    if (verification.status === "not_subscribed") {
      await setLoyalty({ userId, connectionId, platform: "twitch", subject: m.slug, kind: "sub", value: false });
      facts++;
      continue;
    }
    if (verification.status === "unknown") {
      // A provider/auth/rate-limit failure is not evidence that a subscription
      // ended. Keep the last persisted value instead of inventing false.
      throw new Error(`twitch subscription check ${subRes.status}`);
    }
    await setLoyalty({
    connectionId,
      userId,
      platform: "twitch",
      subject: m.slug,
      kind: "sub",
      value: true,
      meta: { tier: verification.tier, gift: verification.gift },
    });
    facts++;
    await awardPoints(userId, POINTS.twitch_sub, "twitch_sub", "member", m.slug);
  }
  return facts;
}

async function resolveYoutubeChannelId(
  token: string,
  handle: string,
  knownId?: string,
): Promise<string | null> {
  if (knownId) return knownId;
  const url = new URL("https://www.googleapis.com/youtube/v3/channels");
  url.searchParams.set("part", "id");
  url.searchParams.set("forHandle", handle.startsWith("@") ? handle : `@${handle}`);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store", signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { items?: Array<{ id: string }> };
  return json.items?.[0]?.id ?? null;
}

async function youtubeSubscribedTo(token: string, channelId: string): Promise<boolean> {
  const url = new URL("https://www.googleapis.com/youtube/v3/subscriptions");
  url.searchParams.set("part", "id");
  url.searchParams.set("mine", "true");
  url.searchParams.set("forChannelId", channelId);
  url.searchParams.set("maxResults", "1");
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store", signal: AbortSignal.timeout(15_000),
  });
  const payload = await res.json().catch(() => null);
  const verification = parseYouTubeSubscriptionResponse(res.status, payload);
  if (verification.status === "unknown") {
    throw new Error(`youtube subscription check ${res.status}`);
  }
  return verification.status === "subscribed";
}

async function syncYoutube(userId: string, connectionId: string): Promise<number> {
  const pair = await accessTokenFor(userId, "youtube");
  if (!pair || pair.row.id !== connectionId) throw new Error("YouTube connection changed. Sync again.");
  const { token } = pair;
  let facts = 0;

  const house = houseTarget();
  const houseId = await resolveYoutubeChannelId(token, house.youtubeHandles[0] ?? "", house.youtubeChannelIds[0]);
  if (!houseId && (house.youtubeHandles.length || house.youtubeChannelIds.length)) {
    throw new Error("Unable to check the CORE YouTube channel. Sync again.");
  }
  if (houseId) {
    const sub = await youtubeSubscribedTo(token, houseId);
    await setLoyalty({ userId, connectionId, platform: "youtube", subject: "house", kind: "sub", value: sub });
    facts++;
    if (sub) await awardPoints(userId, POINTS.youtube_sub_house, "youtube_sub_house", "youtube", "house");
  }

  for (const m of memberTargets()) {
    let channelId: string | null = m.youtubeChannelIds[0] ?? null;
    if (!channelId && m.youtubeHandles[0]) {
      channelId = await resolveYoutubeChannelId(token, m.youtubeHandles[0]);
    }
    if (!channelId) {
      // A channel-resolution/configuration failure says nothing about the
      // viewer's subscription. Preserve any previously synced fact.
      if (m.youtubeHandles.length) throw new Error(`Unable to check the YouTube channel for ${m.label}. Sync again.`);
      continue;
    }
    const sub = await youtubeSubscribedTo(token, channelId);
    await setLoyalty({ userId, connectionId, platform: "youtube", subject: m.slug, kind: "sub", value: sub });
    facts++;
    if (sub) await awardPoints(userId, POINTS.youtube_sub, "youtube_sub", "member", m.slug);
  }

  // Liked videos that belong to house / member channels (quota-friendly: one page).
  const likeUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
  likeUrl.searchParams.set("part", "snippet");
  likeUrl.searchParams.set("myRating", "like");
  likeUrl.searchParams.set("maxResults", "50");
  const likeRes = await fetch(likeUrl, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store", signal: AbortSignal.timeout(15_000),
  });
  if (likeRes.ok) {
    const likeJson = (await likeRes.json()) as {
      items?: Array<{ id: string; snippet?: { channelId?: string; channelTitle?: string } }>;
    };
    const wanted = new Set<string>();
    if (houseId) wanted.add(houseId);
    for (const m of memberTargets()) {
      for (const id of m.youtubeChannelIds) wanted.add(id);
    }
    for (const item of likeJson.items ?? []) {
      const ch = item.snippet?.channelId;
      if (!ch || !wanted.has(ch)) continue;
      await setLoyalty({
        connectionId,
        userId,
        platform: "youtube",
        subject: ch === houseId ? "house" : "video",
        kind: "like",
        value: true,
        meta: { videoId: item.id },
      });
      await awardPoints(userId, POINTS.youtube_like, "youtube_like", "youtube", item.id);
      facts++;
    }
  }

  return facts;
}

/**
 * Validate the viewer's TikTok media grant against the official Display API.
 * We retain only the availability/count fact here; media stays at TikTok and
 * is fetched just in time for eligible connected creator channels.
 */
async function syncTikTok(userId: string, connectionId: string): Promise<number> {
  const pair = await accessTokenFor(userId, "tiktok");
  if (!pair || pair.row.id !== connectionId) throw new Error("TikTok connection changed. Sync again.");
  if (!providerHasScope(pair.row.scopes, "video.list")) {
    throw new Error("Reconnect TikTok to approve video.list");
  }
  const params = new URLSearchParams({ fields: "id" });
  const response = await fetch(`https://open.tiktokapis.com/v2/video/list/?${params}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${pair.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ max_count: 20 }),
    cache: "no-store", signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`tiktok media sync ${response.status}`);
  const json = (await response.json()) as {
    data?: { videos?: Array<{ id?: string }>; has_more?: boolean };
    error?: { code?: string };
  };
  if (json.error?.code && json.error.code !== "ok") {
    throw new Error(`tiktok media sync ${json.error.code}`);
  }
  await setLoyalty({
    connectionId,
    userId,
    platform: "tiktok",
    subject: "self",
    kind: "media_sync",
    value: true,
    meta: {
      sampledVideos: (json.data?.videos ?? []).filter((video) => Boolean(video.id)).length,
      hasMore: Boolean(json.data?.has_more),
    },
  });
  return 1;
}

/** Instagram Login supports professional-account media reads, not comments. */
async function syncInstagram(userId: string, connectionId: string): Promise<number> {
  const pair = await accessTokenFor(userId, "instagram");
  if (!pair || pair.row.id !== connectionId) throw new Error("Instagram connection changed. Sync again.");
  if (!providerHasScope(pair.row.scopes, "instagram_business_basic") &&
      !providerHasScope(pair.row.scopes, "instagram_basic")) {
    throw new Error("Reconnect Instagram to approve media access");
  }
  const version = /^v\d+\.\d+$/.test(process.env.META_GRAPH_API_VERSION ?? "")
    ? process.env.META_GRAPH_API_VERSION!
    : "v26.0";
  const legacyFacebook =
    providerHasScope(pair.row.scopes, "instagram_basic") &&
    !providerHasScope(pair.row.scopes, "instagram_business_basic");
  const identity = legacyFacebook
    ? `https://graph.facebook.com/${version}/${encodeURIComponent(pair.row.provider_user_id ?? "me")}`
    : `https://graph.instagram.com/${version}/me`;
  const params = new URLSearchParams({ fields: "id,username,media_count" });
  const response = await fetch(`${identity}?${params}`, {
    headers: { Authorization: `Bearer ${pair.token}` },
    cache: "no-store", signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`instagram media sync ${response.status}`);
  const json = (await response.json()) as {
    id?: string;
    username?: string;
    media_count?: number;
  };
  if (!json.id) throw new Error("instagram media sync missing identity");
  await setLoyalty({
    connectionId,
    userId,
    platform: "instagram",
    subject: "self",
    kind: "media_sync",
    value: true,
    meta: {
      username: json.username ?? pair.row.provider_username ?? null,
      mediaCount: Number.isFinite(json.media_count) ? json.media_count : null,
    },
  });
  return 1;
}

async function syncX(userId: string, connectionId: string): Promise<number> {
  const pair = await accessTokenFor(userId, "x");
  if (!pair || pair.row.id !== connectionId) throw new Error("X connection changed. Sync again.");
  const { token, row } = pair;
  const myId = row.provider_user_id;
  if (!myId) throw new Error("missing X user id");

  const house = houseTarget();
  const members = memberTargets();
  const handles = [house.xHandle, ...members.map((m) => m.xHandle)].filter(Boolean) as string[];
  if (handles.length === 0) return 0;

  const byUrl = new URL("https://api.twitter.com/2/users/by");
  byUrl.searchParams.set("usernames", handles.join(","));
  const byRes = await fetch(byUrl, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store", signal: AbortSignal.timeout(15_000),
  });
  if (!byRes.ok) throw new Error(`x users/by ${byRes.status}`);
  const byJson = (await byRes.json()) as {
    data?: Array<{ id: string; username: string }>;
  };
  const idByHandle = new Map(
    (byJson.data ?? []).map((u) => [u.username.toLowerCase(), u.id]),
  );

  // A bounded complete scan; an unfinished scan never becomes negative evidence.
  const following = new Set<string>();
  let tokenPage: string | undefined;
  for (let i = 0; i < 10; i++) {
    const url = new URL(`https://api.twitter.com/2/users/${myId}/following`);
    url.searchParams.set("max_results", "1000");
    if (tokenPage) url.searchParams.set("pagination_token", tokenPage);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store", signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`x following ${res.status}`);
    const json = (await res.json()) as {
      data?: Array<{ username: string }>;
      meta?: { next_token?: string; result_count?: number };
    };
    if (!Array.isArray(json.data) && json.meta?.result_count !== 0) throw new Error("Invalid X following response");
    for (const u of json.data ?? []) following.add(u.username.toLowerCase());
    tokenPage = json.meta?.next_token;
    if (!tokenPage) break;
  }

  if (tokenPage) throw new Error("X following list is incomplete. Sync again to refresh.");
  let facts = 0;
  const check = async (slug: string, handle: string | null) => {
    if (!handle) return;
    if (!idByHandle.has(handle.toLowerCase())) throw new Error(`Unable to check X account ${handle}. Sync again.`);
    const isFollow = following.has(handle) || following.has(handle.toLowerCase());
    await setLoyalty({ userId, connectionId, platform: "x", subject: slug, kind: "follow", value: isFollow });
    facts++;
    if (isFollow) await awardPoints(userId, POINTS.x_follow, "x_follow", "x", slug);
  };

  await check("house", house.xHandle);
  for (const m of members) await check(m.slug, m.xHandle);
  return facts;
}
