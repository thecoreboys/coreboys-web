export const METRICS_PLATFORMS = ["twitch", "youtube", "tiktok", "instagram", "x"] as const;
export type MetricsPlatform = (typeof METRICS_PLATFORMS)[number];
export type MetricsRange = "7d" | "30d" | "90d" | "all";

export type MetricChannel = {
  owner: "core" | string;
  kind: "core" | "member";
  platform: MetricsPlatform;
  handle: string;
  url: string;
  label: string;
};

export type AudienceSnapshot = MetricChannel & { date: string; count: number; takenAt: string };
export type SocialActivityPoint = {
  owner: "core" | string;
  platform: MetricsPlatform;
  contentType: "live" | "video" | "short" | "photo" | "post";
  date: string;
  count: number;
};
export type LatestActivity = {
  owner: "core" | string;
  platform: MetricsPlatform;
  title: string;
  href: string;
  publishedAt: string;
};
export type StoredStreamSession = {
  slug: string;
  startedAt: string;
  endedAt: string | null;
  totalMinutes: number;
  peakViewers: number;
  sumViewers: number;
  sampleCount: number;
  lastPolledAt: string;
};
export type ChatMetricDay = { slug: string; date: string; messages: number; chatters: number };
export type TwitchRollingMetric = {
  slug: string;
  minutesStreamed: number;
  avgViewers: number;
  maxViewers: number;
  hoursWatched: number;
  followersGained: number;
  followersTotal: number;
  fetchedAt: string;
};
export type MetricsFreshness = {
  audience: string | null;
  social: string | null;
  streams: string | null;
  chat: string | null;
  twitchTracker: string | null;
};
export type MetricsDashboard = {
  generatedAt: string;
  channels: MetricChannel[];
  audience: AudienceSnapshot[];
  activity: SocialActivityPoint[];
  latestActivity: LatestActivity[];
  streams: StoredStreamSession[];
  chat: ChatMetricDay[];
  twitchRolling: TwitchRollingMetric[];
  freshness: MetricsFreshness;
};

export type ChannelMetrics = MetricChannel & {
  followers: number | null;
  growth: number | null;
  postCount: number;
  lastActivity: LatestActivity | null;
};
export type OwnerMetrics = {
  owner: "core" | string;
  channels: ChannelMetrics[];
  followers: number | null;
  followerGrowth: number | null;
  posts: number;
  publishingDays: number;
  byType: Array<{ contentType: SocialActivityPoint["contentType"]; count: number }>;
  lastActivity: LatestActivity | null;
  streams: number;
  airtimeMinutes: number;
  peakViewers: number;
  averageViewers: number | null;
  hoursWatched: number;
  chatMessages: number;
  channelChatters: number;
  liveStatus: "live" | "offline" | "unavailable";
  rollingTwitch: TwitchRollingMetric | null;
};
export type DerivedMetricsDashboard = {
  range: MetricsRange;
  startsOn: string | null;
  network: OwnerMetrics & { activeCreators: number };
  core: OwnerMetrics;
  members: OwnerMetrics[];
};

function dayKey(value: string): string {
  return value.slice(0, 10);
}

function rangeStart(now: string, range: MetricsRange): string | null {
  if (range === "all") return null;
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const date = new Date(`${dayKey(now)}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - (days - 1));
  return date.toISOString().slice(0, 10);
}

function inRange(date: string, start: string | null): boolean {
  return start === null || date >= start;
}

function newest<T extends { date?: string; publishedAt?: string; startedAt?: string }>(items: T[]): T | null {
  return items.reduce<T | null>((current, item) => {
    const key = item.date ?? item.publishedAt ?? item.startedAt ?? "";
    const currentKey = current?.date ?? current?.publishedAt ?? current?.startedAt ?? "";
    return !current || key > currentKey ? item : current;
  }, null);
}

function isFresh(value: string | null, now: string): boolean {
  return Boolean(value && Date.parse(value) >= Date.parse(now) - 15 * 60_000);
}

function ownerMetrics(input: {
  dashboard: MetricsDashboard;
  owner: "core" | string;
  rangeStart: string | null;
  isNetwork?: boolean;
}): OwnerMetrics {
  const owners = input.isNetwork ? new Set(["core", ...input.dashboard.channels.filter((channel) => channel.kind === "member").map((channel) => channel.owner)]) : new Set([input.owner]);
  const channels = input.dashboard.channels.filter((channel) => owners.has(channel.owner));
  const channelMetrics = channels.map((channel) => {
    const history = input.dashboard.audience
      .filter((row) => row.owner === channel.owner && row.platform === channel.platform && row.handle === channel.handle)
      .sort((a, b) => a.date.localeCompare(b.date));
    const latest = history.at(-1) ?? null;
    const baseline = history.find((row) => inRange(row.date, input.rangeStart)) ?? null;
    const hasPeriodChange = Boolean(latest && baseline && latest.date !== baseline.date);
    const activity = input.dashboard.activity
      .filter((row) => row.owner === channel.owner && row.platform === channel.platform && inRange(row.date, input.rangeStart))
      .reduce((total, row) => total + row.count, 0);
    return {
      ...channel,
      followers: latest?.count ?? null,
      growth: hasPeriodChange ? (latest!.count - baseline!.count) : null,
      postCount: activity,
      lastActivity: newest(input.dashboard.latestActivity.filter((row) => row.owner === channel.owner && row.platform === channel.platform)),
    } satisfies ChannelMetrics;
  });
  const activity = input.dashboard.activity.filter((row) => owners.has(row.owner) && inRange(row.date, input.rangeStart));
  const streams = input.dashboard.streams.filter((row) => owners.has(row.slug) && inRange(dayKey(row.startedAt), input.rangeStart));
  const chat = input.dashboard.chat.filter((row) => owners.has(row.slug) && inRange(row.date, input.rangeStart));
  const weightedSamples = streams.reduce((total, row) => total + row.sampleCount, 0);
  const activityDays = new Set(activity.map((row) => `${row.owner}:${row.date}`));
  const byType = new Map<SocialActivityPoint["contentType"], number>();
  for (const row of activity) byType.set(row.contentType, (byType.get(row.contentType) ?? 0) + row.count);
  const followers = channelMetrics.reduce<number | null>((total, channel) => channel.followers == null ? total : (total ?? 0) + channel.followers, null);
  const growthRows = channelMetrics.filter((channel) => channel.growth != null);
  const rolling = input.isNetwork ? null : input.dashboard.twitchRolling.find((row) => row.slug === input.owner) ?? null;
  const freshStreams = isFresh(input.dashboard.freshness.streams, input.dashboard.generatedAt);
  const hasOpenStream = streams.some((row) => row.endedAt === null && isFresh(row.lastPolledAt, input.dashboard.generatedAt));
  return {
    owner: input.owner,
    channels: channelMetrics,
    followers,
    followerGrowth: growthRows.length ? growthRows.reduce((total, channel) => total + (channel.growth ?? 0), 0) : null,
    posts: activity.reduce((total, row) => total + row.count, 0),
    publishingDays: activityDays.size,
    byType: [...byType.entries()].map(([contentType, count]) => ({ contentType, count })).sort((a, b) => b.count - a.count),
    lastActivity: newest(input.dashboard.latestActivity.filter((row) => owners.has(row.owner))),
    streams: streams.length,
    airtimeMinutes: streams.reduce((total, row) => total + row.totalMinutes, 0),
    peakViewers: streams.reduce((peak, row) => Math.max(peak, row.peakViewers), 0),
    averageViewers: weightedSamples ? Math.round(streams.reduce((total, row) => total + row.sumViewers, 0) / weightedSamples) : null,
    hoursWatched: Math.round(streams.reduce((total, row) => total + (row.sumViewers / 60), 0)),
    chatMessages: chat.reduce((total, row) => total + row.messages, 0),
    channelChatters: chat.reduce((total, row) => total + row.chatters, 0),
    liveStatus: freshStreams ? hasOpenStream ? "live" : "offline" : "unavailable",
    rollingTwitch: rolling,
  };
}

export function deriveMetricsDashboard(dashboard: MetricsDashboard, range: MetricsRange): DerivedMetricsDashboard {
  const startsOn = rangeStart(dashboard.generatedAt, range);
  const core = ownerMetrics({ dashboard, owner: "core", rangeStart: startsOn });
  const memberOwners = [...new Set(dashboard.channels.filter((channel) => channel.kind === "member").map((channel) => channel.owner))];
  const members = memberOwners.map((owner) => ownerMetrics({ dashboard, owner, rangeStart: startsOn }));
  const networkBase = ownerMetrics({ dashboard, owner: "core", rangeStart: startsOn, isNetwork: true });
  return {
    range,
    startsOn,
    core,
    members,
    network: { ...networkBase, activeCreators: members.filter((member) => member.posts > 0 || member.streams > 0 || member.liveStatus === "live").length },
  };
}
