import "server-only";

import { query } from "@/lib/db";
import { GROUP } from "@/lib/group";
import { MEMBERS } from "@/lib/members";
import {
  METRICS_PLATFORMS,
  type AudienceSnapshot,
  type ChatMetricDay,
  type LatestActivity,
  type MetricChannel,
  type MetricsDashboard,
  type MetricsPlatform,
  type MetricsFreshness,
  type SocialActivityPoint,
  type StoredStreamSession,
  type TwitchRollingMetric,
} from "@/lib/metrics-dashboard-model";

const PLATFORM_SET = new Set<string>(METRICS_PLATFORMS);
const MEMBER_SLUGS = new Set(MEMBERS.map((member) => member.slug));

function isPlatform(value: string): value is MetricsPlatform {
  return PLATFORM_SET.has(value);
}

function channelKey(owner: string, platform: string, handle: string): string {
  return `${owner}\u0000${platform}\u0000${handle}`;
}

function configuredChannels(): MetricChannel[] {
  const memberChannels = MEMBERS.flatMap((member) => member.socials.flatMap((social) => {
    if (!isPlatform(social.platform)) return [];
    return [{
      owner: member.slug,
      kind: "member" as const,
      platform: social.platform,
      handle: social.platform === "twitch" ? member.twitchLogin.toLowerCase() : social.url,
      url: social.url,
      label: social.handle ?? `@${member.twitchLogin}`,
    }];
  }));
  const coreChannels = Object.entries(GROUP.socials).flatMap(([platform, social]) => {
    if (!isPlatform(platform)) return [];
    return [{ owner: "core" as const, kind: "core" as const, platform, handle: social.url, url: social.url, label: social.handle }];
  });
  return [...coreChannels, ...memberChannels];
}

async function safeRows<T>(work: () => Promise<{ rows: T[] }>): Promise<T[]> {
  try {
    return (await work()).rows;
  } catch {
    return [];
  }
}

type SnapshotRow = { member_slug: string; platform: string; handle: string; count: string; snapshot_date: string; taken_at: string };
type ActivityRow = { owner: string; provider: string; content_type: string; snapshot_date: string; count: string };
type LatestActivityRow = { owner: string; provider: string; title: string; href: string; published_at: string };
type StreamRow = { member_slug: string; started_at: string; ended_at: string | null; total_minutes: number; peak_viewers: number; sum_viewers: string; sample_count: number; last_polled_at: string };
type ChatRow = { member_slug: string; snapshot_date: string; messages: string; chatters: string };
type TwitchRollingRow = { member_slug: string; minutes_streamed: number; avg_viewers: number; max_viewers: number; hours_watched: string; followers_gained: number; followers_total: string; fetched_at: string };

function toIso(value: string): string {
  const parsed = Date.parse(value.replace(" ", "T"));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : value;
}

export async function getMetricsDashboard(): Promise<MetricsDashboard> {
  const channels = configuredChannels();
  const configured = new Map(channels.map((channel) => [channelKey(channel.owner, channel.platform, channel.handle), channel]));
  const memberSlugs = [...MEMBER_SLUGS];
  const [snapshotRows, activityRows, latestRows, streamRows, chatRows, rollingRows, freshnessRows] = await Promise.all([
    safeRows(() => query<SnapshotRow>(`SELECT member_slug,platform,handle,count::text,snapshot_date::text,taken_at::text FROM metric_snapshots WHERE member_slug = '__group__' OR member_slug = ANY($1::text[]) ORDER BY snapshot_date ASC,taken_at ASC`, [memberSlugs])),
    safeRows(() => query<ActivityRow>(`SELECT CASE WHEN member_slug IS NULL OR member_slug='core' THEN 'core' ELSE member_slug END AS owner,provider,content_type,(published_at AT TIME ZONE 'UTC')::date::text AS snapshot_date,count(DISTINCT canonical_id)::text AS count FROM social_content_events WHERE provider = ANY($1::text[]) AND (member_slug IS NULL OR member_slug='core' OR member_slug = ANY($2::text[])) GROUP BY 1,2,3,4 ORDER BY 4 ASC`, [METRICS_PLATFORMS, memberSlugs])),
    safeRows(() => query<LatestActivityRow>(`SELECT DISTINCT ON (owner,provider) owner,provider,title,href,published_at::text FROM (SELECT CASE WHEN member_slug IS NULL OR member_slug='core' THEN 'core' ELSE member_slug END AS owner,provider,title,href,published_at FROM social_content_events WHERE provider = ANY($1::text[]) AND (member_slug IS NULL OR member_slug='core' OR member_slug = ANY($2::text[]))) events ORDER BY owner,provider,published_at DESC`, [METRICS_PLATFORMS, memberSlugs])),
    safeRows(() => query<StreamRow>(`SELECT member_slug,started_at::text,ended_at::text,total_minutes,peak_viewers,sum_viewers::text,sample_count,last_polled_at::text FROM stream_sessions WHERE member_slug = ANY($1::text[]) ORDER BY started_at ASC`, [memberSlugs])),
    safeRows(() => query<ChatRow>(`SELECT member_slug,(hour_utc AT TIME ZONE 'UTC')::date::text AS snapshot_date,sum(message_count)::text AS messages,sum(unique_chatters)::text AS chatters FROM chat_metrics WHERE member_slug = ANY($1::text[]) GROUP BY member_slug,(hour_utc AT TIME ZONE 'UTC')::date ORDER BY snapshot_date ASC`, [memberSlugs])),
    safeRows(() => query<TwitchRollingRow>(`SELECT DISTINCT ON (member_slug) member_slug,minutes_streamed,avg_viewers,max_viewers,hours_watched::text,followers_gained,followers_total::text,fetched_at::text FROM twitchtracker_channel_snapshots WHERE member_slug = ANY($1::text[]) ORDER BY member_slug,snapshot_date DESC,fetched_at DESC`, [memberSlugs])),
    safeRows(() => query<{ audience: string | null; social: string | null; streams: string | null; chat: string | null; twitch_tracker: string | null }>(`SELECT (SELECT max(taken_at)::text FROM metric_snapshots) AS audience,(SELECT max(received_at)::text FROM social_content_events) AS social,(SELECT max(last_polled_at)::text FROM stream_sessions) AS streams,(SELECT max(last_flushed_at)::text FROM chat_metrics) AS chat,(SELECT max(fetched_at)::text FROM twitchtracker_channel_snapshots) AS twitch_tracker`)),
  ]);

  const audience: AudienceSnapshot[] = snapshotRows.flatMap((row) => {
    const owner = row.member_slug === "__group__" ? "core" : row.member_slug;
    const channel = configured.get(channelKey(owner, row.platform, row.handle));
    const count = Number(row.count);
    return channel && Number.isFinite(count) && count >= 0 ? [{ ...channel, date: row.snapshot_date.slice(0, 10), count, takenAt: toIso(row.taken_at) }] : [];
  });
  const activity: SocialActivityPoint[] = [];
  for (const row of activityRows) {
    const count = Number(row.count);
    if (!isPlatform(row.provider) || (row.owner !== "core" && !MEMBER_SLUGS.has(row.owner)) || !["live", "video", "short", "photo", "post"].includes(row.content_type) || !Number.isFinite(count)) continue;
    activity.push({ owner: row.owner, platform: row.provider, contentType: row.content_type as SocialActivityPoint["contentType"], date: row.snapshot_date.slice(0, 10), count });
  }
  const latestActivity: LatestActivity[] = latestRows.flatMap((row) => isPlatform(row.provider) ? [{ owner: row.owner as "core" | string, platform: row.provider, title: row.title, href: row.href, publishedAt: toIso(row.published_at) }] : []);
  const streams: StoredStreamSession[] = streamRows.map((row) => ({ slug: row.member_slug, startedAt: toIso(row.started_at), endedAt: row.ended_at ? toIso(row.ended_at) : null, totalMinutes: row.total_minutes, peakViewers: row.peak_viewers, sumViewers: Number(row.sum_viewers), sampleCount: row.sample_count, lastPolledAt: toIso(row.last_polled_at) }));
  const chat: ChatMetricDay[] = chatRows.map((row) => ({ slug: row.member_slug, date: row.snapshot_date.slice(0, 10), messages: Number(row.messages), chatters: Number(row.chatters) }));
  const twitchRolling: TwitchRollingMetric[] = rollingRows.map((row) => ({ slug: row.member_slug, minutesStreamed: row.minutes_streamed, avgViewers: row.avg_viewers, maxViewers: row.max_viewers, hoursWatched: Number(row.hours_watched), followersGained: row.followers_gained, followersTotal: Number(row.followers_total), fetchedAt: toIso(row.fetched_at) }));
  const row = freshnessRows[0];
  const freshness: MetricsFreshness = { audience: row?.audience ? toIso(row.audience) : null, social: row?.social ? toIso(row.social) : null, streams: row?.streams ? toIso(row.streams) : null, chat: row?.chat ? toIso(row.chat) : null, twitchTracker: row?.twitch_tracker ? toIso(row.twitch_tracker) : null };
  return { generatedAt: new Date().toISOString(), channels, audience, activity, latestActivity, streams, chat, twitchRolling, freshness };
}
