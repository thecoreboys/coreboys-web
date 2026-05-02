"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animated counter — eases from the previous render's value to the new
 * target over `durationMs`. When `prefers-reduced-motion` is set, jumps
 * instantly. Used by the live bar, hero overlay, and stats strip so
 * viewer counts feel like a control center, not a static page.
 *
 * Format is up to the caller (we don't bake `K` / `M` here so the same
 * component works for tiny counts and millions).
 */
export function AnimatedNumber({
  value,
  format = (n) => Math.round(n).toLocaleString("en-US"),
  durationMs = 800,
  className,
  ariaLabel,
}: {
  value: number;
  format?: (n: number) => string;
  durationMs?: number;
  className?: string;
  ariaLabel?: string;
}) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || durationMs <= 0) {
      setDisplay(value);
      fromRef.current = value;
      return;
    }

    fromRef.current = display;
    startRef.current = null;

    function step(ts: number) {
      if (startRef.current == null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const t = Math.min(1, elapsed / durationMs);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      const next = fromRef.current + (value - fromRef.current) * eased;
      setDisplay(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = value;
      }
    }

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
    // We deliberately omit `display` from deps — we only ease on `value` change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, durationMs]);

  return (
    <span
      className={className}
      aria-label={ariaLabel}
      aria-live={ariaLabel ? "polite" : undefined}
    >
      {format(display)}
    </span>
  );
}
