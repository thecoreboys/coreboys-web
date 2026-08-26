import { getOrgFollowerTotals } from "@/lib/metric-snapshots";

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return Math.round(n).toLocaleString("en-US");
}

export async function QuietReach() {
  const totals = await getOrgFollowerTotals();
  if (!totals.hasData) return null;

  return (
    <section id="reach" className="relative w-full bg-[color:var(--bg)] py-20 md:py-28 rule">
      <div className="mx-auto flex max-w-container flex-col items-start justify-between gap-6 px-6 md:flex-row md:items-end md:px-16">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-[color:var(--ink-dim)]">
          Across the house
        </p>
        <p className="font-display text-[72px] font-black leading-none tracking-[-0.04em] text-[color:var(--ink)] tabular-nums md:text-[120px]">
          {compact(totals.total)}
        </p>
      </div>
    </section>
  );
}
