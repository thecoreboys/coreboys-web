"use client";

import { animate, useInView, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

export type AnimatedCounterProps = {
  value: number;
  /**
   * Built-in formatter:
   * - `compact` → 12.4M / 4.2k / 821
   * - `round`   → 210
   * - `comma`   → 1,204,930 (full value, grouped)
   * Or pass a custom `format` to override entirely.
   */
  kind?: "compact" | "round" | "comma";
  /** Custom formatter — takes precedence over `kind`. */
  format?: (n: number) => string;
  /** Animation duration in seconds. */
  duration?: number;
  /** Optional prefix/suffix rendered inside the span (e.g. "+", "%"). */
  prefix?: string;
  suffix?: string;
  className?: string;
};

const compactFormat = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return Math.round(n).toLocaleString("en-US");
};

const roundFormat = (n: number): string => Math.round(n).toString();
const commaFormat = (n: number): string => Math.round(n).toLocaleString("en-US");

function resolveFormat(
  kind: AnimatedCounterProps["kind"],
  custom?: (n: number) => string,
): (n: number) => string {
  if (custom) return custom;
  if (kind === "round") return roundFormat;
  if (kind === "comma") return commaFormat;
  return compactFormat;
}

/**
 * Premium count-up. Animates 0 → `value` once the element scrolls into
 * view (IntersectionObserver via framer-motion's `useInView`), eased with
 * a smooth ease-out so the ticking decelerates into the final number.
 *
 * - `tabular-nums` keeps digits column-aligned so the value doesn't jitter.
 * - Respects `prefers-reduced-motion`: shows the final value instantly.
 *
 * The value text is left out of the DOM until measured so the count-up is
 * always seen starting from 0 (no flash of the final number).
 */
export function AnimatedCounter({
  value,
  kind = "compact",
  format: customFormat,
  duration = 1.8,
  prefix,
  suffix,
  className = "",
}: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const reduceMotion = useReducedMotion();
  const format = resolveFormat(kind, customFormat);
  const [display, setDisplay] = useState(() => format(0));

  useEffect(() => {
    if (!inView) return;

    if (reduceMotion || duration <= 0) {
      setDisplay(format(value));
      return;
    }

    const controls = animate(0, value, {
      duration,
      // expo-out: fast start, long graceful settle — premium, not bouncy.
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(format(v)),
    });
    return () => controls.stop();
  }, [inView, value, duration, format, reduceMotion]);

  return (
    <span
      ref={ref}
      className={`tabular-nums ${className}`}
      aria-label={`${prefix ?? ""}${format(value)}${suffix ?? ""}`}
    >
      {prefix}
      {display}
      {suffix}
    </span>
  );
}
