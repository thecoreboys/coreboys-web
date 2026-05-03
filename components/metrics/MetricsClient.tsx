"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { HeatmapYear, type HeatmapDay } from "@/components/metrics/HeatmapYear";
import { TrendLine, type TrendPoint } from "@/components/metrics/TrendLine";
import { SocialIcon } from "@/components/ui/SocialIcon";
import { GROUP } from "@/lib/group";

export type MetricsRow = {
  slug: string;
  platform: string;
  count: number;
  date: string;
};

export type MetricsClientProps = {
  rows: MetricsRow[];
  members: Array<{ slug: string; name: string; accent: string; portrait: string; twitchLogin: string }>;
};

type Range = "1d" | "7d" | "31d" | "all";

const PLATFORM_LABEL: Record<string, string> = {
  twitch: "Twitch",
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  x: "X",
};

const PLATFORM_COLOR: Record<string, string> = {
  twitch: "#9146FF",
  youtube: "#FF0033",
  tiktok: "#FE2C55",
  instagram: "#E1306C",
  x: "#a1a1aa",
};

export function MetricsClient({ rows, members }: MetricsClientProps) {
  const [range, setRange] = useState<Range>("31d");
  const [scope, setScope] = useState<"group" | "twitch-combined">("group");
  const [activePlatform, setActivePlatform] = useState<string>("twitch");

  // Filter rows by range on the client. The /api/metrics endpoint can
  // also enforce range, but we always query "all" here so the toggle is
  // instant — no extra round-trip per click.
  const cutoff = useMemo(() => {
    if (range === "all") return null;
    const now = new Date();
    const days = range === "1d" ? 1 : range === "7d" ? 7 : 31;
    const c = new Date(now);
    c.setDate(c.getDate() - days);
    return c.toISOString().slice(0, 10);
  }, [range]);

  const ranged = useMemo(
    () => (cutoff ? rows.filter((r) => r.date >= cutoff) : rows),
    [rows, cutoff],
  );

  // ── Latest value per (slug, platform) ────────────────────────────────
  const latest = useMemo(() => {
    const map = new Map<string, MetricsRow>();
    for (const r of ranged) {
      const key = `${r.slug}::${r.platform}`;
      const existing = map.get(key);
      if (!existing || r.date > existing.date) map.set(key, r);
    }
    return map;
  }, [ranged]);

  const groupKpi = (platform: string) =>
    latest.get(`__group__::${platform}`)?.count ?? null;

  const twitchCombined = useMemo(() => {
    let sum = 0;
    for (const m of members) {
      const v = latest.get(`${m.slug}::twitch`);
      if (v) sum += v.count;
    }
    return sum;
  }, [latest, members]);

  // ── Trend series for the selected scope + platform ───────────────────
  const trend: TrendPoint[] = useMemo(() => {
    const buckets = new Map<string, number>();
    for (const r of ranged) {
      if (r.platform !== activePlatform) continue;
      if (scope === "group") {
        if (r.slug !== "__group__") continue;
        buckets.set(r.date, r.count);
      } else {
        // twitch-combined: sum across members per day, ignore __group__
        if (r.slug === "__group__") continue;
        if (activePlatform !== "twitch") continue;
        buckets.set(r.date, (buckets.get(r.date) ?? 0) + r.count);
      }
    }
    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => ({ date, value }));
  }, [ranged, activePlatform, scope]);

  // ── Heatmap source: per-day delta vs prior day for the active series ─
  const heatmap: Map<string, HeatmapDay> = useMemo(() => {
    const map = new Map<string, HeatmapDay>();
    let prev: number | null = null;
    for (const p of trend) {
      const delta = prev == null ? 0 : p.value - prev;
      map.set(p.date, { date: p.date, value: p.value, delta });
      prev = p.value;
    }
    return map;
  }, [trend]);

  const accent = PLATFORM_COLOR[activePlatform] ?? "#ef4444";

  return (
    <div className="flex flex-col gap-8">
      {/* Range toggle */}
      <div className="flex flex-wrap items-center gap-2">
        {(["1d", "7d", "31d", "all"] as Range[]).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            aria-pressed={range === r}
            className={`inline-flex cursor-pointer items-center rounded-md border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] transition-colors ${
              range === r
                ? "border-[color:var(--core)] bg-[color:var(--core)]/12 text-[color:var(--core)]"
                : "border-[color:var(--rule)] bg-[color:var(--bg-elev)] text-[color:var(--ink-dim)] hover:border-[color:var(--rule-strong)] hover:text-[color:var(--ink)]"
            }`}
          >
            {r === "all" ? "All time" : r === "1d" ? "1 day" : r === "7d" ? "7 days" : "31 days"}
          </button>
        ))}
        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-faint)]">
          {ranged.length} samples
        </span>
      </div>

      {/* KPI grid — group-level (each linkable to its social) + Twitch combined */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <KpiCard
          label="Twitch combined"
          value={twitchCombined}
          unit="followers"
          accent={PLATFORM_COLOR.twitch!}
          platform="twitch"
        />
        <KpiCard
          label={GROUP.socials.youtube.handle}
          value={groupKpi("youtube")}
          unit="subs"
          accent={PLATFORM_COLOR.youtube!}
          platform="youtube"
          href={GROUP.socials.youtube.url}
        />
        <KpiCard
          label={GROUP.socials.tiktok.handle}
          value={groupKpi("tiktok")}
          unit="followers"
          accent={PLATFORM_COLOR.tiktok!}
          platform="tiktok"
          href={GROUP.socials.tiktok.url}
        />
        <KpiCard
          label={GROUP.socials.instagram.handle}
          value={groupKpi("instagram")}
          unit="followers"
          accent={PLATFORM_COLOR.instagram!}
          platform="instagram"
          href={GROUP.socials.instagram.url}
        />
        <KpiCard
          label={GROUP.socials.x.handle}
          value={groupKpi("x")}
          unit="followers"
          accent={PLATFORM_COLOR.x!}
          platform="x"
          href={GROUP.socials.x.url}
        />
      </section>

      {/* Chat-tracking stubs — Watch time and Concurrent peak are
          already covered downstream by Hours watched / Peak viewers in
          the stream-stats section, so they're not duplicated here. */}
      <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <StubCard label="Chat messages" />
        <StubCard label="Unique chatters" />
      </section>

      {/* Trend chart selector + chart */}
      <section className="rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)] p-4 md:p-6">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--ink-faint)]">
              Trend
            </p>
            <h2 className="mt-1 text-[18px] font-bold tracking-tight text-[color:var(--ink)] md:text-[22px]">
              {scope === "group"
                ? `Group ${PLATFORM_LABEL[activePlatform] ?? activePlatform}`
                : "Combined member Twitch followers"}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ScopeToggle value={scope} onChange={setScope} />
          </div>
        </header>

        {/* Per-platform tabs (only show when scope=group) */}
        {scope === "group" ? (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {(["twitch", "youtube", "tiktok", "instagram", "x"] as const).map((p) => (
              <button
                key={p}
                type="button"
                disabled={p === "twitch"}
                onClick={() => setActivePlatform(p)}
                aria-pressed={activePlatform === p}
                title={p === "twitch" ? "Group has no public Twitch account" : undefined}
                className={`inline-flex items-center rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  p === "twitch"
                    ? "cursor-not-allowed border-[color:var(--rule)] bg-transparent text-[color:var(--ink-faint)] opacity-50"
                    : activePlatform === p
                      ? "cursor-pointer border-[color:var(--ink)]/40 bg-[color:var(--surface)] text-[color:var(--ink)]"
                      : "cursor-pointer border-[color:var(--rule)] bg-transparent text-[color:var(--ink-dim)] hover:bg-[color:var(--bg-elev)] hover:text-[color:var(--ink)]"
                }`}
              >
                {PLATFORM_LABEL[p]}
              </button>
            ))}
          </div>
        ) : null}

        <TrendLine data={trend} accent={accent} unit={activePlatform === "youtube" ? "subs" : "followers"} />
      </section>

      {/* GitHub-style heatmap of daily deltas */}
      <section className="rounded-xl border border-[color:var(--rule)] bg-[color:var(--bg-elev)] p-4 md:p-6">
        <header className="mb-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--ink-faint)]">
            Daily growth · last year
          </p>
          <h2 className="mt-1 text-[18px] font-bold tracking-tight text-[color:var(--ink)] md:text-[22px]">
            One square per day. Brighter = bigger gain.
          </h2>
          <p className="mt-1 max-w-[60ch] text-[13px] text-[color:var(--ink-dim)]">
            Visualises the day-over-day delta for the trend you&apos;ve selected
            above. Empty squares = no snapshot recorded that day.
          </p>
        </header>
        <HeatmapYear byDate={heatmap} accent={accent} colorBy="delta" year={2026} />
      </section>
    </div>
  );
}

function KpiCard({
  label,
  value,
  unit,
  accent,
  platform,
  href,
}: {
  label: string;
  value: number | null;
  unit: string;
  accent: string;
  platform: "twitch" | "youtube" | "tiktok" | "instagram" | "x";
  href?: string;
}) {
  const inner = (
    <>
      <span
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
        style={{ background: `${accent}18`, color: accent }}
      >
        <SocialIcon platform={platform} size={13} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: accent }}>
          {label}
        </span>
        <span className="mt-1.5 text-[24px] font-bold tabular-nums leading-none text-[color:var(--ink)] md:text-[28px]">
          {value == null ? "—" : value.toLocaleString("en-US")}
        </span>
        <span className="mt-1 text-[11px] text-[color:var(--ink-dim)]">{unit}</span>
      </span>
      {href ? (
        <ArrowUpRight
          size={14}
          className="shrink-0 self-start text-[color:var(--ink-faint)] transition-colors group-hover:text-[color:var(--ink)]"
        />
      ) : null}
    </>
  );
  const className =
    "group relative flex items-start gap-3 overflow-hidden rounded-lg border border-[color:var(--rule)] bg-[color:var(--bg-elev)] p-4 transition-all";
  const style = { boxShadow: `inset 0 0 0 1px ${accent}1f` } as React.CSSProperties;
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`${className} hover:-translate-y-px`}
        style={style}
      >
        {inner}
      </a>
    );
  }
  return (
    <div className={className} style={style}>
      {inner}
    </div>
  );
}

function StubCard({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-[color:var(--rule-strong)] bg-[color:var(--bg-elev)]/50 p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--ink-faint)]">
        {label}
      </p>
      <p className="text-[13px] leading-relaxed text-[color:var(--ink-dim)]">
        Coming once the Twitch IRC worker ships. Joins each member&apos;s chat
        and counts messages + unique chatters per hour.
      </p>
    </div>
  );
}

function ScopeToggle({
  value,
  onChange,
}: {
  value: "group" | "twitch-combined";
  onChange: (v: "group" | "twitch-combined") => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-[color:var(--rule)] bg-[color:var(--bg-elev)] p-0.5">
      {(["group", "twitch-combined"] as const).map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          aria-pressed={value === opt}
          className={`inline-flex cursor-pointer items-center rounded-sm px-3 py-1 text-[11px] font-semibold tracking-tight transition-colors ${
            value === opt
              ? "bg-[color:var(--surface)] text-[color:var(--ink)]"
              : "text-[color:var(--ink-dim)] hover:text-[color:var(--ink)]"
          }`}
        >
          {opt === "group" ? "Group" : "Twitch combined"}
        </button>
      ))}
    </div>
  );
}
