import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, CalendarDays } from "lucide-react";
import { BarChartSquare02, Clock, Eye, Signal01, Users01 } from "@untitledui/icons";
import { MetricCard } from "@/components/metrics/MetricCard";
import { BrowserDateTime } from "@/components/ui/BrowserDateTime";
import type {
  TwitchTrackerChannelSnapshot,
  TwitchTrackerGameSnapshot,
} from "@/lib/twitchtracker-snapshots";

type TrackerMember = {
  slug: string;
  name: string;
  accent: string;
  portrait: string;
};

export function formatTrackerAirtime(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const remainder = total % 60;
  if (hours === 0) return `${remainder}m`;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

export function formatTrackerCount(value: number): string {
  const count = Math.max(0, Math.round(value));
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(count >= 10_000_000 ? 0 : 1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(count >= 100_000 ? 0 : 1)}K`;
  }
  return count.toLocaleString("en-US");
}

function formatSignedTrackerCount(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  return `${sign}${formatTrackerCount(Math.abs(rounded))}`;
}

function exact(value: number): string {
  return Math.max(0, Math.round(value)).toLocaleString("en-US");
}

function snapshotDate(value: string): string {
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function combinedSummary(latest: TwitchTrackerChannelSnapshot[]) {
  const airtime = latest.reduce((sum, row) => sum + row.minutesStreamed, 0);
  const hoursWatched = latest.reduce((sum, row) => sum + row.hoursWatched, 0);
  return {
    airtime,
    hoursWatched,
    weightedAverage: airtime > 0 ? Math.round((hoursWatched * 60) / airtime) : 0,
    highestCreatorPeak: latest.reduce((peak, row) => Math.max(peak, row.maxViewers), 0),
    followersGained: latest.reduce((sum, row) => sum + row.followersGained, 0),
  };
}

export function TwitchTrackerAnalyticsSection({
  latest,
  history,
  games,
  members,
}: {
  latest: TwitchTrackerChannelSnapshot[];
  history: TwitchTrackerChannelSnapshot[];
  games: TwitchTrackerGameSnapshot[];
  members: TrackerMember[];
}) {
  const memberBySlug = new Map(members.map((member) => [member.slug, member]));
  const rows = [...latest].sort((left, right) => {
    const leftRank = left.rank ?? Number.MAX_SAFE_INTEGER;
    const rightRank = right.rank ?? Number.MAX_SAFE_INTEGER;
    return leftRank - rightRank;
  });
  const combined = combinedSummary(rows);
  const capturedDates = new Set(history.map((row) => row.snapshotDate));
  const freshest = rows.reduce<string | null>(
    (current, row) => !current || row.fetchedAt > current ? row.fetchedAt : current,
    null,
  );

  return (
    <section id="twitchtracker-analytics" className="flex flex-col gap-8" aria-labelledby="twitchtracker-title">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[#9146FF]">
            TwitchTracker · rolling 30 days
          </p>
          <h2 id="twitchtracker-title" className="mt-1 text-xl font-semibold tracking-tight text-primary md:text-display-xs">
            Complete Twitch performance by member.
          </h2>
          <p className="mt-2 max-w-[72ch] text-sm leading-relaxed text-tertiary">
            Airtime, audience, watchtime, follower growth, and Twitch rank use TwitchTracker&apos;s
            rolling channel summary. Dated stream activity remains in the observed history below.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-quaternary">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-secondary px-3 py-1.5">
            <CalendarDays size={13} aria-hidden />
            {capturedDates.size} stored snapshot{capturedDates.size === 1 ? "" : "s"}
          </span>
          {freshest ? (
            <span>
              Refreshed{" "}
              <BrowserDateTime
                value={freshest}
                fallback="—"
                options={{ month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }}
              />
            </span>
          ) : null}
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-secondary bg-secondary/40 p-6">
          <p className="text-sm font-semibold text-primary">Awaiting the first TwitchTracker snapshot</p>
          <p className="mt-1 text-sm text-tertiary">
            The rolling 30-day report will appear here after the analytics collector completes.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <MetricCard icon={Clock} label="Airtime · all members" value={formatTrackerAirtime(combined.airtime)} />
            <MetricCard icon={Users01} label="Weighted average viewers" value={exact(combined.weightedAverage)} />
            <MetricCard icon={Eye} label="Hours watched · all members" value={formatTrackerCount(combined.hoursWatched)} />
            <MetricCard icon={Signal01} label="Highest individual peak" value={exact(combined.highestCreatorPeak)} />
            <MetricCard icon={BarChartSquare02} label="Followers gained · 30d" value={formatSignedTrackerCount(combined.followersGained)} />
          </div>

          <div className="overflow-x-auto rounded-2xl border border-secondary bg-primary shadow-xs">
            <table className="min-w-[1080px] w-full border-collapse text-left">
              <thead className="border-b border-secondary bg-secondary/45 text-xs font-medium uppercase tracking-[0.12em] text-quaternary">
                <tr>
                  <th className="px-4 py-3">Member</th>
                  <th className="px-3 py-3 text-right">Rank</th>
                  <th className="px-3 py-3 text-right">Airtime</th>
                  <th className="px-3 py-3 text-right">Avg viewers</th>
                  <th className="px-3 py-3 text-right">Peak viewers</th>
                  <th className="px-3 py-3 text-right">Hours watched</th>
                  <th className="px-3 py-3 text-right">Followers gained</th>
                  <th className="px-4 py-3 text-right">Followers total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-secondary">
                {rows.map((row) => {
                  const member = memberBySlug.get(row.memberSlug);
                  return (
                    <tr key={`${row.memberSlug}:${row.snapshotDate}`} className="transition-colors hover:bg-secondary/35">
                      <th className="px-4 py-3 font-normal">
                        <Link href={`/about/${row.memberSlug}/numbers` as never} className="group inline-flex items-center gap-3">
                          <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-secondary ring-1 ring-inset ring-secondary">
                            {member ? (
                              <Image src={member.portrait} alt="" fill sizes="40px" className="object-cover" />
                            ) : null}
                          </span>
                          <span>
                            <strong className="block text-sm font-semibold text-primary group-hover:underline">
                              {member?.name ?? row.memberSlug}
                            </strong>
                            <span className="text-xs text-quaternary">@{row.twitchLogin}</span>
                          </span>
                        </Link>
                      </th>
                      <td className="px-3 py-3 text-right text-sm font-semibold tabular-nums text-primary">{row.rank ? `#${exact(row.rank)}` : "—"}</td>
                      <td className="px-3 py-3 text-right text-sm tabular-nums text-secondary">{formatTrackerAirtime(row.minutesStreamed)}</td>
                      <td className="px-3 py-3 text-right text-sm tabular-nums text-secondary">{exact(row.avgViewers)}</td>
                      <td className="px-3 py-3 text-right text-sm tabular-nums text-secondary">{exact(row.maxViewers)}</td>
                      <td className="px-3 py-3 text-right text-sm tabular-nums text-secondary">{exact(row.hoursWatched)}</td>
                      <td className="px-3 py-3 text-right text-sm font-semibold tabular-nums text-success-primary">{formatSignedTrackerCount(row.followersGained)}</td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums text-secondary">{exact(row.followersTotal)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <TwitchCategoryBenchmarks games={games} />
    </section>
  );
}

export function MemberTwitchTrackerAnalytics({
  summary,
  memberName,
  accent,
}: {
  summary: TwitchTrackerChannelSnapshot | null;
  memberName: string;
  accent: string;
}) {
  return (
    <section id="twitch-analytics" className="border-b border-[color:var(--rule)] px-6 py-14 md:px-8">
      <div className="mx-auto max-w-container">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold" style={{ color: accent }}>
              TwitchTracker · rolling 30 days
            </p>
            <h2 className="mt-1 font-display text-display-sm font-semibold tracking-tight text-primary md:text-display-md">
              {memberName}&apos;s Twitch performance.
            </h2>
          </div>
          {summary ? (
            <a
              href={`https://twitchtracker.com/${encodeURIComponent(summary.twitchLogin)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-tertiary hover:text-primary"
            >
              Open TwitchTracker <ArrowUpRight size={14} aria-hidden />
            </a>
          ) : null}
        </header>

        {summary ? (
          <>
            <div className="mt-7 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
              <MetricCard icon={BarChartSquare02} label="Twitch rank" value={summary.rank ? `#${exact(summary.rank)}` : "—"} accent={accent} />
              <MetricCard icon={Clock} label="Airtime" value={formatTrackerAirtime(summary.minutesStreamed)} accent={accent} />
              <MetricCard icon={Users01} label="Average viewers" value={exact(summary.avgViewers)} accent={accent} />
              <MetricCard icon={Signal01} label="Peak viewers" value={exact(summary.maxViewers)} accent={accent} />
              <MetricCard icon={Eye} label="Hours watched" value={formatTrackerCount(summary.hoursWatched)} accent={accent} />
              <MetricCard label="Followers gained" value={formatSignedTrackerCount(summary.followersGained)} unit="30d" accent={accent} />
              <MetricCard label="Followers total" value={formatTrackerCount(summary.followersTotal)} accent={accent} />
            </div>
            <p className="mt-4 text-xs text-quaternary">
              Snapshot {snapshotDate(summary.snapshotDate)} · refreshed{" "}
              <BrowserDateTime
                value={summary.fetchedAt}
                fallback="—"
                options={{ month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }}
              />.
              These totals cover a rolling {summary.windowDays}-day window.
            </p>
          </>
        ) : (
          <div className="mt-7 rounded-2xl border border-dashed border-secondary bg-secondary/40 p-6">
            <p className="text-sm font-semibold text-primary">Analytics snapshot not available yet</p>
            <p className="mt-1 text-sm text-tertiary">This section will fill after the next TwitchTracker collector run.</p>
          </div>
        )}
      </div>
    </section>
  );
}

export function MemberTwitchTrackerStrip({
  summary,
  memberName,
  memberSlug,
  accent,
}: {
  summary: TwitchTrackerChannelSnapshot | null;
  memberName: string;
  memberSlug: string;
  accent: string;
}) {
  return (
    <aside className="mt-6 overflow-hidden rounded-xl border border-secondary bg-primary/75 shadow-xs" aria-label={`${memberName} Twitch analytics`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-secondary px-4 py-3">
        <div>
          <p className="text-xs font-semibold" style={{ color: accent }}>TwitchTracker · rolling 30 days</p>
          <p className="mt-0.5 text-xs text-quaternary">Verified Twitch performance</p>
        </div>
        <Link href={`/about/${memberSlug}/numbers#twitch-analytics` as never} className="inline-flex items-center gap-1 text-xs font-semibold text-secondary hover:text-primary">
          Full analytics <ArrowUpRight size={12} aria-hidden />
        </Link>
      </div>
      {summary ? (
        <dl className="grid grid-cols-2 gap-px bg-secondary sm:grid-cols-4">
          <CompactDatum label="Airtime" value={formatTrackerAirtime(summary.minutesStreamed)} />
          <CompactDatum label="Average" value={formatTrackerCount(summary.avgViewers)} />
          <CompactDatum label="Watchtime" value={`${formatTrackerCount(summary.hoursWatched)}h`} />
          <CompactDatum label="Followers gained" value={formatSignedTrackerCount(summary.followersGained)} />
        </dl>
      ) : (
        <p className="px-4 py-3 text-xs text-tertiary">30-day analytics will appear after the first stored snapshot.</p>
      )}
    </aside>
  );
}

function CompactDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-primary px-4 py-3">
      <dt className="text-[10px] font-medium uppercase tracking-[0.12em] text-quaternary">{label}</dt>
      <dd className="mt-1 text-sm font-semibold tabular-nums text-primary">{value}</dd>
    </div>
  );
}

function TwitchCategoryBenchmarks({ games }: { games: TwitchTrackerGameSnapshot[] }) {
  if (games.length === 0) return null;
  const rows = [...games].sort((left, right) => {
    const leftRank = left.rank ?? Number.MAX_SAFE_INTEGER;
    const rightRank = right.rank ?? Number.MAX_SAFE_INTEGER;
    return leftRank - rightRank;
  });
  return (
    <section className="rounded-2xl border border-secondary bg-primary p-4 shadow-xs md:p-6" aria-labelledby="twitch-category-title">
      <header>
        <p className="text-sm font-semibold text-[#9146FF]">Twitch-wide category benchmarks</p>
        <h3 id="twitch-category-title" className="mt-1 text-lg font-semibold tracking-tight text-primary">
          The categories around the community.
        </h3>
        <p className="mt-1 max-w-[72ch] text-sm text-tertiary">
          Category rank, audience, and watchtime describe each category across all of Twitch—not any one member&apos;s performance.
        </p>
      </header>
      <div className="mt-5 overflow-x-auto">
        <table className="min-w-[720px] w-full text-left">
          <thead className="text-xs font-medium uppercase tracking-[0.12em] text-quaternary">
            <tr className="border-b border-secondary">
              <th className="py-2 pr-4">Category</th>
              <th className="px-3 py-2 text-right">Rank</th>
              <th className="px-3 py-2 text-right">Avg viewers</th>
              <th className="px-3 py-2 text-right">Avg channels</th>
              <th className="py-2 pl-3 text-right">Hours watched</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-secondary">
            {rows.map((game) => (
              <tr key={`${game.lookupKey}:${game.snapshotDate}`}>
                <th className="py-3 pr-4 text-sm font-semibold text-primary">{game.gameName || game.lookupKey}</th>
                <td className="px-3 py-3 text-right text-sm tabular-nums text-secondary">{game.rank ? `#${exact(game.rank)}` : "—"}</td>
                <td className="px-3 py-3 text-right text-sm tabular-nums text-secondary">{exact(game.avgViewers)}</td>
                <td className="px-3 py-3 text-right text-sm tabular-nums text-secondary">{exact(game.avgChannels)}</td>
                <td className="py-3 pl-3 text-right text-sm tabular-nums text-secondary">{exact(game.hoursWatched)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
