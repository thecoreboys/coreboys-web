"use client";

import type { FC, ReactNode } from "react";
import { MetricCard } from "@/components/metrics/MetricCard";
import { AnimatedCounter, type AnimatedCounterProps } from "@/components/ui/AnimatedCounter";

/**
 * Premium drop-in stat card for the follower / sub counters centerpiece.
 *
 * Thin sugar over <MetricCard />: pass a raw numeric `value` and it wires
 * up the scroll-triggered <AnimatedCounter /> count-up for you, so page
 * agents don't have to compose the animation themselves. All the corporate
 * card chrome (FeaturedIcon / platform glyph + label + big tabular value +
 * optional delta chip, ring-1 ring-inset ring-secondary, rounded-2xl,
 * shadow-xs → hover shadow-lg + lift) comes from MetricCard.
 *
 * <StatCard
 *   icon={<SocialIcon platform="youtube" size={18} />}
 *   label="YouTube subscribers"
 *   value={1240930}
 *   kind="compact"
 *   delta="+4.2%"
 *   trend="up"
 *   accent="#FF0000"
 *   href="https://youtube.com/@..."
 * />
 *
 * Pass `animate={false}` to render the formatted value statically (e.g.
 * server components / streaming live numbers handled elsewhere).
 */
export type StatCardProps = {
  icon?: FC<{ className?: string }> | ReactNode;
  label: string;
  /** Raw number — animated up on scroll into view. */
  value: number;
  /** Count-up formatting. Defaults to `compact` (12.4M / 4.2k). */
  kind?: AnimatedCounterProps["kind"];
  format?: AnimatedCounterProps["format"];
  duration?: AnimatedCounterProps["duration"];
  /** Disable the count-up; show the formatted final value immediately. */
  animate?: boolean;
  unit?: string;
  delta?: string;
  trend?: "up" | "down" | "neutral";
  accent?: string;
  href?: string;
  chart?: ReactNode;
  className?: string;
};

export function StatCard({
  icon,
  label,
  value,
  kind = "compact",
  format,
  duration,
  animate = true,
  unit,
  delta,
  trend,
  accent,
  href,
  chart,
  className,
}: StatCardProps) {
  const node = animate ? (
    <AnimatedCounter value={value} kind={kind} format={format} duration={duration} />
  ) : (
    (format ?? defaultFormat(kind))(value)
  );

  return (
    <MetricCard
      icon={icon}
      label={label}
      value={node}
      unit={unit}
      delta={delta}
      trend={trend}
      accent={accent}
      href={href}
      chart={chart}
      className={className}
    />
  );
}

function defaultFormat(kind: AnimatedCounterProps["kind"]): (n: number) => string {
  if (kind === "round") return (n) => Math.round(n).toString();
  if (kind === "comma") return (n) => Math.round(n).toLocaleString("en-US");
  return (n) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return Math.round(n).toLocaleString("en-US");
  };
}
