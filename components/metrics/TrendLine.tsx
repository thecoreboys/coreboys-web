"use client";

/**
 * Single-series SVG line chart for follower / sub trends. Auto-scales
 * Y to data range, draws a soft area fill under the line, places dots
 * at each sample point with a hover title for read-out.
 *
 * Inputs are pre-aggregated (one point per day). Empty data renders a
 * helpful "tracking starts on first snapshot" placeholder instead of
 * a blank box.
 */

import { useMemo } from "react";

export type TrendPoint = {
  /** YYYY-MM-DD */
  date: string;
  value: number;
};

export type TrendLineProps = {
  data: TrendPoint[];
  accent?: string;
  height?: number;
  /** Label for the y-axis read-out (e.g. "subs", "followers"). */
  unit?: string;
};

export function TrendLine({
  data,
  accent = "#ef4444",
  height = 200,
  unit = "",
}: TrendLineProps) {
  const layout = useMemo(() => {
    if (data.length === 0) return null;
    const xs = data.map((_, i) => i);
    const ys = data.map((d) => d.value);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const padY = Math.max(1, (maxY - minY) * 0.15);
    return {
      xs,
      ys,
      minY: Math.max(0, minY - padY),
      maxY: maxY + padY,
    };
  }, [data]);

  if (data.length === 0 || !layout) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed border-[color:var(--rule-strong)] bg-[color:var(--bg-elev)]/50 p-8 text-center"
        style={{ minHeight: height }}
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--ink-faint)]">
          Tracking starts on first snapshot — check back tomorrow
        </p>
      </div>
    );
  }

  if (data.length === 1) {
    // One point isn't a line yet — render the value as a hero number
    // so the tile still feels complete.
    const only = data[0]!;
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-[color:var(--rule)] bg-[color:var(--bg-elev)]/50 p-8 text-center"
        style={{ minHeight: height }}
      >
        <p className="text-[32px] font-bold tabular-nums text-[color:var(--ink)] md:text-[42px]">
          {only.value.toLocaleString("en-US")}
          {unit ? <span className="ml-2 text-[14px] font-medium text-[color:var(--ink-dim)]">{unit}</span> : null}
        </p>
      </div>
    );
  }

  const W = 600;
  const H = height;
  const PAD = { left: 8, right: 8, top: 12, bottom: 18 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const x = (i: number) => PAD.left + (innerW * i) / (data.length - 1);
  const y = (v: number) => {
    const range = layout.maxY - layout.minY;
    if (range === 0) return PAD.top + innerH / 2;
    return PAD.top + innerH * (1 - (v - layout.minY) / range);
  };

  const linePath = data
    .map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(d.value).toFixed(1)}`)
    .join(" ");
  const areaPath =
    `${linePath} L${x(data.length - 1).toFixed(1)} ${(PAD.top + innerH).toFixed(1)} ` +
    `L${x(0).toFixed(1)} ${(PAD.top + innerH).toFixed(1)} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="block w-full"
      style={{ height }}
      role="img"
      aria-label={`Trend, ${data.length} samples`}
    >
      <defs>
        <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.32" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#trend-fill)" />
      <path
        d={linePath}
        fill="none"
        stroke={accent}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {data.map((d, i) => (
        <circle key={d.date} cx={x(i)} cy={y(d.value)} r={2.2} fill={accent}>
          <title>
            {d.date}: {d.value.toLocaleString("en-US")}
            {unit ? ` ${unit}` : ""}
          </title>
        </circle>
      ))}
    </svg>
  );
}
