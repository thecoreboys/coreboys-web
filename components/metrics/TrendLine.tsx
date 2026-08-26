"use client";

/**
 * Single-series area/line chart for follower / sub trends. Built on
 * Untitled UI's recharts foundation (ChartTooltipContent / ChartActiveDot)
 * so it carries proper axes, gridlines, a branded tooltip and a soft
 * gradient area fill.
 *
 * Inputs are pre-aggregated (one point per day). Empty data renders a
 * helpful "tracking starts on first snapshot" placeholder instead of
 * a blank box. A single point renders as a hero number.
 *
 * Public API is unchanged from the previous bespoke SVG version
 * (`data`, `accent`, `height`, `unit`) so every call site keeps working.
 */

import { useId, useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartActiveDot, ChartTooltipContent } from "@/components/application/charts/charts-base";

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

function formatTick(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString("en-US");
}

function formatAxisDate(value: string): string {
  // Accepts YYYY-MM-DD or YYYY-MM-DDTHH:MM.
  const d = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function TrendLine({
  data,
  accent = "#db0368",
  height = 240,
  unit = "",
}: TrendLineProps) {
  const gradientId = useId().replace(/:/g, "");

  const domain = useMemo<[number, number]>(() => {
    if (data.length === 0) return [0, 1];
    const ys = data.map((d) => d.value);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const pad = Math.max(1, (maxY - minY) * 0.15);
    return [Math.max(0, Math.floor(minY - pad)), Math.ceil(maxY + pad)];
  }, [data]);

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-dashed border-secondary bg-secondary/50 p-8 text-center"
        style={{ minHeight: height }}
      >
        <p className="text-xs font-medium text-tertiary">
          Tracking starts on first snapshot — check back tomorrow
        </p>
      </div>
    );
  }

  if (data.length === 1) {
    const only = data[0]!;
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-secondary bg-secondary/50 p-8 text-center"
        style={{ minHeight: height }}
      >
        <p className="text-display-sm font-semibold tabular-nums text-primary md:text-display-md">
          {only.value.toLocaleString("en-US")}
          {unit ? <span className="ml-2 text-lg font-medium text-tertiary">{unit}</span> : null}
        </p>
      </div>
    );
  }

  return (
    <div style={{ height }} aria-label={`Trend, ${data.length} samples${unit ? ` (${unit})` : ""}`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`trend-fill-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accent} stopOpacity={0.28} />
              <stop offset="100%" stopColor={accent} stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid vertical={false} stroke="currentColor" className="text-utility-gray-200" strokeDasharray="3 3" />

          <XAxis
            dataKey="date"
            tickFormatter={formatAxisDate}
            tickLine={false}
            axisLine={false}
            minTickGap={32}
            tick={{ className: "text-xs font-medium text-tertiary" }}
            fill="currentColor"
            interval="preserveStartEnd"
          />
          <YAxis
            width={44}
            tickFormatter={formatTick}
            domain={domain}
            tickLine={false}
            axisLine={false}
            tick={{ className: "text-xs font-medium text-tertiary" }}
            fill="currentColor"
          />

          <Tooltip
            isAnimationActive={false}
            cursor={{ stroke: accent, strokeWidth: 1, strokeOpacity: 0.4 }}
            content={
              <ChartTooltipContent
                labelFormatter={(label) => formatAxisDate(String(label))}
                formatter={(value) => `${Number(value).toLocaleString("en-US")}${unit ? ` ${unit}` : ""}`}
              />
            }
          />

          <Area
            isAnimationActive={false}
            type="monotone"
            dataKey="value"
            name={unit || "value"}
            stroke={accent}
            strokeWidth={2}
            fill={`url(#trend-fill-${gradientId})`}
            activeDot={<ChartActiveDot />}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
