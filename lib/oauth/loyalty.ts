import { query } from "@/lib/db";
import { ensureFanOauthSchema } from "@/lib/oauth/schema";
import { allTargets, X_PROFILE_TARGETS } from "@/lib/oauth/roster";

export type LoyaltyFact = {
  platform: string;
  subject: string;
  kind: string;
  value: boolean;
  meta: Record<string, unknown> | null;
  updatedAt: string;
};

export async function setLoyalty(input: {
  userId: string;
  platform: string;
  subject: string;
  kind: string;
  value: boolean;
  meta?: Record<string, unknown> | null;
}): Promise<void> {
  await ensureFanOauthSchema();
  await query(
    `INSERT INTO fan_loyalty (user_id, platform, subject, kind, value, meta, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb, now())
     ON CONFLICT (user_id, platform, subject, kind)
     DO UPDATE SET value = EXCLUDED.value, meta = EXCLUDED.meta, updated_at = now()`,
    [
      input.userId,
      input.platform,
      input.subject,
      input.kind,
      input.value,
      input.meta ? JSON.stringify(input.meta) : null,
    ],
  );
}

export async function listLoyalty(userId: string): Promise<LoyaltyFact[]> {
  await ensureFanOauthSchema();
  const { rows } = await query<{
    platform: string;
    subject: string;
    kind: string;
    value: boolean;
    meta: Record<string, unknown> | null;
    updated_at: Date;
  }>(
    `SELECT platform, subject, kind, value, meta, updated_at
       FROM fan_loyalty WHERE user_id = $1`,
    [userId],
  );
  return rows.map((r) => ({
    platform: r.platform,
    subject: r.subject,
    kind: r.kind,
    value: r.value,
    meta: r.meta,
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
  }));
}

export type MemberLoyaltyRow = {
  slug: string;
  label: string;
  twitchFollow: boolean;
  twitchSub: boolean;
  twitchSubMeta: Record<string, unknown> | null;
  youtubeSub: boolean;
  xFollow: boolean;
  siteChat: boolean;
  siteWatch: boolean;
};

export type SiteWatchStats = {
  minutes7d: number;
  watchMinutes7d: number;
  watchMinutesTotal: number;
  playbackCompleted: number;
  manuallyCompleted: number;
  ytPlays7d: number;
  vodPlays7d: number;
  chatMinutes7d: number;
};

export type LoyaltyCard = {
  rows: MemberLoyaltyRow[];
  house: {
    youtubeSub: boolean;
    xFollow: boolean;
    communityAttested: boolean;
  };
  completion: { done: number; total: number };
  radar: { twitch: number; youtube: number; x: number; site: number };
  houseStatus: "none" | "og-path" | "super";
  favoriteSlug: string | null;
  xProfiles: typeof X_PROFILE_TARGETS;
  honestGaps: string[];
  siteWatch: SiteWatchStats;
};

export function buildLoyaltyCard(
  facts: LoyaltyFact[],
  favoriteSlug: string | null,
  siteWatch: SiteWatchStats = {
    minutes7d: 0, watchMinutes7d: 0, watchMinutesTotal: 0,
    playbackCompleted: 0, manuallyCompleted: 0,
    ytPlays7d: 0, vodPlays7d: 0, chatMinutes7d: 0,
  },
): LoyaltyCard {
  const hit = (platform: string, subject: string, kind: string) =>
    facts.find((f) => f.platform === platform && f.subject === subject && f.kind === kind && f.value);

  const members = allTargets().filter((t) => t.slug !== "house");
  const rows: MemberLoyaltyRow[] = members.map((t) => ({
    slug: t.slug,
    label: t.label,
    twitchFollow: Boolean(hit("twitch", t.slug, "follow")),
    twitchSub: Boolean(hit("twitch", t.slug, "sub")),
    twitchSubMeta: hit("twitch", t.slug, "sub")?.meta ?? null,
    youtubeSub: Boolean(hit("youtube", t.slug, "sub")),
    xFollow: Boolean(hit("x", t.slug, "follow")),
    siteChat: Boolean(hit("site", t.slug, "chat")),
    siteWatch: Boolean(hit("site", t.slug, "watch")),
  }));

  const house = {
    youtubeSub: Boolean(hit("youtube", "house", "sub")),
    xFollow: Boolean(hit("x", "house", "follow")),
    communityAttested: Boolean(hit("x", "house", "community")),
  };

  // 6 members × (twitch follow + twitch sub + youtube sub) + house youtube + house x + 6 x follows
  let done = 0;
  let total = 0;
  for (const r of rows) {
    total += 4;
    if (r.twitchFollow) done++;
    if (r.twitchSub) done++;
    if (r.youtubeSub) done++;
    if (r.xFollow) done++;
  }
  total += 2;
  if (house.youtubeSub) done++;
  if (house.xFollow) done++;

  const twitch = rows.filter((r) => r.twitchFollow || r.twitchSub).length;
  const youtube = rows.filter((r) => r.youtubeSub).length + (house.youtubeSub ? 1 : 0);
  const x = rows.filter((r) => r.xFollow).length + (house.xFollow ? 1 : 0);
  const site = rows.filter((r) => r.siteChat || r.siteWatch).length;

  const subCount = rows.filter((r) => r.twitchSub).length;
  const ytMemberSubs = rows.filter((r) => r.youtubeSub).length;
  const houseStatus: LoyaltyCard["houseStatus"] =
    subCount >= 3 || (house.youtubeSub && ytMemberSubs >= 2)
      ? "super"
      : subCount >= 1 || house.youtubeSub
        ? "og-path"
        : "none";

  let favorite = favoriteSlug;
  if (!favorite) {
    const scored = rows
      .map((r) => ({
        slug: r.slug,
        n:
          (r.twitchSub ? 5 : 0) +
          (r.twitchFollow ? 2 : 0) +
          (r.youtubeSub ? 3 : 0) +
          (r.xFollow ? 1 : 0) +
          (r.siteChat ? 2 : 0) +
          (r.siteWatch ? 1 : 0),
      }))
      .sort((a, b) => b.n - a.n);
    favorite = scored[0] && scored[0].n > 0 ? scored[0].slug : null;
  }

  return {
    rows,
    house,
    completion: { done, total },
    radar: { twitch, youtube, x, site },
    houseStatus,
    favoriteSlug: favorite,
    xProfiles: X_PROFILE_TARGETS,
    siteWatch,
    honestGaps: [
      "Twitch does not give third parties your hours watched or VOD completion on someone else's channel. The numbers below are minutes this tab was open on /chat, plus VOD plays on this site.",
      "YouTube removed watch-history access for third-party apps. We only count plays you start on /videos.",
      "X Community membership is not provider-verified. A FanZone self-attestation is only the fan’s own statement.",
      "Twitch shut down third-party whispers. We deep-link you to Twitch instead of sending a whisper from CORE.",
    ],
  };
}

export async function recordSiteEvent(
  userId: string,
  kind: string,
  subject: string | null,
  ref?: string | null,
  seconds = 0,
): Promise<void> {
  await ensureFanOauthSchema();
  await query(
    `INSERT INTO fan_site_events (user_id, kind, subject, ref, seconds)
     VALUES ($1,$2,$3,$4,$5)`,
    [userId, kind, subject, ref ?? null, Math.max(0, Math.min(seconds, 180))],
  );
  if (subject && (kind === "chat_open" || kind === "heartbeat")) {
    await setLoyalty({ userId, platform: "site", subject, kind: "chat", value: true });
  }
  if (subject && (kind === "video_play" || kind === "live_embed" || kind === "vod_play")) {
    await setLoyalty({ userId, platform: "site", subject, kind: "watch", value: true });
  }
}

export async function siteWatchStats(userId: string): Promise<SiteWatchStats> {
  await ensureFanOauthSchema();
  const { rows } = await query<{
    minutes: string;
    watch_7d: string;
    watch_total: string;
    playback_completed: string;
    manually_completed: string;
    yt: string;
    vod: string;
    chat_min: string;
  }>(
    `SELECT
        (SELECT COALESCE(SUM(seconds),0) FROM fan_site_events
          WHERE user_id=$1 AND created_at>now()-interval '7 days'
            AND kind IN ('heartbeat','chat_open','live_embed','video_play','vod_play'))::text AS minutes,
        (SELECT COALESCE(SUM(seconds),0) FROM fan_watch_time_events
          WHERE user_id=$1 AND source='site' AND observed_at>now()-interval '7 days')::text AS watch_7d,
        (SELECT COALESCE(SUM(seconds),0) FROM fan_watch_progress
          WHERE user_id=$1)::text AS watch_total,
        (SELECT COUNT(*) FROM fan_watch_progress
          WHERE user_id=$1 AND completed AND completion_source='playback')::text AS playback_completed,
        (SELECT COUNT(*) FROM fan_watch_progress
          WHERE user_id=$1 AND completed AND completion_source='manual')::text AS manually_completed,
        (SELECT COUNT(*) FROM fan_site_events
          WHERE user_id=$1 AND created_at>now()-interval '7 days' AND kind='video_play')::text AS yt,
        (SELECT COUNT(*) FROM fan_site_events
          WHERE user_id=$1 AND created_at>now()-interval '7 days' AND kind='vod_play')::text AS vod,
        (SELECT COALESCE(SUM(seconds),0) FROM fan_site_events
          WHERE user_id=$1 AND created_at>now()-interval '7 days'
            AND kind IN ('heartbeat','chat_open'))::text AS chat_min`,
    [userId],
  );
  const r = rows[0];
  return {
    minutes7d: Math.round(Number(r?.minutes ?? 0) / 60),
    watchMinutes7d: Math.round(Number(r?.watch_7d ?? 0) / 60),
    watchMinutesTotal: Math.round(Number(r?.watch_total ?? 0) / 60),
    playbackCompleted: Number(r?.playback_completed ?? 0),
    manuallyCompleted: Number(r?.manually_completed ?? 0),
    ytPlays7d: Number(r?.yt ?? 0),
    vodPlays7d: Number(r?.vod ?? 0),
    chatMinutes7d: Math.round(Number(r?.chat_min ?? 0) / 60),
  };
}

export async function recentSiteEvents(userId: string, limit = 50) {
  await ensureFanOauthSchema();
  const { rows } = await query<{
    kind: string;
    subject: string | null;
    ref: string | null;
    created_at: Date;
  }>(
    `SELECT kind, subject, ref, created_at
       FROM fan_site_events WHERE user_id = $1
       ORDER BY created_at DESC LIMIT $2`,
    [userId, limit],
  );
  return rows.map((r) => ({
    kind: r.kind,
    subject: r.subject,
    ref: r.ref,
    at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));
}
