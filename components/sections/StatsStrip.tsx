import { Users01, Signal01, Eye, Tv01 } from "@untitledui/icons";
import { getOrgStats, formatCount, platformLabel } from "@/lib/stats";
import { MetricCard } from "@/components/metrics/MetricCard";
import type { FC } from "react";

/**
 * Quiet, in-flow stats row. Renders between the hero and the LiveNow
 * section on the home page. The intent: never overpower, always credible.
 *
 * One-line treatment for desktop. On mobile, scrolls horizontally with
 * snap so the numbers feel like a ticker without demanding attention.
 *
 * Server component — `getOrgStats()` is server-only and tagged with the
 * `stats` cache key (1h revalidate set inside `lib/stats.ts`).
 */
export async function StatsStrip() {
  const org = await getOrgStats();
  const cells: Array<{ label: string; value: string; sub: string; icon: FC<{ className?: string }> }> = [
    {
      label: "Total subs",
      value: formatCount(org.totals.followersCumulative),
      sub: "across YouTube + Twitch",
      icon: Users01,
    },
    {
      label: "Live now",
      value: org.totals.membersLive.toString(),
      sub: `of ${org.members.length} members`,
      icon: Signal01,
    },
    {
      label: "Lifetime views",
      value: formatCount(org.totals.viewsCumulative),
      sub: "YouTube — refreshed hourly",
      icon: Eye,
    },
    {
      label: "Members",
      value: org.members.length.toString(),
      sub: "creators · 1 org",
      icon: Tv01,
    },
  ];

  return (
    <section
      aria-label="CORE at a glance"
      className="relative w-full bg-[color:var(--bg-elev)]/40 py-8 md:py-10 backdrop-blur-sm"
    >
      <div className="mx-auto max-w-container px-6 md:px-8">
        <div className="-mx-2 flex snap-x snap-mandatory gap-3 overflow-x-auto px-2 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0">
          {cells.map((c) => (
            <MetricCard
              key={c.label}
              icon={c.icon}
              label={c.label}
              value={c.value}
              delta={c.sub}
              trend="neutral"
              className="snap-start shrink-0 basis-[220px] md:basis-auto md:shrink"
            />
          ))}
        </div>

        {/* Per-platform mini-roll — single line, glassy, restrained */}
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs uppercase tracking-[0.16em] text-[color:var(--ink-faint)]">
          {(["youtube", "twitch", "tiktok", "instagram", "x"] as const).map((p) => {
            const total = org.members
              .flatMap((m) => m.platforms)
              .filter((s) => s.platform === p && s.followers != null)
              .reduce((acc, s) => acc + (s.followers ?? 0), 0);
            return (
              <li key={p}>
                <span className="text-[color:var(--ink-dim)]">{platformLabel(p)}</span>{" "}
                <span className="text-[color:var(--ink)]">{formatCount(total || null)}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
