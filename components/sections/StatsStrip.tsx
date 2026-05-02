import { getOrgStats, formatCount, platformLabel } from "@/lib/stats";

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
  const cells: Array<{ label: string; value: string; sub: string }> = [
    {
      label: "Total subs",
      value: formatCount(org.totals.followersCumulative),
      sub: "across YouTube + Twitch",
    },
    {
      label: "Live now",
      value: org.totals.membersLive.toString(),
      sub: `of ${org.members.length} members`,
    },
    {
      label: "Lifetime views",
      value: formatCount(org.totals.viewsCumulative),
      sub: "YouTube — refreshed hourly",
    },
    {
      label: "Members",
      value: org.members.length.toString(),
      sub: "creators · 1 org",
    },
  ];

  return (
    <section
      aria-label="The Core Boys at a glance"
      className="relative w-full bg-[color:var(--bg-elev)]/40 py-8 md:py-10 backdrop-blur-sm"
    >
      <div className="mx-auto max-w-[1280px] px-6 md:px-16">
        <div className="-mx-2 flex snap-x snap-mandatory gap-px overflow-x-auto md:mx-0 md:grid md:grid-cols-4 md:gap-px md:overflow-visible md:rounded-[10px] md:border md:border-[color:var(--rule)] md:bg-[color:var(--rule)]">
          {cells.map((c) => (
            <div
              key={c.label}
              className="snap-start shrink-0 basis-[220px] bg-[color:var(--bg-elev)] px-4 py-4 md:basis-auto md:shrink"
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-faint)]">
                {c.label}
              </p>
              <p className="mt-1.5 font-display text-[28px] font-black leading-none tracking-[-0.03em] text-[color:var(--ink)] md:text-[36px]">
                {c.value}
              </p>
              <p className="mt-1 text-[11px] text-[color:var(--ink-dim)]">{c.sub}</p>
            </div>
          ))}
        </div>

        {/* Per-platform mini-roll — single line, glassy, restrained */}
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--ink-faint)]">
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
