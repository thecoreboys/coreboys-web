"use client";

import { AnimatedCounter, type AnimatedCounterProps } from "@/components/ui/AnimatedCounter";
import { cn } from "@/lib/utils";

const sizeClass = {
  sm: "text-display-xs",
  md: "text-display-sm",
  lg: "text-display-md",
  xl: "text-display-lg",
} as const;

export type CounterProps = {
  value: number;
  /** Typographic scale of the value. Defaults to `md` (display-sm). */
  size?: keyof typeof sizeClass;
  /** Formatting strategy — see AnimatedCounter. */
  kind?: AnimatedCounterProps["kind"];
  format?: AnimatedCounterProps["format"];
  duration?: AnimatedCounterProps["duration"];
  prefix?: string;
  suffix?: string;
  className?: string;
};

/**
 * Display-scale count-up. A premium, drop-in metric value: big, semibold,
 * tracking-tight, tabular-nums (digits stay column-aligned), with a smooth
 * scroll-triggered ease-out. Honors prefers-reduced-motion.
 *
 * Use this when you want a standalone hero/by-the-numbers figure; use
 * <StatCard /> when you want the full icon + label + delta card.
 *
 * <Counter value={1240930} kind="compact" size="lg" />
 */
export function Counter({
  value,
  size = "md",
  kind = "compact",
  format,
  duration,
  prefix,
  suffix,
  className,
}: CounterProps) {
  return (
    <AnimatedCounter
      value={value}
      kind={kind}
      format={format}
      duration={duration}
      prefix={prefix}
      suffix={suffix}
      className={cn(
        sizeClass[size],
        "font-semibold tracking-tight text-primary",
        className,
      )}
    />
  );
}
