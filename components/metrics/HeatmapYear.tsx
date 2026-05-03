"use client";

/**
 * GitHub-style 365-day activity grid. One square per day, colored by
 * the day's snapshot value (or follower delta vs the prior day).
 * Renders as plain SVG so we don't pay for a chart library.
 *
 * Layout: 53 columns × 7 rows (Sunday-anchored), oldest left → newest
 * right. Days outside the year window are dimmed but still rendered to
 * keep the grid rectangular.
 */

import { useMemo, useRef, useState } from "react";

export type HeatmapDay = {
  /** YYYY-MM-DD */
  date: string;
  /** Today's count for the metric being visualised. */
  value: number;
  /** Optional delta vs prior day — used for coloring growth charts. */
  delta?: number;
  /**
   * Optional pre-formatted hover string. When set, replaces the default
   * value/delta tooltip (used by the consistency grid to show
   * "X went live for Yh Zm").
   */
  hover?: string;
  /** Optional structured analytics rows shown in the rich tooltip. */
  stats?: Array<{ label: string; value: string }>;
};

export type HeatmapYearProps = {
  /** Sparse map of date → bucket. Missing days render as empty. */
  byDate: Map<string, HeatmapDay>;
  /**
   * Calendar year to render. The grid covers Jan 1 → Dec 31 of this
   * year (Sunday-anchored, 53 columns × 7 rows). Default: current
   * year. The first column is the week containing Jan 1.
   */
  year?: number;
  /** Color the square based on `delta` (growth) or `value` (absolute). */
  colorBy?: "delta" | "value";
  /** Brand color to use for the highest bucket. */
  accent?: string;
  /** Optional pre-computed bucket thresholds for `delta` coloring. */
  deltaThresholds?: [number, number, number, number];
};

const SQUARE = 12;
const GAP = 2;

export function HeatmapYear({
  byDate,
  year,
  colorBy = "delta",
  accent = "#ef4444",
  deltaThresholds,
}: HeatmapYearProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<{
    date: string;
    x: number;
    y: number;
    label: string;
    value: number;
    delta?: number;
    body?: string;
    stats?: Array<{ label: string; value: string }>;
    isToday: boolean;
    isFuture: boolean;
    bucket: number;
  } | null>(null);

  const cells = useMemo(() => {
    const out: Array<{
      date: string;
      day: number;
      week: number;
      bucket: number;
      isPast: boolean;
      data: HeatmapDay | undefined;
    }> = [];

    const yr = year ?? new Date().getFullYear();
    // Anchor to Jan 1 of the calendar year, snap back to previous Sunday
    // so all 7 rows are filled. End at Dec 31 (or today, if `yr` is the
    // current year and we want the future days dimmed).
    const yearStart = new Date(yr, 0, 1);
    const yearEnd = new Date(yr, 11, 31);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(yearStart);
    start.setDate(start.getDate() - start.getDay());
    const totalCells =
      Math.ceil(((yearEnd.getTime() - start.getTime()) / 86_400_000) + 1);

    // Bucketize coloring against the visible window only.
    const values: number[] = [];
    for (const v of byDate.values()) {
      const candidate = colorBy === "delta" ? v.delta ?? 0 : v.value;
      if (candidate > 0) values.push(candidate);
    }
    const sorted = [...values].sort((a, b) => a - b);
    const q = (p: number) =>
      sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]!;
    const thresholds: [number, number, number, number] =
      deltaThresholds ?? [q(0.25), q(0.5), q(0.75), q(0.9)];

    for (let i = 0; i < totalCells; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
      const inYear = d.getFullYear() === yr;
      const data = byDate.get(iso);
      const sample = colorBy === "delta" ? data?.delta ?? 0 : data?.value ?? 0;
      let bucket = 0;
      if (sample > thresholds[0]) bucket = 1;
      if (sample > thresholds[1]) bucket = 2;
      if (sample > thresholds[2]) bucket = 3;
      if (sample > thresholds[3]) bucket = 4;
      out.push({
        date: iso,
        day: d.getDay(),
        week: Math.floor(i / 7),
        bucket: inYear ? bucket : -1, // -1 → render as out-of-year placeholder
        isPast: d <= today,
        data,
      });
    }
    return out;
  }, [byDate, year, colorBy, deltaThresholds]);

  const weeksWide = (cells[cells.length - 1]?.week ?? 0) + 1;
  // Reserve 24px on the left for the Sun..Sat row labels. Month labels
  // get 14px of vertical headroom up top.
  const LABEL_W = 24;
  const HEADER_H = 14;
  const w = LABEL_W + weeksWide * (SQUARE + GAP);
  const h = HEADER_H + 7 * (SQUARE + GAP);

  // Month labels along the top edge — shown when the column is the first
  // of a new month.
  const monthLabels: Array<{ x: number; label: string }> = [];
  let lastMonth = -1;
  for (const c of cells) {
    if (c.day !== 0) continue; // only check first row per column
    if (c.bucket === -1) continue; // skip pre-Jan padding
    const month = new Date(c.date).getMonth();
    if (month !== lastMonth) {
      monthLabels.push({
        x: LABEL_W + c.week * (SQUARE + GAP),
        label: new Date(c.date).toLocaleString("en-US", { month: "short" }),
      });
      lastMonth = month;
    }
  }

  // Mon / Wed / Fri labels — same convention as GitHub. Shown left of
  // the grid, vertically aligned to their row center.
  const DOW_LABELS: Array<{ row: number; label: string }> = [
    { row: 1, label: "Mon" },
    { row: 3, label: "Wed" },
    { row: 5, label: "Fri" },
  ];

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={wrapperRef}
        className="relative overflow-x-auto"
        onMouseLeave={() => setHover(null)}
      >
        <svg
        width={w}
        height={h}
        role="img"
        aria-label="Daily activity heatmap"
        className="block"
      >
        {monthLabels.map((m) => (
          <text
            key={`${m.x}-${m.label}`}
            x={m.x}
            y={10}
            className="fill-[color:var(--ink-faint)]"
            fontSize={9}
            fontFamily="var(--font-mono)"
          >
            {m.label}
          </text>
        ))}
        <g transform={`translate(0, ${HEADER_H})`}>
          {DOW_LABELS.map((l) => (
            <text
              key={l.label}
              x={0}
              y={l.row * (SQUARE + GAP) + 9}
              className="fill-[color:var(--ink-faint)]"
              fontSize={9}
              fontFamily="var(--font-mono)"
            >
              {l.label}
            </text>
          ))}
        </g>
        <g transform={`translate(${LABEL_W}, ${HEADER_H})`}>
          {cells.map((c) => {
            if (c.bucket === -1) return null; // out-of-year padding
            const x = c.week * (SQUARE + GAP);
            const y = c.day * (SQUARE + GAP);
            const fill = bucketColor(c.bucket, accent, !c.isPast);
            const dayLabel = new Date(c.date).toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
            });
            const isToday = c.date === todayIso();
            const isHovered = hover?.date === c.date;
            return (
              <g key={c.date} className="heatmap-cell">
                <rect
                  x={x}
                  y={y}
                  width={SQUARE}
                  height={SQUARE}
                  rx={2}
                  fill={fill}
                  stroke={isHovered ? "var(--ink)" : isToday ? "var(--ink)" : "transparent"}
                  strokeWidth={isHovered ? 1.5 : isToday ? 1.4 : 0}
                  className="cursor-pointer transition-[stroke-width,stroke]"
                  onMouseEnter={(e) => {
                    const wrap = wrapperRef.current;
                    if (!wrap) return;
                    const wr = wrap.getBoundingClientRect();
                    const rr = (e.target as SVGRectElement).getBoundingClientRect();
                    setHover({
                      date: c.date,
                      x: rr.left - wr.left + rr.width / 2 + wrap.scrollLeft,
                      y: rr.top - wr.top,
                      label: dayLabel,
                      value: c.data?.value ?? 0,
                      delta: c.data?.delta,
                      body: c.data?.hover,
                      stats: c.data?.stats,
                      isToday,
                      isFuture: !c.isPast,
                      bucket: c.bucket,
                    });
                  }}
                />
              </g>
            );
          })}
        </g>
      </svg>
      {hover ? (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-full rounded-md border border-[color:var(--rule-strong)] bg-[color:var(--bg-elev)]/95 px-3 py-2 shadow-[0_12px_30px_-12px_rgba(0,0,0,0.7)] backdrop-blur-md"
          style={{ left: hover.x, top: hover.y - 8, minWidth: 180 }}
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--ink-faint)]">
            {hover.label}
            {hover.isToday ? " · today" : ""}
            {hover.isFuture ? " · upcoming" : ""}
          </p>
          {hover.body ? (
            <p className="mt-1 whitespace-pre-line text-[12px] leading-snug text-[color:var(--ink)]">
              {hover.body}
            </p>
          ) : (
            <p className="mt-1 text-[12px] leading-snug text-[color:var(--ink)]">
              <span className="font-bold tabular-nums">
                {hover.value.toLocaleString("en-US")}
              </span>
              {hover.delta != null ? (
                <span
                  className="ml-2 font-mono text-[11px] tabular-nums"
                  style={{ color: hover.delta >= 0 ? "var(--core)" : "var(--ink-dim)" }}
                >
                  {hover.delta > 0 ? "+" : ""}
                  {hover.delta.toLocaleString("en-US")}
                </span>
              ) : null}
            </p>
          )}
          {hover.stats && hover.stats.length > 0 ? (
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[10px]">
              {hover.stats.map((s) => (
                <div key={s.label} className="contents">
                  <dt className="text-[color:var(--ink-faint)]">{s.label}</dt>
                  <dd className="text-right tabular-nums text-[color:var(--ink)]">
                    {s.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      ) : null}
      </div>
      {/* Color-scale legend — five buckets matching bucketColor(). */}
      <div className="flex items-center gap-1.5 self-end font-mono text-[9px] uppercase tracking-[0.18em] text-[color:var(--ink-faint)]">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((b) => (
          <span
            key={b}
            aria-hidden
            className="block h-3 w-3 rounded-[2px]"
            style={{ background: bucketColor(b, accent, false) }}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function bucketColor(bucket: number, accent: string, isFuture: boolean): string {
  if (isFuture) return "color-mix(in oklab, var(--ink) 3%, transparent)";
  switch (bucket) {
    case 0: return "color-mix(in oklab, var(--ink) 6%, transparent)";
    case 1: return `color-mix(in oklab, ${accent} 25%, transparent)`;
    case 2: return `color-mix(in oklab, ${accent} 50%, transparent)`;
    case 3: return `color-mix(in oklab, ${accent} 75%, transparent)`;
    default: return accent;
  }
}
