"use client";

import { animate, useInView, useMotionValue, useTransform, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

export type AnimatedCounterProps = {
  value: number;
  /** Built-in formatter. `compact` → 12.4M / 4.2k / 821 · `round` → 210. */
  kind?: "compact" | "round";
  /** Animation duration in seconds. */
  duration?: number;
  className?: string;
};

const compactFormat = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return Math.round(n).toLocaleString("en-US");
};

const roundFormat = (n: number): string => Math.round(n).toString();

/**
 * Boasts a number — animates from 0 → `value` once when the element
 * enters the viewport. Tabular-numbers + monospace tracking keeps the
 * display steady while ticking. Powered by framer-motion's `animate`.
 */
export function AnimatedCounter({
  value,
  kind = "compact",
  duration = 1.6,
  className = "",
}: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const format = kind === "round" ? roundFormat : compactFormat;
  const [display, setDisplay] = useState(format(0));
  const motionValue = useMotionValue(0);
  const rounded = useTransform(motionValue, (v) => format(v));

  useEffect(() => {
    if (!inView) return;
    const controls = animate(motionValue, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(format(v)),
    });
    return () => controls.stop();
  }, [inView, value, duration, motionValue, format]);

  void rounded;

  return (
    <motion.span ref={ref} className={`tabular-nums ${className}`}>
      {display}
    </motion.span>
  );
}
