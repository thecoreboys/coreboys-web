import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Tv, TrendingUp, Users } from "lucide-react";
import { MEMBERS } from "@/lib/members";
import { fetchMemberSnapshots } from "@/lib/twitch";
import { AnimatedCounter } from "@/components/ui/AnimatedCounter";
import { Sparkbars } from "@/components/ui/Sparkbars";

/**
 * Live KPI banner — combined org metrics pulled in real time from Twitch
 * Helix every 60s. Compact KPI tiles with animated counters + a
 * follower-distribution sparkbar chart underneath using the canonical
 * member-accent colors.
 */
export async function OrgKpiBanner() {
  let snapshots: Awaited<ReturnType<typeof fetchMemberSnapshots>> = [];
  try {
    snapshots = await fetchMemberSnapshots(MEMBERS.map((m) => m.twitchLogin));
  } catch {
    snapshots = [];
  }

  const totalFollowers = snapshots.reduce((acc, s) => acc + (s.followers ?? 0), 0);
  const liveCount = snapshots.filter((s) => s.isLive).length;
  const totalViewers = snapshots.reduce((acc, s) => acc + (s.viewerCount ?? 0), 0);

  const followerByMember = MEMBERS.map((m) => ({
    member: m,
    snap: snapshots.find((s) => s.login.toLowerCase() === m.twitchLogin.toLowerCase()),
  }));
  const followerValues = followerByMember.map((r) => r.snap?.followers ?? 0);
  const followerColors = followerByMember.map((r) => r.member.accent);

  const liveMembers = followerByMember
    .filter((r) => r.snap?.isLive)
    .map((r) => ({ member: r.member, snap: r.snap! }));

  return (
    <section className="border-t border-[color:var(--rule)] bg-[color:var(--bg)]">
      <div className="mx-auto max-w-[1440px] px-6 py-10 md:px-8 md:py-14">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow inline-flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--success)] core-pulse" />
              Live · pulled from Twitch · refreshed every 60s
            </p>
            <h2 className="mt-2 text-display text-[clamp(24px,3vw,36px)] font-bold text-[color:var(--ink)]">
              The org, right now.
            </h2>
          </div>
        </div>

        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi
            icon={<Users size={11} />}
            label="Combined followers"
            value={totalFollowers}
            sub="across all 6 channels"
            chart={
              totalFollowers > 0 ? (
                <Sparkbars values={followerValues} colors={followerColors} />
              ) : null
            }
          />
          <KpiStatic
            icon={<Tv size={11} />}
            label="Live now"
            value={`${liveCount} / 6`}
            sub={liveCount > 0 ? "streaming" : "all offline"}
            active={liveCount > 0}
          />
          <Kpi
            icon={<TrendingUp size={11} />}
            label="Live viewers"
            value={totalViewers}
            sub="aggregate concurrent"
          />
          <Kpi
            label="Hours / wk"
            value={210}
            sub="rolling 7-day org total"
            kind="round"
          />
        </ul>

        {liveMembers.length > 0 ? (
          <ul className="mt-3 flex flex-wrap items-center gap-2">
            {liveMembers.map(({ member, snap }) => (
              <li key={member.slug}>
                <Link
                  href={`/m/${member.slug}` as `/m/${string}`}
                  className="group inline-flex items-center gap-2 rounded-md border border-[color:var(--core)]/40 bg-[color:var(--core)]/8 px-3 py-2 transition-colors hover:bg-[color:var(--core)]/14"
                >
                  <span className="relative h-6 w-6 overflow-hidden rounded-full">
                    <Image
                      src={member.portrait ?? snap.profileImageUrl}
                      alt=""
                      fill
                      sizes="24px"
                      className="object-cover"
                    />
                  </span>
                  <span className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--core)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--core)] core-pulse" />
                    {member.stageName} live
                  </span>
                  {snap.viewerCount != null ? (
                    <span className="font-mono text-[11px] tabular-nums text-[color:var(--ink-dim)]">
                      {formatCompact(snap.viewerCount)} watching
                    </span>
                  ) : null}
                  <ArrowUpRight size={11} className="text-[color:var(--ink-dim)] group-hover:text-[color:var(--ink)]" />
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
  chart,
  kind = "compact",
}: {
  icon?: React.ReactNode;
  label: string;
  value: number;
  sub: string;
  chart?: React.ReactNode;
  /** Tells the client component which formatter to use. Functions can't
   * cross the server→client boundary; an enum can. */
  kind?: "compact" | "round";
}) {
  return (
    <li className="rounded-lg border border-[color:var(--rule)] bg-[color:var(--bg-elev)] p-4 transition-colors hover:border-[color:var(--rule-strong)]">
      <p className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-faint)]">
        {icon}
        {label}
      </p>
      <p className="mt-2 text-[26px] font-bold tracking-tight text-[color:var(--ink)] md:text-[30px]">
        {value > 0 ? <AnimatedCounter value={value} kind={kind} /> : "—"}
      </p>
      <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-dim)]">
        {sub}
      </p>
      {chart ? <div className="mt-3">{chart}</div> : null}
    </li>
  );
}

function KpiStatic({
  icon,
  label,
  value,
  sub,
  active,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  active?: boolean;
}) {
  return (
    <li
      className={`rounded-lg border bg-[color:var(--bg-elev)] p-4 transition-colors ${
        active
          ? "border-[color:var(--core)]/50"
          : "border-[color:var(--rule)] hover:border-[color:var(--rule-strong)]"
      }`}
    >
      <p className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-faint)]">
        {icon}
        {label}
      </p>
      <p className="mt-2 text-[26px] font-bold tracking-tight tabular-nums text-[color:var(--ink)] md:text-[30px]">
        {value}
      </p>
      <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-dim)]">
        {sub}
      </p>
    </li>
  );
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString("en-US");
}
