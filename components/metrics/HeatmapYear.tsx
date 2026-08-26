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

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

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
const DAY_MS = 86_400_000;

type PlainDate = {
  year: number;
  month: number;
  day: number;
};

function plainDateKey(date: PlainDate): string {
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

function parsePlainDate(value: string): PlainDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() + 1 !== month ||
    probe.getUTCDate() !== day
  ) return null;
  return { year, month, day };
}

function epochDay(date: PlainDate): number {
  return Math.floor(Date.UTC(date.year, date.month - 1, date.day) / DAY_MS);
}

function plainDateFromEpochDay(value: number): PlainDate {
  const date = new Date(value * DAY_MS);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function plainDayOfWeek(date: PlainDate): number {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

function browserDateKey(date: Date): string {
  return plainDateKey({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  });
}

function formatPlainDate(value: string, options: Intl.DateTimeFormatOptions): string {
  const date = parsePlainDate(value);
  if (!date) return value;
  // Noon UTC plus an explicit UTC formatter preserves the plain calendar date
  // in every browser timezone. This is presentation only, not an instant.
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(
    new Date(Date.UTC(date.year, date.month - 1, date.day, 12)),
  );
}

export function HeatmapYear({
  byDate,
  year,
  colorBy = "delta",
  accent = "#db0368",
  deltaThresholds,
}: HeatmapYearProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const todayKey = mounted ? browserDateKey(new Date()) : null;
  const [hover, setHover] = useState<{
    date: string;
    /** viewport coords (px) — paired with `position: fixed` */
    cx: number;
    top: number;
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

    const yr = year ?? (todayKey ? Number(todayKey.slice(0, 4)) : new Date().getUTCFullYear());
    // Anchor to Jan 1 of the calendar year, snap back to previous Sunday
    // so all 7 rows are filled. End at Dec 31 (or today, if `yr` is the
    // current year and we want the future days dimmed).
    const yearStart: PlainDate = { year: yr, month: 1, day: 1 };
    const yearEnd: PlainDate = { year: yr, month: 12, day: 31 };
    const startEpochDay = epochDay(yearStart) - plainDayOfWeek(yearStart);
    const totalCells = epochDay(yearEnd) - startEpochDay + 1;

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
      const date = plainDateFromEpochDay(startEpochDay + i);
      const iso = plainDateKey(date);
      const inYear = date.year === yr;
      const data = byDate.get(iso);
      const sample = colorBy === "delta" ? data?.delta ?? 0 : data?.value ?? 0;
      // Anything strictly > 0 must show some color so a "lightest stream
      // day" never looks identical to a no-data day. Quartile thresholds
      // then split the upper tiers.
      let bucket = 0;
      if (sample > 0) bucket = 1;
      if (sample > thresholds[0]) bucket = 2;
      if (sample > thresholds[1]) bucket = 3;
      if (sample > thresholds[2]) bucket = 4;
      out.push({
        date: iso,
        day: plainDayOfWeek(date),
        week: Math.floor(i / 7),
        bucket: inYear ? bucket : -1, // -1 → render as out-of-year placeholder
        isPast: todayKey === null || iso <= todayKey,
        data,
      });
    }
    return out;
  }, [byDate, year, colorBy, deltaThresholds, todayKey]);

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
    const month = parsePlainDate(c.date)?.month ?? -1;
    if (month !== lastMonth) {
      monthLabels.push({
        x: LABEL_W + c.week * (SQUARE + GAP),
        label: formatPlainDate(c.date, { month: "short" }),
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
        className="overflow-x-auto"
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
            const dayLabel = formatPlainDate(c.date, {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
            });
            const isToday = c.date === todayKey;
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
                    const rr = (e.target as SVGRectElement).getBoundingClientRect();
                    setHover({
                      date: c.date,
                      cx: rr.left + rr.width / 2,
                      top: rr.top,
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
      </div>
      {/* Portal the tooltip to <body> so it sits above the entire page,
          not inside the heatmap's overflow-x-auto wrapper (which would
          clip it as the cursor approaches the next member's row). */}
      {mounted && hover
        ? createPortal(
            <div
              role="tooltip"
              className="pointer-events-none fixed z-[9999] -translate-x-1/2 -translate-y-full rounded-lg bg-secondary px-3 py-2 ring-1 ring-inset ring-secondary shadow-[0_18px_40px_-12px_rgba(0,0,0,0.85)] backdrop-blur-md"
              style={{ left: hover.cx, top: hover.top - 8, minWidth: 180 }}
            >
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-quaternary">
                {hover.label}
                {hover.isToday ? " · today" : ""}
                {hover.isFuture ? " · upcoming" : ""}
              </p>
              {hover.body ? (
                <p className="mt-1 whitespace-pre-line text-sm leading-snug text-primary">
                  {hover.body}
                </p>
              ) : (
                <p className="mt-1 text-sm leading-snug text-primary">
                  <span className="font-semibold tabular-nums">
                    {hover.value.toLocaleString("en-US")}
                  </span>
                  {hover.delta != null ? (
                    <span
                      className="ml-2 text-xs tabular-nums"
                      style={{ color: hover.delta >= 0 ? "var(--core)" : "var(--ink-dim)" }}
                    >
                      {hover.delta > 0 ? "+" : ""}
                      {hover.delta.toLocaleString("en-US")}
                    </span>
                  ) : null}
                </p>
              )}
              {hover.stats && hover.stats.length > 0 ? (
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                  {hover.stats.map((s) => (
                    <div key={s.label} className="contents">
                      <dt className="text-quaternary">{s.label}</dt>
                      <dd className="text-right tabular-nums text-primary">
                        {s.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </div>,
            document.body,
          )
        : null}
      {/* Color-scale legend — five buckets matching bucketColor(). */}
      <div className="flex items-center gap-1.5 self-end text-xs uppercase tracking-[0.14em] text-quaternary">
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
