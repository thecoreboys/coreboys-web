import { Fragment } from "react";
import { BarChart04 } from "@untitledui/icons";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";
import { AnimatedCounter } from "@/components/ui/AnimatedCounter";
import { getOrgStats } from "@/lib/stats";
import { getOrgFollowerTotals } from "@/lib/metric-snapshots";
import { MEMBERS } from "@/lib/members";

/**
 * UUI metrics section (built on `metrics-simple-centered-text-brand`):
 * FeaturedIcon + eyebrow + display heading + supporting text, then a row
 * of large stat figures with hairline dividers.
 *
 * Data sourcing:
 *   • Followers across every platform → the `metric_snapshots` table
 *     (populated by the snapshot cron with API → scrape fallback). This
 *     keeps the number alive even when the live social APIs are out of
 *     credits — which the live `getOrgStats()` path is NOT resilient to
 *     (it needs YOUTUBE_API_KEY and renders 0 without it).
 *   • Lifetime views → YouTube Data API via `getOrgStats()`; only shown
 *     when a real (>0) number is available, otherwise the cell is
 *     dropped so we never display a misleading "0" / "—".
 *
 * Elevated with the UUI pattern layer — a line-grid background texture +
 * subtle grain — to read unmistakably as Untitled UI while keeping the
 * signal-red brand block.
 */
export async function CommunityMetrics() {
  const [followerTotals, org] = await Promise.all([
    getOrgFollowerTotals(),
    getOrgStats().catch(() => null),
  ]);

  const memberCount = MEMBERS.length;
  const viewsCumulative = org?.totals.viewsCumulative ?? 0;

  // `kind` (a serializable string) is passed to the client <AnimatedCounter>
  // — a format FUNCTION can't cross the server→client boundary (RSC).
  const stats: Array<{ value: number; subtitle: string; kind: "compact" | "comma" }> = [];

  // Followers — only render when we actually have snapshot data, so an
  // empty table degrades to hiding the cell rather than showing "—".
  if (followerTotals.hasData) {
    stats.push({
      value: followerTotals.total,
      subtitle: "Followers across every platform",
      kind: "compact",
    });
  }

  // Lifetime views — needs the YouTube Data API key; drop the cell when
  // unavailable instead of rendering a broken zero.
  if (viewsCumulative > 0) {
    stats.push({
      value: viewsCumulative,
      subtitle: "Lifetime views and counting",
      kind: "compact",
    });
  }

  stats.push({
    value: memberCount,
    subtitle: "Creators · one house",
    kind: "comma",
  });

  return (
    <section
      className="relative isolate overflow-hidden py-16 md:py-24"
      style={{ background: "var(--ironbow-band)" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-1/3 left-1/2 size-[640px] -translate-x-1/2 rounded-full opacity-40 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(219,3,104,0.4), transparent 65%)" }}
      />

      <div className="relative mx-auto max-w-container px-6 md:px-8">
        <div className="flex flex-col gap-12 md:gap-16">
          <div className="flex w-full flex-col items-center self-center text-center md:max-w-3xl md:self-center">
            <FeaturedIcon color="brand" theme="dark" size="xl" icon={BarChart04} />
            <p className="mt-5 text-sm font-semibold text-tertiary_on-brand">By the numbers</p>
            <h2 className="mt-2 text-display-sm font-semibold tracking-tight text-primary_on-brand md:text-display-md">
              One house, <span className="gradient-text">every platform.</span>
            </h2>
            <p className="mt-4 text-lg text-secondary_on-brand md:mt-5">
              Real reach across YouTube, Twitch, TikTok, Instagram and X. And it climbs every
              single day.
            </p>
          </div>
          <dl className="flex w-full flex-col justify-center gap-8 md:max-w-3xl md:flex-row md:gap-4 md:self-center">
            {stats.map((item, index) => (
              <Fragment key={item.subtitle}>
                {index !== 0 && <div className="hidden border-l border-brand_alt md:block" />}
                <div className="flex flex-1 flex-col-reverse gap-3 text-center">
                  <dt className="text-lg font-semibold text-tertiary_on-brand">{item.subtitle}</dt>
                  <dd className="text-display-lg font-semibold tabular-nums tracking-tight text-primary_on-brand md:text-display-xl">
                    <AnimatedCounter value={item.value} kind={item.kind} duration={1.8} />
                  </dd>
                </div>
              </Fragment>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
