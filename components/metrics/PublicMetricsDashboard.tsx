"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { Clock, Eye, MessageChatCircle, PlayCircle, Signal01, Users01, VideoRecorder } from "@untitledui/icons";
import { MetricCard } from "@/components/metrics/MetricCard";
import { RangeToggle } from "@/components/metrics/RangeToggle";
import { SocialIcon } from "@/components/ui/SocialIcon";
import {
  deriveMetricsDashboard,
  type ChannelMetrics,
  type MetricsDashboard,
  type MetricsPlatform,
  type MetricsRange,
  type OwnerMetrics,
} from "@/lib/metrics-dashboard-model";

type Member = { slug: string; name: string; accent: string; portrait: string; twitchLogin: string };
const BRAND: Record<MetricsPlatform, string> = { twitch: "#9146FF", youtube: "#ff0033", tiktok: "#fe2c55", instagram: "#e1306c", x: "#a1a1aa" };
const PLATFORM_LABEL: Record<MetricsPlatform, string> = { twitch: "Twitch", youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram", x: "X" };
const CONTENT_LABEL: Record<string, string> = { live: "Live", video: "Videos", short: "Shorts", photo: "Photos", post: "Posts" };

function compact(value: number | null): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(Math.max(0, Math.round(value)));
}

function exact(value: number | null): string {
  return value == null ? "—" : Math.max(0, Math.round(value)).toLocaleString("en-US");
}

function signed(value: number | null): string | undefined {
  if (value == null) return undefined;
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${compact(Math.abs(value))}`;
}

function airtime(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  return hours ? `${hours}h${total % 60 ? ` ${total % 60}m` : ""}` : `${total}m`;
}

function relativeDate(value: string | null, now: string): string {
  if (!value) return "No stored activity";
  const days = Math.max(0, Math.floor((Date.parse(now) - Date.parse(value)) / 86_400_000));
  return days === 0 ? "Today" : days === 1 ? "Yesterday" : `${days} days ago`;
}

function freshness(value: string | null, now: string): { label: string; tone: string } {
  if (!value) return { label: "Awaiting data", tone: "text-quaternary" };
  const hours = (Date.parse(now) - Date.parse(value)) / 3_600_000;
  if (hours <= 24) return { label: "Current", tone: "text-success-primary" };
  if (hours <= 72) return { label: "Stored", tone: "text-warning-primary" };
  return { label: "Older snapshot", tone: "text-quaternary" };
}

function statusLabel(status: OwnerMetrics["liveStatus"]): string {
  return status === "live" ? "Live now" : status === "offline" ? "Offline" : "Status unavailable";
}

function overviewCopy(summary: OwnerMetrics): string {
  const facts = [
    `${exact(summary.posts)} published`,
    `${exact(summary.streams)} live session${summary.streams === 1 ? "" : "s"}`,
    `${airtime(summary.airtimeMinutes)} on air`,
  ];
  if (summary.peakViewers > 0) facts.push(`${exact(summary.peakViewers)} highest live peak`);
  return `${facts.join(" · ")}. Every figure comes from CORE's stored records for this window.`;
}

export function PublicMetricsDashboard({ dashboard, members }: { dashboard: MetricsDashboard; members: Member[] }) {
  const [range, setRange] = useState<MetricsRange>("30d");
  const data = useMemo(() => deriveMetricsDashboard(dashboard, range), [dashboard, range]);
  const memberBySlug = useMemo(() => new Map(members.map((member) => [member.slug, member])), [members]);
  const socialFreshness = freshness(dashboard.freshness.social, dashboard.generatedAt);
  const audienceFreshness = freshness(dashboard.freshness.audience, dashboard.generatedAt);
  const streamFreshness = freshness(dashboard.freshness.streams, dashboard.generatedAt);

  return (
    <div className="flex flex-col gap-12">
      <section className="rounded-3xl bg-secondary p-5 shadow-xl ring-1 ring-inset ring-secondary sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-sm font-semibold text-brand-secondary">Network overview</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-primary md:text-display-xs">The house is moving.</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-tertiary">{overviewCopy(data.network)} Audience totals combine public follows and subscriptions. They are not unique people.</p>
          </div>
          <RangeToggle value={range} onChange={setRange} aria-label="Metric period" options={[{ key: "7d", label: "7d" }, { key: "30d", label: "30d" }, { key: "90d", label: "90d" }, { key: "all", label: "All" }]} />
        </div>
        <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          <MetricCard icon={Users01} label="Channel follows" value={compact(data.network.followers)} unit="combined" delta={signed(data.network.followerGrowth)} trend={data.network.followerGrowth != null && data.network.followerGrowth < 0 ? "down" : "up"} />
          <MetricCard icon={PlayCircle} label="Published" value={exact(data.network.posts)} unit="posts" />
          <MetricCard icon={Users01} label="Active creators" value={exact(data.network.activeCreators)} unit="members" />
          <MetricCard icon={VideoRecorder} label="Streams" value={exact(data.network.streams)} unit="sessions" />
          <MetricCard icon={Clock} label="Airtime" value={airtime(data.network.airtimeMinutes)} />
          <MetricCard icon={Eye} label="Hours watched" value={compact(data.network.hoursWatched)} unit="hours" />
          <MetricCard icon={Signal01} label="Highest peak" value={exact(data.network.peakViewers || null)} />
          <MetricCard icon={MessageChatCircle} label="Channel chat" value={compact(data.network.chatMessages || null)} unit="messages" />
        </div>
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-tertiary">
          <span className={socialFreshness.tone}>Social activity: {socialFreshness.label}</span>
          <span className={audienceFreshness.tone}>Audience snapshots: {audienceFreshness.label}</span>
          <span className={streamFreshness.tone}>Stream observations: {streamFreshness.label}</span>
          <span>Window: {data.startsOn ? `${data.startsOn} to today` : "all stored history"}</span>
        </div>
      </section>

      <section aria-labelledby="core-channels-heading">
        <SectionHeading eyebrow="CORE channels" title="The official signals." copy="Every card shows the latest verified audience figure when available, plus the real publishing record behind it." />
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {data.core.channels.map((channel) => <ChannelCard key={`${channel.platform}:${channel.handle}`} channel={channel} now={dashboard.generatedAt} />)}
        </div>
      </section>

      <section aria-labelledby="member-metrics-heading">
        <SectionHeading eyebrow="Members" title="The receipts are on the board." copy="House order, real publishing output, real livestream records, and verified Twitch rolling data where it is available." />
        <div className="mt-6 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {data.members.map((summary) => <MemberCard key={summary.owner} summary={summary} member={memberBySlug.get(summary.owner) ?? null} now={dashboard.generatedAt} />)}
        </div>
      </section>

      <section className="rounded-2xl border border-secondary bg-primary p-5 sm:p-6" aria-labelledby="method-heading">
        <p className="text-sm font-semibold text-brand-secondary">How to read this page</p>
        <h2 id="method-heading" className="mt-1 text-lg font-semibold text-primary">Stored data, no background spend.</h2>
        <div className="mt-4 grid gap-4 text-sm leading-6 text-tertiary md:grid-cols-3">
          <p><strong className="text-secondary">Audience.</strong> Latest available follower or subscriber snapshots. Growth appears only when two stored snapshots exist in the selected period.</p>
          <p><strong className="text-secondary">Activity.</strong> Counts of stored posts, videos, Shorts, Reels, TikToks, photos, X posts, and live events. They are not engagement or reach estimates.</p>
          <p><strong className="text-secondary">Twitch.</strong> Sessions, audience, and chat come from CORE&apos;s observed Twitch records. “Channel chatters” is a sum by channel, not deduplicated people across channels.</p>
        </div>
      </section>
    </div>
  );
}

function SectionHeading({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return <header><p className="text-sm font-semibold text-brand-secondary">{eyebrow}</p><h2 className="mt-1 text-xl font-semibold tracking-tight text-primary md:text-display-xs">{title}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-tertiary">{copy}</p></header>;
}

function ChannelCard({ channel, now }: { channel: ChannelMetrics; now: string }) {
  const label = PLATFORM_LABEL[channel.platform];
  const hasAudience = channel.followers != null;
  const headlineValue = hasAudience ? compact(channel.followers) : exact(channel.postCount || null);
  const headlineUnit = hasAudience
    ? channel.platform === "youtube" ? "subs" : "followers"
    : channel.postCount === 1 ? "published" : "published";
  return <a href={channel.url} target="_blank" rel="noopener noreferrer" className="group rounded-2xl bg-primary p-5 ring-1 ring-inset ring-secondary transition hover:-translate-y-0.5 hover:shadow-lg">
    <div className="flex items-start justify-between gap-4"><span className="grid size-10 place-items-center rounded-xl bg-secondary" style={{ color: BRAND[channel.platform] }}><SocialIcon platform={channel.platform} size={18} /></span><span className="text-xs font-medium text-tertiary group-hover:text-primary">Open {label} ↗</span></div>
    <p className="mt-5 text-sm font-semibold text-primary">{channel.label}</p>
    <p className="mt-1 text-display-xs font-semibold tabular-nums text-primary">{headlineValue} <span className="text-sm font-medium text-tertiary">{headlineUnit}</span></p>
    <div className="mt-4 flex items-center justify-between gap-3 border-t border-secondary pt-3 text-xs text-tertiary"><span>{hasAudience ? `${channel.postCount.toLocaleString("en-US")} published` : "Stored activity"}</span><span className={channel.growth == null ? "text-quaternary" : channel.growth < 0 ? "text-error-primary" : "text-success-primary"}>{channel.growth == null ? hasAudience ? "No period change" : "Audience snapshot pending" : `${signed(channel.growth)} growth`}</span></div>
    <p className="mt-3 line-clamp-1 text-xs text-quaternary">{channel.lastActivity ? `${relativeDate(channel.lastActivity.publishedAt, now)} · ${channel.lastActivity.title}` : "No stored activity yet"}</p>
  </a>;
}

function MemberCard({ summary, member, now }: { summary: OwnerMetrics; member: Member | null; now: string }) {
  const rolling = summary.rollingTwitch;
  return <article className="overflow-hidden rounded-2xl bg-secondary ring-1 ring-inset ring-secondary"><header className="flex items-center gap-3 border-b border-secondary p-5"><span className="relative size-11 overflow-hidden rounded-full bg-primary ring-1 ring-inset ring-secondary">{member ? <Image src={member.portrait} alt="" fill sizes="44px" className="object-cover" /> : null}</span><span className="min-w-0 flex-1"><strong className="block truncate text-base text-primary">{member?.name ?? summary.owner}</strong><span className="text-xs text-tertiary">{statusLabel(summary.liveStatus)} · {summary.publishingDays} publishing day{summary.publishingDays === 1 ? "" : "s"}</span></span><span className={`size-2 rounded-full ${summary.liveStatus === "live" ? "bg-success-primary" : summary.liveStatus === "offline" ? "bg-tertiary" : "bg-warning-primary"}`} aria-hidden /></header>
    <div className="grid grid-cols-3 divide-x divide-secondary border-b border-secondary bg-primary"><Datum label="Channel follows" value={compact(summary.followers)} /><Datum label="Published" value={exact(summary.posts)} /><Datum label="Airtime" value={airtime(summary.airtimeMinutes)} /></div>
    <div className="p-5"><div className="flex flex-wrap gap-2">{summary.channels.map((channel) => <a key={`${channel.platform}:${channel.handle}`} href={channel.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-secondary ring-1 ring-inset ring-secondary"><span style={{ color: BRAND[channel.platform] }}><SocialIcon platform={channel.platform} size={12} /></span>{channel.label} <span className="text-quaternary">· {compact(channel.followers)}</span></a>)}</div>
      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-sm"><DataRow label="Audience growth" value={signed(summary.followerGrowth) ?? "—"} tone={summary.followerGrowth != null && summary.followerGrowth < 0 ? "text-error-primary" : "text-success-primary"} /><DataRow label="Last post" value={relativeDate(summary.lastActivity?.publishedAt ?? null, now)} /><DataRow label="Peak viewers" value={exact(summary.peakViewers || null)} /><DataRow label="Channel chatters" value={compact(summary.channelChatters || null)} /></dl>
      {summary.byType.length ? <p className="mt-5 border-t border-secondary pt-4 text-xs leading-5 text-tertiary">{summary.byType.map((item) => `${item.count} ${CONTENT_LABEL[item.contentType]}`).join(" · ")}</p> : <p className="mt-5 border-t border-secondary pt-4 text-xs text-quaternary">No stored publishing activity in this period.</p>}
      {summary.lastActivity ? <a href={summary.lastActivity.href} target="_blank" rel="noopener noreferrer" className="mt-3 block truncate text-xs font-medium text-brand-secondary hover:text-brand-secondary_hover">Latest: {summary.lastActivity.title} ↗</a> : null}
      {rolling ? <div className="mt-4 rounded-xl bg-primary p-3 text-xs text-tertiary"><span className="font-semibold text-[#9146FF]">Twitch · rolling 30d</span><span className="mx-2 text-quaternary">•</span>{compact(rolling.avgViewers)} avg viewers<span className="mx-2 text-quaternary">•</span>{compact(rolling.hoursWatched)} hours watched<span className="mx-2 text-quaternary">•</span>{signed(rolling.followersGained) ?? "—"} followers</div> : null}
    </div></article>;
}

function Datum({ label, value }: { label: string; value: string }) { return <div className="px-3 py-3"><dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-quaternary">{label}</dt><dd className="mt-1 text-sm font-semibold tabular-nums text-primary">{value}</dd></div>; }
function DataRow({ label, value, tone = "text-secondary" }: { label: string; value: string; tone?: string }) { return <div><dt className="text-xs text-tertiary">{label}</dt><dd className={`mt-0.5 font-semibold tabular-nums ${tone}`}>{value}</dd></div>; }
