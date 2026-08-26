"use client";

import { Bar, BarChart, Cell, ResponsiveContainer } from "recharts";

export type SparkbarsProps = {
  /** Up to ~12 datapoints. */
  values: number[];
  /** Optional per-bar accent (CSS color). Defaults to brand red. */
  colors?: string[];
  /** Bar height ceiling in px. */
  height?: number;
  className?: string;
};

/**
 * Tiny bar chart for boast-numbers, rendered with recharts so it matches
 * the rest of the Untitled UI chart surface. Designed to sit *under* a
 * counter / metric, not as a standalone chart — no axes, no ticks, just
 * the shape. Respects prefers-reduced-motion via recharts' built-in
 * animation (kept short and disabled at the container level).
 */
export function Sparkbars({ values, colors, height = 36, className = "" }: SparkbarsProps) {
  if (values.length === 0) return null;
  const data = values.map((v, i) => ({ i, v: Math.max(0, v) }));
  const fallback = "var(--core)";

  return (
    <div className={className} style={{ height }} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }} barCategoryGap={3}>
          <Bar dataKey="v" radius={[2, 2, 0, 0]} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.i} fill={colors?.[d.i] ?? fallback} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
